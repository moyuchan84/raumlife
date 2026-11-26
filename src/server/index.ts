import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import { Room, type Hub } from './room';

interface Client {
  session: string;
  name: string;
  ws: WebSocket | null;
  room: Room | null;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

export function startServer(port = Number(process.env.PORT ?? 3000), staticDir?: string) {
  const root = staticDir ?? join(fileURLToPath(new URL('.', import.meta.url)), '../../dist/client');
  const clients = new Map<string, Client>(); // session → client
  const rooms = new Map<string, Room>();

  const hub: Hub = {
    send(session, msg) {
      const c = clients.get(session);
      if (c?.ws && c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
    },
  };
  const sendTo = (c: Client, msg: ServerMsg) => hub.send(c.session, msg);
  const err = (c: Client, message: string) => sendTo(c, { t: 'error', message });

  function newCode(): string {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    for (;;) {
      const code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
      if (!rooms.has(code)) return code;
    }
  }

  function onEmpty(room: Room) {
    rooms.delete(room.code);
    for (const c of clients.values()) if (c.room === room) c.room = null;
  }

  const http = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      if (url.pathname === '/healthz') {
        res.writeHead(200).end('ok');
        return;
      }
      let rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
      if (rel === '/' || rel === '\\') rel = '/index.html';
      const data = await readFile(join(root, rel));
      res.writeHead(200, { 'content-type': MIME[extname(rel)] ?? 'application/octet-stream' }).end(data);
    } catch {
      res.writeHead(404).end('not found');
    }
  });

  const wss = new WebSocketServer({ server: http, maxPayload: 16 * 1024 });

  wss.on('connection', (ws) => {
    let client: Client | null = null;

    ws.on('message', (raw) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.t === 'hello') {
        const name = String(msg.name ?? '').trim().slice(0, 12) || '손님';
        const existing = msg.session ? clients.get(msg.session) : undefined;
        if (existing) {
          if (existing.ws && existing.ws !== ws) existing.ws.close(); // 다른 탭/기기에서 다시 접속한 경우만
          existing.ws = ws;
          existing.name = name;
          client = existing;
        } else {
          const session = randomBytes(12).toString('hex');
          client = { session, name, ws, room: null };
          clients.set(session, client);
        }
        sendTo(client, { t: 'welcome', session: client.session, name });
        if (client.room) {
          const e = client.room.join(client.session, name); // 재접속
          if (e) err(client, e);
        } else {
          sendTo(client, { t: 'lobby', room: null });
        }
        return;
      }
      if (!client) return;
      const c = client;
      switch (msg.t) {
        case 'createRoom': {
          if (c.room) return;
          const room = new Room(newCode(), hub, onEmpty);
          rooms.set(room.code, room);
          c.room = room;
          room.join(c.session, c.name);
          break;
        }
        case 'joinRoom': {
          if (c.room) return;
          const room = rooms.get(String(msg.code ?? '').toUpperCase().trim());
          if (!room) return err(c, '그런 방이 없습니다');
          const e = room.join(c.session, c.name);
          if (e) return err(c, e);
          c.room = room;
          break;
        }
        case 'leaveRoom': {
          const room = c.room;
          if (!room) return;
          c.room = null;
          room.leave(c.session);
          sendTo(c, { t: 'lobby', room: null });
          break;
        }
        case 'settings': {
          const e = c.room?.configure(c.session, msg.settings ?? {});
          if (e) err(c, e);
          break;
        }
        case 'token': {
          const e = c.room?.setToken(c.session, msg.token);
          if (e) err(c, e);
          break;
        }
        case 'addBot': {
          const e = c.room?.addBot(c.session, msg.kind);
          if (e) err(c, e);
          break;
        }
        case 'removeSeat': {
          const e = c.room?.removeSeat(c.session, Number(msg.seat));
          if (e) err(c, e);
          break;
        }
        case 'setTeam':
          c.room?.setTeam(c.session, Number(msg.seat), Number(msg.team));
          break;
        case 'start':
          void c.room?.start(c.session).then((e) => e && err(c, e));
          break;
        case 'answer':
          c.room?.answer(c.session, Number(msg.id), msg.value);
          break;
        case 'backToLobby':
          c.room?.broadcastLobby();
          break;
      }
    });

    ws.on('close', () => {
      if (!client || client.ws !== ws) return;
      client.ws = null;
      client.room?.disconnect(client.session);
      // 방이 없는 연결은 정리 (방이 있으면 재접속을 위해 유지)
      if (!client.room) clients.delete(client.session);
    });
  });

  return new Promise<{ port: number; close: () => Promise<void>; rooms: Map<string, Room> }>((resolve) => {
    http.listen(port, () => {
      const addr = http.address();
      const p = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        port: p,
        rooms,
        close: () =>
          new Promise<void>((done) => {
            for (const c of wss.clients) c.terminate();
            wss.close(() => http.close(() => done()));
          }),
      });
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer().then(({ port }) => console.log(`인생 등산 서버: http://localhost:${port}`));
}

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { ClientMsg, LobbyState, ServerMsg, StateView } from '../src/shared/protocol';
import { DEFAULT_AVATAR, sanitizeAvatar } from '../src/shared/avatar';

process.env.PACE = '0';
const { startServer } = await import('../src/server/index');

let server: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  server = await startServer(0, '/nonexistent');
});
afterAll(async () => {
  await server.close();
});

class TestClient {
  ws!: WebSocket;
  msgs: ServerMsg[] = [];
  session = '';
  lobby: LobbyState | null = null;
  state: StateView | null = null;
  ended: Extract<ServerMsg, { t: 'ended' }> | null = null;
  errors: string[] = [];
  asked = 0;
  /** 질문에 자동으로 답할지 */
  auto = true;
  private waiters: { pred: (m: ServerMsg) => boolean; res: (m: ServerMsg) => void }[] = [];

  static async connect(name: string, session?: string): Promise<TestClient> {
    const c = new TestClient();
    c.ws = new WebSocket(`ws://localhost:${server.port}`);
    await new Promise<void>((r) => c.ws.on('open', () => r()));
    c.ws.on('message', (raw) => c.onMsg(JSON.parse(String(raw))));
    c.send({ t: 'hello', name, ...(session ? { session } : {}) });
    await c.wait((m) => m.t === 'welcome');
    return c;
  }
  private onMsg(m: ServerMsg) {
    this.msgs.push(m);
    if (m.t === 'welcome') this.session = m.session;
    if (m.t === 'lobby') this.lobby = m.room;
    if (m.t === 'state') this.state = m.state;
    if (m.t === 'ended') this.ended = m;
    if (m.t === 'error') this.errors.push(m.message);
    if (m.t === 'ask') {
      this.asked++;
      if (this.auto) this.send({ t: 'answer', id: m.id, value: answerFor(m.ask) });
    }
    for (const w of [...this.waiters]) {
      if (w.pred(m)) {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        w.res(m);
      }
    }
  }
  send(m: ClientMsg) {
    this.ws.send(JSON.stringify(m));
  }
  wait(pred: (m: ServerMsg) => boolean, ms = 8000): Promise<ServerMsg> {
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout waiting for message')), ms);
      this.waiters.push({ pred, res: (m) => (clearTimeout(t), res(m)) });
    });
  }
  async until(cond: () => boolean, ms = 8000) {
    const t0 = Date.now();
    while (!cond()) {
      if (Date.now() - t0 > ms) throw new Error('until timeout');
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  close() {
    this.ws.close();
  }
}

function answerFor(ask: Extract<ServerMsg, { t: 'ask' }>['ask']): unknown {
  switch (ask.kind) {
    case 'die': return ask.dice[0] >= ask.dice[1] ? 0 : 1;
    case 'path': return 0;
    case 'card': return ask.card.options.findIndex((o, i) => ask.states[i]!.enabled && !o.roll) >= 0 ? ask.card.options.findIndex((o, i) => ask.states[i]!.enabled && !o.roll) : ask.states.findIndex((st) => st.enabled);
    case 'boost': return 0;
    case 'reroll': return false;
    case 'pathOption': return ask.available.findIndex(Boolean);
    case 'house': return ask.offer.ready.find((h) => h.affordable && ask.offer.canBuyHome) ? { kind: 'ready', id: ask.offer.ready.find((h) => h.affordable)!.id } : null;
    case 'job': return ask.options.findIndex((o) => o.enabled);
    case 'milestone': return ask.options.findIndex((o) => o.enabled);
    case 'lodge': return false;
    case 'sabotage': return null;
  }
}

describe('로비', () => {
  it('같은 연결에서 hello 를 다시 보내도(이름 변경) 연결이 유지된다', async () => {
    const c = await TestClient.connect('처음');
    c.send({ t: 'hello', name: '바뀐이름', session: c.session });
    await c.wait((m) => m.t === 'welcome');
    c.send({ t: 'createRoom' });
    await c.until(() => c.lobby !== null);
    expect(c.lobby!.seats[0]!.name).toBe('바뀐이름');
    c.close();
  });

  it('방 생성/입장/설정/말 선택/봇 추가', async () => {
    const host = await TestClient.connect('방장');
    host.send({ t: 'createRoom' });
    await host.until(() => host.lobby !== null);
    const code = host.lobby!.code;
    expect(code).toMatch(/^[A-Z]{4}$/);
    expect(host.lobby!.seats).toHaveLength(1);
    expect(host.lobby!.you).toBe(0);

    const guest = await TestClient.connect('손님');
    guest.send({ t: 'joinRoom', code: code.toLowerCase() });
    await guest.until(() => guest.lobby !== null);
    expect(guest.lobby!.seats).toHaveLength(2);
    expect(guest.lobby!.you).toBe(1);
    expect(guest.lobby!.seats[0]!.isHost).toBe(true);

    // 아바타: 범위를 벗어난 값은 서버가 고친다
    guest.send({ t: 'avatar', avatar: { skin: 99, hairStyle: 2, face: -3, top: 1.5 } as never });
    await host.until(() => host.lobby!.seats[1]!.avatar.hairStyle === 2);
    expect(host.lobby!.seats[1]!.avatar.skin).toBe(DEFAULT_AVATAR.skin);
    expect(host.lobby!.seats[1]!.avatar.face).toBe(DEFAULT_AVATAR.face);
    expect(host.lobby!.seats[1]!.avatar.top).toBe(DEFAULT_AVATAR.top);
    // 손님은 설정 불가, 방장은 가능
    guest.send({ t: 'settings', settings: { endZone: 3 } });
    host.send({ t: 'settings', settings: { startZone: 3, endZone: 5, difficulty: 'hard' } });
    await host.until(() => host.lobby!.settings.endZone === 5);
    expect(host.lobby!.settings).toMatchObject({ startZone: 3, endZone: 5, difficulty: 'hard' });
    // 구간 보정: 시작 > 끝 이면 끝을 맞춘다
    host.send({ t: 'settings', settings: { startZone: 9 } });
    await host.until(() => host.lobby!.settings.startZone === 9);
    expect(host.lobby!.settings.endZone).toBe(9);

    // 봇은 최대 6자리까지
    for (let i = 0; i < 5; i++) host.send({ t: 'addBot', kind: 'greedy' });
    await host.until(() => host.lobby!.seats.length === 6);
    host.send({ t: 'addBot', kind: 'greedy' });
    await guest.until(() => guest.errors.some((e) => e.includes('설정')) );
    const names = new Set(host.lobby!.seats.map((s) => s.name));
    expect(names.size).toBe(6); // 봇 이름이 겹치지 않는다
    for (const seat of host.lobby!.seats) expect(sanitizeAvatar(seat.avatar)).toEqual(seat.avatar);

    // 없는 방
    const stranger = await TestClient.connect('낯선이');
    stranger.send({ t: 'joinRoom', code: 'ZZZZ' });
    await stranger.until(() => stranger.errors.length > 0);
    // 가득 찬 방
    stranger.send({ t: 'joinRoom', code });
    await stranger.until(() => stranger.errors.length > 1);
    [host, guest, stranger].forEach((c) => c.close());
  });

  it('손님은 시작할 수 없고, 혼자서는 시작할 수 없다', async () => {
    const host = await TestClient.connect('방장');
    host.send({ t: 'createRoom' });
    await host.until(() => host.lobby !== null);
    host.send({ t: 'start' });
    await host.until(() => host.errors.length > 0);
    expect(host.errors[0]).toContain('최소 2명');
    const guest = await TestClient.connect('손님');
    guest.send({ t: 'joinRoom', code: host.lobby!.code });
    await guest.until(() => guest.lobby !== null);
    guest.send({ t: 'start' });
    await guest.until(() => guest.errors.length > 0);
    expect(guest.errors[0]).toContain('방장');
    host.close();
    guest.close();
  });

  it('팀전은 두 팀이 모두 있어야 시작', async () => {
    const host = await TestClient.connect('방장');
    host.send({ t: 'createRoom' });
    await host.until(() => host.lobby !== null);
    host.send({ t: 'addBot', kind: 'greedy' });
    host.send({ t: 'settings', settings: { teams: true } });
    await host.until(() => host.lobby!.seats.length === 2 && host.lobby!.settings.teams);
    host.send({ t: 'setTeam', seat: 1, team: 0 });
    await host.until(() => host.lobby!.seats[1]!.team === 0);
    host.send({ t: 'start' });
    await host.until(() => host.errors.length > 0);
    expect(host.errors[0]).toContain('두 팀');
    host.close();
  });
});

describe('게임 진행', () => {
  it('사람 2명 + 봇 2명이 네트워크로 한 판을 끝까지 치른다', async () => {
    const a = await TestClient.connect('가');
    a.send({ t: 'createRoom' });
    await a.until(() => a.lobby !== null);
    const b = await TestClient.connect('나');
    b.send({ t: 'joinRoom', code: a.lobby!.code });
    await b.until(() => b.lobby !== null);
    a.send({ t: 'addBot', kind: 'greedy' });
    a.send({ t: 'addBot', kind: 'rusher' });
    a.send({ t: 'settings', settings: { startZone: 1, endZone: 3 } });
    await a.until(() => a.lobby!.seats.length === 4 && a.lobby!.settings.endZone === 3);

    a.send({ t: 'start' });
    await a.until(() => a.ended !== null && b.ended !== null, 15000);

    for (const c of [a, b]) {
      expect(c.msgs.some((m) => m.t === 'started')).toBe(true);
      expect(c.msgs.some((m) => m.t === 'event')).toBe(true);
      expect(c.asked).toBeGreaterThan(5);
      expect(c.ended!.result.ranking).toHaveLength(4);
    }
    const started = a.msgs.find((m) => m.t === 'started') as Extract<ServerMsg, { t: 'started' }>;
    expect(started.info.you).toBe(0);
    expect(started.info.goals.length).toBe(2); // normal 난이도
    expect((b.msgs.find((m) => m.t === 'started') as any).info.you).toBe(1);

    // 정보 가림: 진행 중 다른 사람의 정확한 스탯은 오지 않는다 (개인전)
    const midStates = a.msgs.filter((m): m is Extract<ServerMsg, { t: 'state' }> => m.t === 'state' && !m.state.finished);
    expect(midStates.length).toBeGreaterThan(5);
    for (const m of midStates) {
      expect(m.state.players[0]!.stats).not.toBeNull();
      for (const p of m.state.players.slice(1)) {
        expect(p.stats).toBeNull();
        for (const c of p.completion) expect(Math.abs(c * 10 - Math.round(c * 10))).toBeLessThan(1e-9); // 10% 단위
      }
    }
    // 종료 후에는 공개
    const last = a.state!;
    expect(last.finished).toBe(true);
    expect(last.players.every((p) => p.stats !== null)).toBe(true);

    // 종료 후 대기실로 복귀 가능
    await a.until(() => a.lobby?.inGame === false);
    expect(a.lobby!.seats).toHaveLength(4);
    a.close();
    b.close();
  });

  it('응답이 없으면 시간 초과 후 봇이 대신 결정하고, 연결이 끊겨도 게임은 계속된다', async () => {
    const a = await TestClient.connect('가');
    a.send({ t: 'createRoom' });
    await a.until(() => a.lobby !== null);
    a.send({ t: 'addBot', kind: 'greedy' });
    a.send({ t: 'settings', settings: { startZone: 1, endZone: 2, decisionSeconds: 10 } });
    await a.until(() => a.lobby!.seats.length === 2 && a.lobby!.settings.endZone === 2);
    a.auto = false; // 질문에 답하지 않음
    a.send({ t: 'start' });
    await a.until(() => a.asked > 0);
    // 연결 종료 → 즉시 봇이 대신하므로 방이 정리될 때까지 게임이 끝나야 한다
    const code = a.lobby!.code;
    const room = server.rooms.get(code)!;
    a.close();
    await new Promise<void>((resolve, reject) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (!server.rooms.has(code)) {
          clearInterval(iv);
          resolve();
        } else if (Date.now() - t0 > 10000) {
          clearInterval(iv);
          reject(new Error('room not cleaned'));
        }
      }, 20);
    });
    expect(room.inGame).toBe(false);
  });

  it('재접속하면 같은 좌석으로 돌아와 상태를 다시 받는다', async () => {
    const a = await TestClient.connect('가');
    a.send({ t: 'createRoom' });
    await a.until(() => a.lobby !== null);
    a.send({ t: 'addBot', kind: 'greedy' });
    a.send({ t: 'settings', settings: { startZone: 1, endZone: 10 } });
    await a.until(() => a.lobby!.seats.length === 2);
    a.auto = false;
    server.rooms.get(a.lobby!.code)!.pace = 0.02; // 연출을 짧게 두어 게임이 바로 끝나지 않게 한다
    a.send({ t: 'start' });
    await a.until(() => a.asked > 0);
    const session = a.session;
    a.ws.close();
    await new Promise((r) => setTimeout(r, 50));
    const a2 = await TestClient.connect('가', session);
    await a2.until(() => a2.msgs.some((m) => m.t === 'started'));
    expect(a2.session).toBe(session);
    expect(a2.lobby?.you).toBe(0);
    a2.close();
  });
});

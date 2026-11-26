import type { ClientMsg, ServerMsg } from '../shared/protocol';

export class Net {
  private ws: WebSocket | null = null;
  private retry = 0;
  private closed = false;
  onMsg: (m: ServerMsg) => void = () => {};
  onStatus: (online: boolean) => void = () => {};

  constructor(private getHello: () => ClientMsg) {}

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.onStatus(true);
      ws.send(JSON.stringify(this.getHello()));
    };
    ws.onmessage = (e) => {
      try {
        this.onMsg(JSON.parse(String(e.data)) as ServerMsg);
      } catch (err) {
        console.error(err);
      }
    };
    ws.onclose = () => {
      this.onStatus(false);
      if (this.closed) return;
      const wait = Math.min(5000, 400 * 2 ** this.retry++);
      setTimeout(() => this.connect(), wait);
    };
  }

  send(m: ClientMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
}

import type { Controller, GameEvent, GameState } from '../engine';
import { DEFAULT_TUNING, Game } from '../engine';
import { createBot } from '../ai/bots';
import type { Ask, LobbyState, RoomSettings, SeatView, ServerMsg, StartedInfo, TokenId } from '../shared/protocol';
import { BOT_KINDS, TOKENS } from '../shared/protocol';
import { FALLBACK, HumanController } from './human';
import { goalViews, stateView } from './view';

export interface Seat {
  kind: 'human' | 'bot';
  name: string;
  token: TokenId;
  team: number;
  botKind?: string;
  session?: string;
  connected: boolean;
  /** 연결이 끊긴 시각 (재접속 유예 판단용) */
  disconnectedAt?: number;
}

const RECONNECT_GRACE_MS = 60_000;

export interface Hub {
  send(session: string, msg: ServerMsg): void;
}

const MAX_SEATS = 6;
export const DEFAULT_SETTINGS: RoomSettings = {
  startZone: 1,
  endZone: 10,
  difficulty: 'normal',
  teams: false,
  decisionSeconds: 40,
};

interface Pending {
  id: number;
  seat: number;
  resolve: (v: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class Room {
  seats: Seat[] = [];
  settings: RoomSettings = { ...DEFAULT_SETTINGS };
  inGame = false;
  game: Game | null = null;
  info: StartedInfo | null = null;
  private pending = new Map<number, Pending>();
  private nextAskId = 1;
  /** 연출 속도 배율 (0 = 즉시). 테스트에서 0 으로 둔다 */
  pace = Number(process.env.PACE ?? 1);

  constructor(
    readonly code: string,
    private hub: Hub,
    private onEmpty: (room: Room) => void,
  ) {}

  // ───────── 좌석 ─────────
  hostSeat(): number {
    return this.seats.findIndex((s) => s.kind === 'human');
  }
  seatOf(session: string): number {
    return this.seats.findIndex((s) => s.session === session);
  }
  private freeToken(): TokenId {
    const used = new Set(this.seats.map((s) => s.token));
    return TOKENS.find((t) => !used.has(t.id))!.id;
  }

  join(session: string, name: string): string | null {
    const existing = this.seatOf(session);
    if (existing >= 0) {
      this.seats[existing]!.connected = true;
      delete this.seats[existing]!.disconnectedAt;
      this.seats[existing]!.name = name;
      this.broadcastLobby();
      this.resendGame(session);
      return null;
    }
    if (this.inGame) return '이미 게임이 진행 중입니다';
    if (this.seats.length >= MAX_SEATS) return '방이 가득 찼습니다 (최대 6명)';
    this.seats.push({ kind: 'human', name, token: this.freeToken(), team: this.seats.length % 2, session, connected: true });
    this.broadcastLobby();
    return null;
  }

  /** 연결이 끊김. 대기실이면 자리를 비우고, 게임 중이면 봇이 대신한다 */
  disconnect(session: string) {
    const i = this.seatOf(session);
    if (i < 0) return;
    const seat = this.seats[i]!;
    seat.connected = false;
    seat.disconnectedAt = Date.now();
    if (!this.inGame) {
      this.seats.splice(i, 1);
      this.afterSeatsChanged();
    } else {
      for (const p of [...this.pending.values()]) if (p.seat === i) this.settle(p, FALLBACK);
      this.broadcastLobby();
    }
  }

  leave(session: string) {
    const i = this.seatOf(session);
    if (i < 0) return;
    if (this.inGame) {
      this.disconnect(session);
      this.seats[i]!.session = undefined; // 다시 들어와도 같은 자리가 아니다 (봇이 계속 대신함)
      return;
    }
    this.seats.splice(i, 1);
    this.afterSeatsChanged();
  }

  private afterSeatsChanged() {
    if (!this.seats.some((s) => s.kind === 'human')) {
      this.onEmpty(this);
      return;
    }
    this.broadcastLobby();
  }

  // ───────── 방장 조작 ─────────
  private isHost(session: string) {
    return this.seatOf(session) === this.hostSeat();
  }

  configure(session: string, patch: Partial<RoomSettings>): string | null {
    if (!this.isHost(session) || this.inGame) return '방장만 대기실에서 설정할 수 있습니다';
    const s = { ...this.settings };
    if (patch.startZone !== undefined) s.startZone = Math.round(Number(patch.startZone));
    if (patch.endZone !== undefined) s.endZone = Math.round(Number(patch.endZone));
    if (patch.difficulty && ['easy', 'normal', 'hard', 'extreme'].includes(patch.difficulty)) s.difficulty = patch.difficulty;
    if (patch.teams !== undefined) s.teams = !!patch.teams;
    if (patch.decisionSeconds !== undefined) s.decisionSeconds = Math.max(10, Math.min(120, Math.round(Number(patch.decisionSeconds))));
    s.startZone = Math.max(1, Math.min(10, s.startZone));
    s.endZone = Math.max(1, Math.min(10, s.endZone));
    if (s.endZone < s.startZone) {
      if (patch.startZone !== undefined) s.endZone = s.startZone;
      else s.startZone = s.endZone;
    }
    this.settings = s;
    this.broadcastLobby();
    return null;
  }

  setToken(session: string, token: TokenId): string | null {
    const i = this.seatOf(session);
    if (i < 0 || this.inGame) return null;
    if (!TOKENS.some((t) => t.id === token)) return '알 수 없는 말입니다';
    if (this.seats.some((s, j) => j !== i && s.token === token)) return '이미 다른 플레이어가 고른 말입니다';
    this.seats[i]!.token = token;
    this.broadcastLobby();
    return null;
  }

  addBot(session: string, kind: string): string | null {
    if (!this.isHost(session) || this.inGame) return '방장만 봇을 추가할 수 있습니다';
    if (this.seats.length >= MAX_SEATS) return '방이 가득 찼습니다';
    const bk = BOT_KINDS.find((b) => b.id === kind);
    if (!bk) return '알 수 없는 봇입니다';
    const token = this.freeToken();
    const label = TOKENS.find((t) => t.id === token)!.label;
    this.seats.push({ kind: 'bot', name: `${label} (${bk.label} 봇)`, token, team: this.seats.length % 2, botKind: kind, connected: true });
    this.broadcastLobby();
    return null;
  }

  removeSeat(session: string, seat: number): string | null {
    if (!this.isHost(session) || this.inGame) return '방장만 내보낼 수 있습니다';
    const s = this.seats[seat];
    if (!s) return null;
    if (s.kind === 'human' && s.session === session) return '자기 자신은 내보낼 수 없습니다';
    if (s.kind === 'human' && s.session) this.hub.send(s.session, { t: 'lobby', room: null });
    this.seats.splice(seat, 1);
    this.broadcastLobby();
    return null;
  }

  setTeam(session: string, seat: number, team: number): string | null {
    if (this.inGame) return null;
    const mine = this.seatOf(session);
    if (!this.isHost(session) && mine !== seat) return null;
    const s = this.seats[seat];
    if (s) s.team = team === 1 ? 1 : 0;
    this.broadcastLobby();
    return null;
  }

  // ───────── 로비 전송 ─────────
  lobbyFor(session: string): LobbyState {
    const host = this.hostSeat();
    return {
      code: this.code,
      settings: this.settings,
      seats: this.seats.map<SeatView>((s, i) => ({
        kind: s.kind,
        name: s.name,
        token: s.token,
        team: s.team,
        ...(s.botKind ? { botKind: s.botKind } : {}),
        connected: s.connected,
        isHost: i === host,
      })),
      you: this.seatOf(session),
      inGame: this.inGame,
    };
  }
  broadcastLobby() {
    for (const s of this.seats) if (s.kind === 'human' && s.session) this.hub.send(s.session, { t: 'lobby', room: this.lobbyFor(s.session) });
  }

  // ───────── 게임 ─────────
  async start(session: string): Promise<string | null> {
    if (!this.isHost(session)) return '방장만 시작할 수 있습니다';
    if (this.inGame) return '이미 진행 중입니다';
    if (this.seats.length < 2) return '최소 2명(봇 포함)이 필요합니다';
    if (this.settings.teams) {
      const t = new Set(this.seats.map((s) => s.team));
      if (t.size < 2) return '팀전은 두 팀 모두 한 명 이상이어야 합니다';
    }
    this.inGame = true;
    const seed = Math.floor(Math.random() * 2 ** 31);
    const { startZone, endZone, difficulty, teams } = this.settings;
    const game = new Game(
      {
        players: this.seats.length,
        startZone,
        endZone,
        difficulty,
        seed,
        ...(teams ? { teams: this.seats.map((s) => s.team) } : {}),
      },
      { onEvent: (e) => this.onEvent(e) },
    );
    this.game = game;
    const ctrls: Controller[] = this.seats.map((seat, i) => {
      const bot = createBot(seat.botKind ?? 'greedy', seed + i * 31);
      return seat.kind === 'human' ? new HumanController(this, i, bot) : bot;
    });
    this.info = {
      board: game.state.board,
      startZone,
      endZone,
      difficulty,
      goals: goalViews(game.state),
      teams,
      you: -1,
      slotCap: Math.ceil(this.seats.length / 2),
    };
    this.broadcastLobby();
    for (const [i, seat] of this.seats.entries()) {
      if (seat.kind === 'human' && seat.session) this.sendStarted(seat.session, i);
    }
    void this.runGame(game, ctrls);
    return null;
  }

  private sendStarted(session: string, seat: number) {
    if (!this.info || !this.game) return;
    this.hub.send(session, { t: 'started', info: { ...this.info, you: seat } });
    this.hub.send(session, { t: 'state', state: stateView(this.game.state, this.seats, seat) });
  }
  /** 재접속한 사람에게 현재 상황을 다시 보낸다 */
  private resendGame(session: string) {
    if (!this.inGame) return;
    const i = this.seatOf(session);
    if (i >= 0) this.sendStarted(session, i);
  }

  private async runGame(game: Game, ctrls: Controller[]) {
    try {
      const result = await game.run(ctrls);
      this.sendAll({ t: 'ended', result });
    } catch (err) {
      console.error('게임 오류', err);
      this.sendAll({ t: 'error', message: '게임 진행 중 오류가 발생했습니다' });
    } finally {
      this.inGame = false;
      this.game = null;
      for (const p of this.pending.values()) clearTimeout(p.timer);
      this.pending.clear();
      // 끝난 뒤 연결이 끊긴 사람의 자리는 정리
      this.seats = this.seats.filter((s) => s.kind === 'bot' || (s.session && s.connected));
      if (!this.seats.some((s) => s.kind === 'human')) this.onEmpty(this);
      else this.broadcastLobby();
    }
  }

  private sendAll(msg: ServerMsg) {
    for (const s of this.seats) if (s.kind === 'human' && s.session && s.connected) this.hub.send(s.session, msg);
  }

  private async onEvent(e: GameEvent) {
    const game = this.game;
    if (!game) return;
    const humans = this.seats.map((s, i) => ({ s, i })).filter((x) => x.s.kind === 'human' && x.s.session && x.s.connected);
    for (const { s, i } of humans) {
      this.hub.send(s.session!, { t: 'event', event: e });
      this.hub.send(s.session!, { t: 'state', state: stateView(game.state, this.seats, i) });
    }
    // 방금 끊긴 사람이 돌아올 수 있으므로 유예 시간 동안은 같은 속도로 진행한다
    const watching =
      humans.length > 0 ||
      this.seats.some((s) => s.kind === 'human' && s.session && s.disconnectedAt && Date.now() - s.disconnectedAt < RECONNECT_GRACE_MS);
    if (watching && this.pace > 0) await sleep(eventDelay(e) * this.pace);
  }

  /** 사람에게 질문하고 답(또는 FALLBACK)을 기다린다 */
  ask(seatIdx: number, ask: Ask): Promise<unknown> {
    const seat = this.seats[seatIdx];
    if (!seat || seat.kind !== 'human' || !seat.session || !seat.connected) return Promise.resolve(FALLBACK);
    const id = this.nextAskId++;
    const ms = this.settings.decisionSeconds * 1000;
    return new Promise((resolve) => {
      const p: Pending = {
        id,
        seat: seatIdx,
        resolve,
        timer: setTimeout(() => this.settle(p, FALLBACK), ms),
      };
      this.pending.set(id, p);
      this.hub.send(seat.session!, { t: 'ask', id, ask, deadline: Date.now() + ms });
    });
  }

  private settle(p: Pending, value: unknown) {
    if (!this.pending.delete(p.id)) return;
    clearTimeout(p.timer);
    const seat = this.seats[p.seat];
    if (seat?.session) this.hub.send(seat.session, { t: 'askDone', id: p.id });
    p.resolve(value);
  }

  answer(session: string, id: number, value: unknown) {
    const p = this.pending.get(id);
    if (!p) return;
    if (this.seats[p.seat]?.session !== session) return;
    this.settle(p, value);
  }

  snapshot(): GameState | null {
    return this.game?.state ?? null;
  }
}

/** 이벤트 뒤에 두는 연출 시간(ms) */
function eventDelay(e: GameEvent): number {
  switch (e.t) {
    case 'roundStart': return 250;
    case 'turnStart': return 450;
    case 'rest': return 1000;
    case 'dice': return 900;
    case 'diceChosen': return 700;
    case 'move': return Math.min(2600, 300 + 330 * e.path.length);
    case 'tile': return Object.keys(e.delta).length ? 900 : 250;
    case 'card': return 2300;
    case 'weather': return 1700;
    case 'pathOption': return 900;
    case 'lodge': return 700;
    case 'sabotage': return 1400;
    case 'catchUp': return 500;
    case 'arrive': return 1800;
    case 'countdown': return 2000;
    case 'end': return 0;
  }
}

export { DEFAULT_TUNING };

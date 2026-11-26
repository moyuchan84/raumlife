import type { Difficulty, Effect, GameEvent, GameResult, JourneyCard, StatKey, Tile } from '../engine';

export const TOKENS = [
  { id: 'cat', emoji: '🐱', label: '고양이' },
  { id: 'bear', emoji: '🐻', label: '곰' },
  { id: 'robot', emoji: '🤖', label: '로봇' },
  { id: 'fox', emoji: '🦊', label: '여우' },
  { id: 'penguin', emoji: '🐧', label: '펭귄' },
  { id: 'dragon', emoji: '🐲', label: '드래곤' },
] as const;
export type TokenId = (typeof TOKENS)[number]['id'];

export const BOT_KINDS = [
  { id: 'random', label: '쉬움' },
  { id: 'greedy', label: '보통' },
  { id: 'brawler', label: '공격형' },
  { id: 'rusher', label: '속도형' },
  { id: 'builder', label: '신중형' },
] as const;

export interface RoomSettings {
  startZone: number;
  endZone: number;
  difficulty: Difficulty;
  teams: boolean;
  /** 사람의 한 번의 결정에 주어지는 시간(초) */
  decisionSeconds: number;
}

export interface SeatView {
  kind: 'human' | 'bot';
  name: string;
  token: TokenId;
  team: number;
  botKind?: string;
  connected: boolean;
  isHost: boolean;
}

export interface LobbyState {
  code: string;
  settings: RoomSettings;
  seats: SeatView[];
  you: number; // 내 좌석 번호
  inGame: boolean;
}

export interface PlayerView {
  id: number;
  name: string;
  token: TokenId;
  team: number;
  isBot: boolean;
  connected: boolean;
  pos: number;
  stamina: number;
  cp: number;
  arrived: boolean;
  arrivalRank: number;
  /** 내 것/팀원/종료 후에만 정확한 값 */
  stats: Record<StatKey, number> | null;
  /** 목표별 달성률 0..1 (남의 것은 10% 단위) */
  completion: number[];
  exact: boolean;
}

export interface GoalView {
  label: string;
  kind: 'stat' | 'condition';
  stat?: StatKey;
  target?: number;
}

export interface StateView {
  round: number;
  current: number;
  countdownLeft: number | null;
  finished: boolean;
  players: PlayerView[];
  pathSlots: Record<string, number>;
  me: number;
}

export interface StartedInfo {
  board: { tiles: Tile[]; start: number; summit: number };
  startZone: number;
  endZone: number;
  difficulty: Difficulty;
  goals: GoalView[];
  teams: boolean;
  you: number;
  slotCap: number;
}

// ───────── 결정 요청 ─────────
export type Ask =
  | { kind: 'die'; dice: [number, number]; cp: number; maxCp: number }
  | { kind: 'path'; options: { tileId: number; route: 'long' | 'short' | null; distance: number }[]; stamina: number }
  | { kind: 'card'; card: JourneyCard; canSafe: boolean; stamina: number; cp: number }
  | { kind: 'boost'; card: JourneyCard; cp: number }
  | { kind: 'reroll'; card: JourneyCard; roll: number; cost: number }
  | { kind: 'pathOption'; zone: number; names: string[]; effects: Effect[]; available: boolean[] }
  | { kind: 'lodge'; cost: number; effect: Effect; asset: number }
  | { kind: 'sabotage'; targets: number[]; free: boolean; cost: number; cp: number };

// ───────── 메시지 ─────────
export type ClientMsg =
  | { t: 'hello'; name: string; session?: string }
  | { t: 'createRoom' }
  | { t: 'joinRoom'; code: string }
  | { t: 'leaveRoom' }
  | { t: 'settings'; settings: Partial<RoomSettings> }
  | { t: 'token'; token: TokenId }
  | { t: 'addBot'; kind: string }
  | { t: 'removeSeat'; seat: number }
  | { t: 'setTeam'; seat: number; team: number }
  | { t: 'start' }
  | { t: 'answer'; id: number; value: unknown }
  | { t: 'backToLobby' };

export type ServerMsg =
  | { t: 'welcome'; session: string; name: string }
  | { t: 'lobby'; room: LobbyState | null }
  | { t: 'started'; info: StartedInfo }
  | { t: 'state'; state: StateView }
  | { t: 'event'; event: GameEvent }
  | { t: 'ask'; id: number; ask: Ask; deadline: number }
  | { t: 'askDone'; id: number }
  | { t: 'ended'; result: GameResult }
  | { t: 'error'; message: string };

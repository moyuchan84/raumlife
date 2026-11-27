import type { CardDeck, Difficulty, Effect, HouseOffer, GameEvent, GameResult, JourneyCard, JobChoice, LifeState, MilestoneChoice, OptionState, StatKey, Tile } from '../engine';
import type { Avatar } from './avatar';

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
  /** 여행 길이: 1 보통 / 2 길게 / 3 아주 길게 */
  length: 1 | 2 | 3;
  /** 사람의 한 번의 결정에 주어지는 시간(초) */
  decisionSeconds: number;
}

export interface SeatView {
  kind: 'human' | 'bot';
  name: string;
  avatar: Avatar;
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
  avatar: Avatar;
  team: number;
  isBot: boolean;
  connected: boolean;
  pos: number;
  stamina: number;
  /** 지금 구간(나이)에서의 체력 상한 */
  staminaCap: number;
  cp: number;
  life: LifeState;
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
  length: 1 | 2 | 3;
  goals: GoalView[];
  teams: boolean;
  you: number;
  slotCap: number;
}

// ───────── 결정 요청 ─────────
export type Ask =
  | { kind: 'die'; dice: [number, number]; bonus: number; cp: number; maxCp: number }
  | { kind: 'path'; options: { tileId: number; route: 'long' | 'short' | null; distance: number }[]; stamina: number }
  | { kind: 'card'; deck: CardDeck; card: JourneyCard; states: OptionState[]; stamina: number; cp: number; risky: boolean }
  | { kind: 'boost'; card: JourneyCard; option: number; cp: number; bonus: number }
  | { kind: 'reroll'; card: JourneyCard; option: number; roll: number; cost: number }
  | { kind: 'pathOption'; zone: number; names: string[]; effects: Effect[]; available: boolean[] }
  | { kind: 'job'; options: JobChoice[]; growth: number }
  | { kind: 'house'; offer: HouseOffer; onlyHome: boolean }
  | { kind: 'milestone'; zone: number; title: string; options: MilestoneChoice[]; life: LifeState; asset: number }
  | { kind: 'lodge'; cost: number; effect: Effect; asset: number }
  | { kind: 'sabotage'; targets: number[]; free: boolean; cost: number; cp: number };

// ───────── 메시지 ─────────
export type ClientMsg =
  | { t: 'hello'; name: string; session?: string; avatar?: Avatar }
  | { t: 'createRoom' }
  | { t: 'joinRoom'; code: string }
  | { t: 'leaveRoom' }
  | { t: 'settings'; settings: Partial<RoomSettings> }
  | { t: 'avatar'; avatar: Avatar }
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

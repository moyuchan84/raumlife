export type StatKey = 'asset' | 'happy' | 'network' | 'growth';
export const STAT_KEYS: readonly StatKey[] = ['asset', 'happy', 'network', 'growth'];
export const STAT_LABEL: Record<StatKey, string> = {
  asset: '💰자산',
  happy: '❤️행복',
  network: '🤝인맥',
  growth: '🌱성장',
};

/** 인생 상태: 직업·동반자·자녀·집. 카드 조건과 인생 목표에 쓰인다. */
export interface LifeState {
  /** 직업 이름 (화면 표시용) */
  career: string | null;
  /** 직업 종류 (월급 계산용). 성인이 되면 정하고, 섬을 옮길 때마다 월급을 받는다 */
  jobId: string | null;
  /** 승진·이직으로 오른 연봉 (월급에 더해진다) */
  raise: number;
  /** 직업 선택을 이미 물어봤는지 */
  jobAsked: boolean;
  partner: boolean;
  children: number;
  grandchildren: number;
  home: boolean;
}
/** 효과로 인한 인생 상태 변화 */
export interface LifeChange {
  /** 연봉 인상(승진·이직) */
  raise?: number;
  partner?: boolean;
  children?: number; // 증가량
  grandchildren?: number; // 증가량
  home?: boolean;
}
/** 카드·선택지의 조건 */
export interface Req {
  partner?: boolean;
  noPartner?: boolean;
  children?: number; // 최소 자녀 수
  childrenLt?: number; // 자녀 수가 이 값 미만
  grandchildren?: number;
  grandchildrenLt?: number;
  home?: boolean;
  noHome?: boolean;
  career?: boolean;
  noCareer?: boolean;
  family?: boolean; // 동반자 또는 자녀가 있다
  minAsset?: number;
}

/** 효과: 스탯 증감 + 체력(stamina) + 기회 포인트(cp) + 인생 상태 변화 */
export type Effect = Partial<Record<StatKey, number>> & { stamina?: number; cp?: number; life?: LifeChange };

export type TileType =
  | 'journey'
  | 'activity' // 액티비티: 참가하면 보상이 큰 칸
  | 'trouble' // 트러블: 부정적 사건. 맞서면 피할 수도 있다
  | 'camp'
  | 'path'
  | 'lodge'
  | 'fork'
  | 'weather'
  | 'milestone'
  | 'summit'; // 종착지 (마지막 섬의 등대)

export interface Tile {
  id: number;
  zone: number; // 1..10
  type: TileType;
  next: number[]; // 여러 개면 갈림길
  /** 지름길 위의 칸: 안전 선택지 없이 도전만 가능 */
  risky?: boolean;
  /** 지름길 / 둘레길 표시 (UI/통계용) */
  route?: 'short' | 'long';
}

export interface Board {
  tiles: Tile[];
  start: number;
  summit: number;
}

export interface Challenge {
  staminaCost: number;
  dc: number; // d6 >= dc 이면 성공
  win: Effect;
  lose: Effect;
}
export type CardDeck = 'journey' | 'activity' | 'trouble';

export interface JourneyCard {
  id: string;
  /** 0 이면 모든 구간 공통 */
  zone: number;
  title: string;
  safe: Effect;
  challenge: Challenge;
  /** 이 조건을 만족하는 플레이어에게만 나오는 카드 */
  requires?: Req;
}
export interface WeatherCard {
  id: string;
  title: string;
  effect: Effect; // 모든 플레이어에게 적용
}

export type Difficulty = 'easy' | 'normal' | 'hard' | 'extreme';

export type ConditionKind =
  | 'noShortcut'
  | 'noExhaust'
  | 'fewSabotaged'
  | 'togetherSummit'
  | 'hasPartner'
  | 'hasHome'
  | 'hasChild'
  | 'highSalary'
  | 'grandchild'
  | 'challengesWon'
  | 'pathsTaken';

export type Goal =
  | { kind: 'stat'; stat: StatKey; target: number }
  | { kind: 'condition'; cond: ConditionKind; n?: number };

export interface GameConfig {
  players: number; // 1..6 (AI 포함 모두 "플레이어")
  startZone: number; // 1..10
  endZone: number; // startZone..10 (최소 2구간 권장)
  difficulty: Difficulty;
  seed: number;
  /** 팀전: 길이=players, 같은 값이면 같은 팀. 없으면 개인전 */
  teams?: number[];
  /** 튜닝 파라미터 일부 덮어쓰기 */
  tuning?: Partial<Tuning>;
}

export interface Tuning {
  /** 목표치 = 시작 스탯 + 구간 수 × perZoneGain × 난이도 계수 */
  perZoneGain: number;
  difficultyCoef: Record<Difficulty, number>;
  /** 스탯마다 얻기 쉬운 정도가 달라서(월급 등) 목표치에 곱하는 보정 */
  statWeight: Record<StatKey, number>;
  startStamina: number;
  maxStamina: number;
  maxCp: number;
  catchUpCp: number;
  /** 첫 도착 후 마감까지 최소 라운드 */
  countdownRounds: number;
  /** 구간 수에 비례한 마감 라운드: max(countdownRounds, ceil(구간수 × 이 값)) */
  countdownPerZone: number;
  arrivalBonus: number[]; // 1등, 2등, 3등...
  notArrivedPenalty: number;
  sabotageCost: number;
  rerollCost: number;
  /** 마일스톤 보너스 조건: 스탯 합계 >= 구간수(누적) × 이 값 */
  milestoneThresholdPerZone: number;
  /** 나이(구간)에 따른 체력 상한 (구간 1~10) */
  staminaCap: number[];
  /** 한 판 시간 추정용 (초/턴) */
  secondsPerTurn: number;
  /** 고른 주사위 눈에 더해지는 이동 칸 수 (칸이 늘어난 만큼 보정) */
  moveBonus: number;
}

export interface PlayerState {
  id: number;
  name: string;
  team: number;
  pos: number; // tile id
  stats: Record<StatKey, number>;
  stamina: number;
  cp: number;
  life: LifeState;
  arrived: boolean;
  arrivalRank: number; // 0 = 미도착
  arrivalRound: number;
  /** 통계/조건 추적 */
  track: {
    shortcuts: number;
    exhausts: number;
    sabotaged: number;
    challengesWon: number;
    challengesTried: number;
    pathsTaken: number;
    togetherSummit: boolean;
    turns: number;
  };
  /** 방해 면역 남은 라운드 (쿨다운) */
  sabotageImmuneUntilRound: number;
  /** 같은 라운드 방해 사용 여부 */
  lastSabotageRound: number;
}

export interface GameState {
  config: GameConfig;
  tuning: Tuning;
  board: Board;
  players: PlayerState[];
  goals: Goal[];
  round: number; // 1부터
  current: number; // 이번 라운드의 현재 플레이어 인덱스
  arrivalCount: number;
  countdownLeft: number | null; // 첫 도착 후 남은 라운드
  finished: boolean;
  /** 진로 칸 자리: key = `${zone}:${optionIndex}` → 사용 인원 */
  pathSlots: Record<string, number>;
  log: string[];
}

export interface ScoreBreakdown {
  playerId: number;
  completion: number[]; // 목표별 달성률 0..1
  base: number; // 0..100
  arrivalBonus: number;
  penalty: number;
  total: number;
  overflow: number; // 동점 처리용 초과 달성 총량
}

export interface GameResult {
  scores: ScoreBreakdown[];
  ranking: number[]; // playerId 순위 (1등부터)
  winner: number;
  rounds: number;
  endedBy: 'allArrived' | 'countdown';
  teamScores?: { team: number; score: number }[];
  winningTeam?: number;
  /** 시뮬레이터용 집계 */
  metrics: Record<string, number>;
  /** 플레이어 총 턴 수 (소요 시간 추정용) */
  playerTurns: number;
}

/** 화면 연출/로그용 이벤트. 엔진이 진행하면서 순서대로 내보낸다. */
export type GameEvent =
  | { t: 'roundStart'; round: number }
  | { t: 'turnStart'; player: number; round: number }
  | { t: 'rest'; player: number }
  | { t: 'dice'; player: number; dice: [number, number] }
  | { t: 'diceChosen'; player: number; pick: 0 | 1; move: number; cpGain: number }
  | { t: 'move'; player: number; path: number[] }
  | { t: 'zoneEnter'; player: number; zone: number }
  | { t: 'payday'; player: number; zone: number; job: string; amount: number; pension: boolean; effect: Effect }
  | { t: 'job'; player: number; job: string; salary: number }
  | { t: 'milestone'; player: number; zone: number; option: string; success: boolean | null; effect: Effect }
  | { t: 'tile'; player: number; tile: number; tileType: TileType; delta: Effect }
  | { t: 'card'; player: number; deck: CardDeck; card: JourneyCard; choice: 'safe' | 'challenge'; boost: number; roll: number | null; success: boolean | null; rerolled: boolean }
  | { t: 'weather'; player: number; card: WeatherCard }
  | { t: 'pathOption'; player: number; zone: number; option: number }
  | { t: 'lodge'; player: number }
  | { t: 'sabotage'; from: number; to: number; free: boolean }
  | { t: 'catchUp'; players: number[] }
  | { t: 'arrive'; player: number; rank: number }
  | { t: 'countdown'; rounds: number }
  | { t: 'end'; result: GameResult };

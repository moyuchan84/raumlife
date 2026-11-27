import type { Effect, GameState, JourneyCard } from './types';
import type { HouseAnswer, HouseOffer } from './data/houses';

/** 카드 선택지의 현재 상태: 조건·비용을 못 맞추면 enabled=false, 주사위 보너스(스탯) */
export interface OptionState {
  enabled: boolean;
  why: string;
  bonus: number;
}

/** 직업 선택지 (학력(성장)이 모자라면 enabled=false) */
export interface JobChoice {
  id: string;
  name: string;
  icon: string;
  salary: number;
  minGrowth: number;
  perkText: string;
  enabled: boolean;
}

/** 이정표 선택지 (조건을 못 맞추면 enabled=false) */
export interface MilestoneChoice {
  id: string;
  name: string;
  desc: string;
  effect: Effect;
  dc?: number;
  fail?: Effect;
  enabled: boolean;
  why: string;
}

/**
 * 플레이어(사람/AI)가 내리는 결정들. 엔진은 결정이 필요할 때마다 호출한다.
 * 동기(봇)와 비동기(사람: 네트워크 응답 대기) 둘 다 가능하다.
 */
type Maybe<T> = T | Promise<T>;

export interface Controller {
  readonly name: string;
  /** 두 주사위 중 이동에 쓸 것 (0 또는 1). 나머지가 4 이상이면 CP +1 */
  chooseDie(s: GameState, me: number, dice: [number, number]): Maybe<0 | 1>;
  /** 갈림길: options[0] = 둘레길, options[1] = 지름길. 선택한 인덱스를 반환 */
  choosePath(s: GameState, me: number, options: number[]): Maybe<number>;
  /** 카드: 대응 방식 하나를 고른다 (enabled 인 것만 가능). 지름길에서는 주사위 선택지만 가능 */
  chooseCardOption(s: GameState, me: number, card: JourneyCard, states: OptionState[]): Maybe<number>;
  /** 주사위를 굴리기 전에 CP 를 몇 개 쓸지 (0..2) */
  chooseCpBoost(s: GameState, me: number, card: JourneyCard, option: number): Maybe<number>;
  /** 실패했을 때 CP 로 다시 굴릴지 */
  wantReroll(s: GameState, me: number, card: JourneyCard, option: number, roll: number): Maybe<boolean>;
  /** 진로 칸: 선택지 인덱스 (자리가 없으면 available[i]=false). -1 이면 선택 안 함 */
  choosePathOption(s: GameState, me: number, zone: number, available: boolean[]): Maybe<number>;
  /** 집을 사거나 직접 짓는다(또는 별장). null 이면 사지 않는다 */
  chooseHouse(s: GameState, me: number, offer: HouseOffer): Maybe<HouseAnswer | null>;
  /** 성인이 되었을 때 직업을 정한다 (enabled 인 것만 가능) */
  chooseJob(s: GameState, me: number, options: JobChoice[]): Maybe<number>;
  /** 구간 끝 이정표: 인생의 갈림길 선택 (enabled 인 것만 고를 수 있다) */
  chooseMilestone(s: GameState, me: number, zone: number, title: string, options: MilestoneChoice[]): Maybe<number>;
  /** 보금자리를 살지 */
  chooseLodge(s: GameState, me: number): Maybe<boolean>;
  /**
   * 방해(또는 도착자의 무료 바람) 대상. null 이면 안 함.
   * free=true 는 도착한 플레이어의 정상 지킴이 행동 (비용 없음, 약한 효과)
   */
  chooseSabotage(s: GameState, me: number, targets: number[], free: boolean): Maybe<number | null>;
}

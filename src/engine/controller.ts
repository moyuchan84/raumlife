import type { GameState, JourneyCard } from './types';

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
  /** 여정 카드: 안전 / 도전 (canSafe=false 이면 도전만 가능) */
  chooseCardOption(s: GameState, me: number, card: JourneyCard, canSafe: boolean): Maybe<'safe' | 'challenge'>;
  /** 도전 판정 전에 CP 를 몇 개 쓸지 (0..2) */
  chooseCpBoost(s: GameState, me: number, card: JourneyCard): Maybe<number>;
  /** 도전에 실패했을 때 CP 로 다시 굴릴지 */
  wantReroll(s: GameState, me: number, card: JourneyCard, roll: number): Maybe<boolean>;
  /** 진로 칸: 선택지 인덱스 (자리가 없으면 available[i]=false). -1 이면 선택 안 함 */
  choosePathOption(s: GameState, me: number, zone: number, available: boolean[]): Maybe<number>;
  /** 보금자리를 살지 */
  chooseLodge(s: GameState, me: number): Maybe<boolean>;
  /**
   * 방해(또는 도착자의 무료 바람) 대상. null 이면 안 함.
   * free=true 는 도착한 플레이어의 정상 지킴이 행동 (비용 없음, 약한 효과)
   */
  chooseSabotage(s: GameState, me: number, targets: number[], free: boolean): Maybe<number | null>;
}

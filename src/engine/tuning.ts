import type { Tuning } from './types';

/** 초기 튜닝값. 시뮬레이터 결과를 보고 조정한다. */
export const DEFAULT_TUNING: Tuning = {
  perZoneGain: 3.0,
  difficultyCoef: { easy: 1, normal: 1, hard: 1, extreme: 1.4 },
  startStamina: 8,
  maxStamina: 10,
  maxCp: 5,
  catchUpCp: 1,
  countdownRounds: 3,
  countdownPerZone: 1.0,
  arrivalBonus: [2, 1, 0],
  notArrivedPenalty: 3,
  sabotageCost: 3,
  rerollCost: 2,
  milestoneThresholdPerZone: 3,
  /** 유아는 체력이 적고, 어른이 가장 튼튼하며, 노년에는 다시 줄어든다 */
  staminaCap: [6, 8, 10, 10, 10, 10, 9, 8, 7, 6],
  secondsPerTurn: 20,
  moveBonus: 2,
};

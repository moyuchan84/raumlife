import type { Tuning } from './types';

/** 초기 튜닝값. 시뮬레이터 결과를 보고 조정한다. */
export const DEFAULT_TUNING: Tuning = {
  perZoneGain: 4.2,
  difficultyCoef: { easy: 1, normal: 1, hard: 1, extreme: 1.4 },
  statWeight: { asset: 1.3, happy: 1, network: 0.95, growth: 0.85 },
  startStamina: 8,
  maxStamina: 10,
  maxCp: 5,
  catchUpCp: 1,
  countdownRounds: 3,
  countdownPerZone: 1.0,
  arrivalBonus: [1, 0, 0],
  notArrivedPenalty: 2,
  sabotageCost: 3,
  rerollCost: 2,
  milestoneThresholdPerZone: 3,
  /** 유아는 체력이 적고, 어른이 가장 튼튼하며, 노년에는 다시 줄어든다 */
  staminaCap: [6, 8, 10, 10, 10, 10, 9, 8, 7, 6],
  lengthGain: [1, 1.15, 1.3],
  secondsPerTurn: 20,
  moveBonus: 2,
};

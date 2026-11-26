import type { Tuning } from './types';

/** 초기 튜닝값. 시뮬레이터 결과를 보고 조정한다. */
export const DEFAULT_TUNING: Tuning = {
  perZoneGain: 1.6,
  difficultyCoef: { easy: 1, normal: 1, hard: 1, extreme: 1.4 },
  startStamina: 8,
  maxStamina: 10,
  maxCp: 5,
  catchUpCp: 1,
  countdownRounds: 3,
  countdownPerZone: 0.8,
  arrivalBonus: [3, 2, 1],
  notArrivedPenalty: 5,
  sabotageCost: 3,
  rerollCost: 2,
  milestoneThresholdPerZone: 3,
  secondsPerTurn: 20,
  moveBonus: 1,
};

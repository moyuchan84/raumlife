import type { Difficulty, Goal, GameConfig, PlayerState, StatKey, Tuning } from './types';
import { STAT_KEYS } from './types';
import { Rng } from './rng';

export const START_STATS: Record<StatKey, number> = { asset: 1, happy: 2, network: 1, growth: 1 };

interface CondTemplate {
  cond: Extract<Goal, { kind: 'condition' }>['cond'];
  /** 이 조건이 의미 있으려면 필요한 최소 구간 수 */
  minZones: number;
  n?: (zones: number) => number;
}

const CONDITIONS: CondTemplate[] = [
  { cond: 'noShortcut', minZones: 1 },
  { cond: 'noExhaust', minZones: 1 },
  { cond: 'fewSabotaged', minZones: 1, n: (z) => Math.max(1, Math.round(z / 3)) },
  { cond: 'togetherSummit', minZones: 1 },
  { cond: 'challengesWon', minZones: 1, n: (z) => Math.max(2, Math.round(z * 0.6)) },
  { cond: 'pathsTaken', minZones: 2, n: (z) => Math.max(2, Math.round(z * 0.3)) },
];

const GOAL_COUNT: Record<Difficulty, { stats: number; conds: number }> = {
  easy: { stats: 1, conds: 0 },
  normal: { stats: 2, conds: 0 },
  hard: { stats: 3, conds: 0 },
  extreme: { stats: 3, conds: 2 },
};

export function zoneCount(config: GameConfig): number {
  return config.endZone - config.startZone + 1;
}

/** 모든 플레이어에게 공개되는 공통 목표를 만든다. */
export function generateGoals(config: GameConfig, tuning: Tuning, rng: Rng): Goal[] {
  const zones = zoneCount(config);
  const { stats, conds } = GOAL_COUNT[config.difficulty];
  const coef = tuning.difficultyCoef[config.difficulty];
  const goals: Goal[] = [];

  const statPool = rng.shuffle(STAT_KEYS);
  for (let i = 0; i < stats; i++) {
    const stat = statPool[i]!;
    const target = Math.round(START_STATS[stat] + zones * tuning.perZoneGain * coef);
    goals.push({ kind: 'stat', stat, target });
  }
  const condPool = rng.shuffle(CONDITIONS.filter((c) => c.minZones <= zones));
  for (let i = 0; i < conds && i < condPool.length; i++) {
    const t = condPool[i]!;
    goals.push(t.n ? { kind: 'condition', cond: t.cond, n: t.n(zones) } : { kind: 'condition', cond: t.cond });
  }
  return goals;
}

/** 목표별 달성률 0..1 (100% 제한) */
export function goalCompletion(p: PlayerState, g: Goal): number {
  if (g.kind === 'stat') return Math.max(0, Math.min(1, p.stats[g.stat] / g.target));
  const t = p.track;
  switch (g.cond) {
    case 'noShortcut':
      return t.shortcuts === 0 ? 1 : 0;
    case 'noExhaust':
      return t.exhausts === 0 ? 1 : 0;
    case 'fewSabotaged': {
      const allowed = g.n ?? 1;
      return t.sabotaged <= allowed ? 1 : Math.max(0, 1 - (t.sabotaged - allowed) / 2);
    }
    case 'togetherSummit':
      return t.togetherSummit ? 1 : 0;
    case 'challengesWon':
      return Math.min(1, t.challengesWon / (g.n ?? 1));
    case 'pathsTaken':
      return Math.min(1, t.pathsTaken / (g.n ?? 1));
  }
}

/** 목표를 초과 달성한 양 (동점 처리용) */
export function goalOverflow(p: PlayerState, g: Goal): number {
  if (g.kind === 'stat') return Math.max(0, p.stats[g.stat] - g.target);
  return 0;
}

export function goalLabel(g: Goal): string {
  if (g.kind === 'stat') {
    return `${{ asset: '자산', happy: '행복', network: '인맥', growth: '성장' }[g.stat]} ${g.target} 이상`;
  }
  switch (g.cond) {
    case 'noShortcut':
      return '지름길을 한 번도 쓰지 않기';
    case 'noExhaust':
      return '탈진을 한 번도 하지 않기';
    case 'fewSabotaged':
      return `방해를 ${g.n}번 이하로만 받기`;
    case 'togetherSummit':
      return '다른 플레이어와 같은 라운드에 정상 도착';
    case 'challengesWon':
      return `도전 선택지 ${g.n}번 이상 성공`;
    case 'pathsTaken':
      return `진로 ${g.n}번 이상 선택`;
  }
}

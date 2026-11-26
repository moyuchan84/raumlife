import type { Board, Controller, Effect, GameState, JourneyCard, PlayerState } from '../engine';
import { distancesToSummit, LODGE_COST, LODGE_EFFECT, PATH_ARCHETYPES, Rng, STAT_KEYS, goalCompletion } from '../engine';

// ───────── 평가 함수 ─────────

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function staminaValue(st: number): number {
  return 3 * Math.min(st, 3) + 1.2 * clamp(st - 3, 0, 3) + 0.3 * Math.max(0, st - 6);
}
const CP_VALUE = 1.2;

/** 효과를 적용했을 때의 "가치" (목표 달성률 + 체력 + CP). 상대 비교용 */
export function valueAfter(s: GameState, me: number, e: Effect): number {
  const p = s.players[me]!;
  const stats = { ...p.stats };
  for (const k of STAT_KEYS) if (e[k]) stats[k] = Math.max(0, stats[k] + (e[k] ?? 0));
  const virtual: PlayerState = { ...p, stats };
  const avg = s.goals.reduce((a, g) => a + goalCompletion(virtual, g), 0) / s.goals.length;
  const stamina = clamp(p.stamina + (e.stamina ?? 0), 0, s.tuning.maxStamina);
  const cp = clamp(p.cp + (e.cp ?? 0), 0, s.tuning.maxCp);
  return avg * 100 + staminaValue(stamina) + CP_VALUE * cp;
}

function baseOf(s: GameState, p: PlayerState): number {
  return (s.goals.reduce((a, g) => a + goalCompletion(p, g), 0) / s.goals.length) * 100;
}

const distCache = new WeakMap<Board, { min: number[]; max: number[] }>();
function dist(board: Board) {
  let d = distCache.get(board);
  if (!d) {
    d = distancesToSummit(board);
    distCache.set(board, d);
  }
  return d;
}
/** 평균적으로 한 라운드에 이동하는 칸 수 (큰 주사위를 골랐을 때) */
const TILES_PER_ROUND = 4;

/** 마감 카운트다운이 시작됐는데 지금 속도로는 정상에 못 갈 것 같으면 true */
function mustRush(s: GameState, me: number): boolean {
  if (s.countdownLeft === null) return false;
  const p = s.players[me]!;
  if (p.arrived) return false;
  const d = dist(s.board).min[p.pos]!;
  return d > (s.countdownLeft - 1) * TILES_PER_ROUND * 0.85;
}

// ───────── 휴리스틱 봇 ─────────

export interface BotStyle {
  name: string;
  /** 이동 1칸의 가치 (클수록 빠르게 가려 한다) */
  stepValue: number;
  /** 지름길 성향 */
  shortcut: 'always' | 'never' | 'smart';
  /** 방해 성향 */
  sabotage: 'never' | 'moderate' | 'aggressive';
  /** 도전 EV 에 곱하는 위험 선호 (1 = 중립) */
  risk: number;
}

export const STYLES: Record<string, BotStyle> = {
  greedy: { name: 'greedy', stepValue: 1.5, shortcut: 'smart', sabotage: 'moderate', risk: 1 },
  rusher: { name: 'rusher', stepValue: 3, shortcut: 'always', sabotage: 'never', risk: 1 },
  builder: { name: 'builder', stepValue: 0.8, shortcut: 'never', sabotage: 'never', risk: 1 },
  brawler: { name: 'brawler', stepValue: 1.5, shortcut: 'smart', sabotage: 'aggressive', risk: 1 },
};

export class HeuristicBot implements Controller {
  readonly name: string;
  constructor(private style: BotStyle) {
    this.name = style.name;
  }

  private hasCond(s: GameState, cond: string): boolean {
    return s.goals.some((g) => g.kind === 'condition' && g.cond === cond);
  }

  chooseDie(s: GameState, me: number, dice: [number, number]): 0 | 1 {
    const score = (pick: 0 | 1) => {
      const move = dice[pick];
      const left = pick === 0 ? dice[1] : dice[0];
      const cp = (left >= 4 ? 1 : 0) + (dice[0] === dice[1] ? 1 : 0);
      const stepValue = mustRush(s, me) ? 8 : this.style.stepValue;
      return stepValue * move + CP_VALUE * cp;
    };
    return score(0) >= score(1) ? 0 : 1;
  }

  choosePath(s: GameState, me: number, options: number[]): number {
    if (options.length < 2) return 0;
    const p = s.players[me]!;
    if (this.hasCond(s, 'noShortcut')) return 0;
    switch (this.style.shortcut) {
      case 'always':
        return p.stamina >= 3 ? 1 : 0;
      case 'never':
        return 0;
      case 'smart': {
        if (s.countdownLeft === null) return 0;
        // 둘레길로는 마감 안에 못 갈 때만 지름길
        const longD = dist(s.board).min[options[0]!]! + 1;
        const canMakeIt = longD <= (s.countdownLeft - 1) * TILES_PER_ROUND * 0.85;
        return !canMakeIt && p.stamina >= 3 ? 1 : 0;
      }
    }
  }

  private successProb(card: JourneyCard, boost = 0): number {
    return clamp((7 - (card.challenge.dc - boost)) / 6, 0, 1);
  }

  chooseCardOption(s: GameState, me: number, card: JourneyCard, canSafe: boolean): 'safe' | 'challenge' {
    if (!canSafe) return 'challenge';
    const p = s.players[me]!;
    if (p.stamina < card.challenge.staminaCost) return 'safe';
    const safe = valueAfter(s, me, card.safe);
    const pr = this.successProb(card);
    const cost = { stamina: -card.challenge.staminaCost };
    const win = valueAfter(s, me, mergeEffects(cost, card.challenge.win));
    const lose = valueAfter(s, me, mergeEffects(cost, card.challenge.lose));
    const ev = pr * win + (1 - pr) * lose;
    // 도전 성공 횟수 목표가 있으면 도전을 더 선호
    const risk = this.style.risk * (this.hasCond(s, 'challengesWon') ? 1.3 : 1);
    return ev * risk > safe ? 'challenge' : 'safe';
  }

  chooseCpBoost(s: GameState, me: number, card: JourneyCard): number {
    const p = s.players[me]!;
    const cost = { stamina: 0 };
    const win = valueAfter(s, me, mergeEffects(cost, card.challenge.win));
    const lose = valueAfter(s, me, mergeEffects(cost, card.challenge.lose));
    let boost = 0;
    while (boost < 2 && boost < p.cp) {
      const gain = (this.successProb(card, boost + 1) - this.successProb(card, boost)) * (win - lose);
      if (gain > CP_VALUE * 1.2) boost++;
      else break;
    }
    return boost;
  }

  wantReroll(s: GameState, me: number, card: JourneyCard): boolean {
    const win = valueAfter(s, me, card.challenge.win);
    const lose = valueAfter(s, me, card.challenge.lose);
    return this.successProb(card) * (win - lose) > s.tuning.rerollCost * CP_VALUE * 1.2;
  }

  choosePathOption(s: GameState, me: number, _zone: number, available: boolean[]): number {
    let best = -1;
    let bestV = -Infinity;
    for (let i = 0; i < 3; i++) {
      if (!available[i]) continue;
      const v = valueAfter(s, me, PATH_ARCHETYPES[i]!);
      if (v > bestV) {
        bestV = v;
        best = i;
      }
    }
    return best;
  }

  chooseLodge(s: GameState, me: number): boolean {
    return valueAfter(s, me, { asset: -LODGE_COST, ...LODGE_EFFECT }) > valueAfter(s, me, {});
  }

  chooseSabotage(s: GameState, me: number, targets: number[], free: boolean): number | null {
    if (!targets.length) return null;
    if (this.style.sabotage === 'never' && !free) return null;
    const mine = baseOf(s, s.players[me]!);
    const ranked = targets
      .map((id) => ({ id, v: baseOf(s, s.players[id]!) }))
      .sort((a, b) => b.v - a.v);
    const top = ranked[0]!;
    if (free) return top.id; // 도착한 플레이어는 무료이므로 항상 선두를 견제
    if (this.style.sabotage === 'aggressive') return top.id;
    // moderate: 나보다 5점 이상 앞선 상대에게만, CP 여유가 있을 때
    const p = s.players[me]!;
    if (top.v >= mine + 5 && p.cp >= s.tuning.sabotageCost + 1) return top.id;
    return null;
  }
}

function mergeEffects(a: Effect, b: Effect): Effect {
  const out: Effect = { ...a };
  for (const k of [...STAT_KEYS, 'stamina', 'cp'] as const) {
    const v = (a[k] ?? 0) + (b[k] ?? 0);
    if (v) out[k] = v;
  }
  return out;
}

// ───────── 랜덤 봇 (기준선) ─────────

export class RandomBot implements Controller {
  readonly name = 'random';
  private rng: Rng;
  constructor(seed: number) {
    this.rng = new Rng(seed);
  }
  chooseDie(): 0 | 1 {
    return this.rng.int(2) as 0 | 1;
  }
  choosePath(_s: GameState, _me: number, options: number[]): number {
    return this.rng.int(options.length);
  }
  chooseCardOption(_s: GameState, _me: number, _c: JourneyCard, canSafe: boolean): 'safe' | 'challenge' {
    return !canSafe || this.rng.next() < 0.5 ? 'challenge' : 'safe';
  }
  chooseCpBoost(): number {
    return 0;
  }
  wantReroll(): boolean {
    return false;
  }
  choosePathOption(_s: GameState, _me: number, _zone: number, available: boolean[]): number {
    const idx = available.map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
    return idx.length ? idx[this.rng.int(idx.length)]! : -1;
  }
  chooseLodge(): boolean {
    return this.rng.next() < 0.5;
  }
  chooseSabotage(): number | null {
    return null;
  }
}

export function createBot(kind: string, seed: number): Controller {
  if (kind === 'random') return new RandomBot(seed);
  const style = STYLES[kind];
  if (!style) throw new Error(`알 수 없는 봇: ${kind}`);
  return new HeuristicBot(style);
}

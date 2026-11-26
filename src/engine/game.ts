import type {
  Effect,
  GameConfig,
  GameResult,
  GameState,
  JourneyCard,
  PlayerState,
  ScoreBreakdown,
  StatKey,
  Tile,
  Tuning,
  WeatherCard,
} from './types';
import { STAT_KEYS } from './types';
import type { Controller } from './controller';
import { Rng } from './rng';
import { buildBoard } from './board';
import { CARDS } from './data/cards';
import { WEATHER } from './data/weather';
import { PATH_ARCHETYPES } from './data/zones';
import { DEFAULT_TUNING } from './tuning';
import { START_STATS, generateGoals, goalCompletion, goalOverflow } from './goals';

export const LODGE_COST = 2;
export const LODGE_EFFECT: Effect = { happy: 3, stamina: 1 };
export const SABOTAGE_EFFECT: Effect = { stamina: -2, happy: -1 };
export const WIND_EFFECT: Effect = { stamina: -1 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface GameOptions {
  verbose?: boolean;
}

export class Game {
  readonly state: GameState;
  private rng: Rng;
  private journeyDecks = new Map<number, JourneyCard[]>();
  private journeyDiscard = new Map<number, JourneyCard[]>();
  private weatherDeck: WeatherCard[] = [];
  private countdownEndsRound: number | null = null;
  private metrics: Record<string, number> = {};
  private playerTurns = 0;

  constructor(config: GameConfig, private options: GameOptions = {}) {
    if (config.players < 1 || config.players > 6) throw new Error('플레이어는 1~6명');
    if (config.teams && config.teams.length !== config.players) throw new Error('teams 길이 오류');
    const tuning: Tuning = {
      ...DEFAULT_TUNING,
      ...config.tuning,
      difficultyCoef: { ...DEFAULT_TUNING.difficultyCoef, ...(config.tuning?.difficultyCoef ?? {}) },
    };
    this.rng = new Rng(config.seed);
    const board = buildBoard(config.startZone, config.endZone);
    const goals = generateGoals(config, tuning, this.rng);
    const players: PlayerState[] = Array.from({ length: config.players }, (_, i) => ({
      id: i,
      name: `P${i + 1}`,
      team: config.teams ? config.teams[i]! : i,
      pos: board.start,
      stats: { ...START_STATS },
      stamina: tuning.startStamina,
      cp: 0,
      arrived: false,
      arrivalRank: 0,
      arrivalRound: 0,
      track: {
        shortcuts: 0,
        exhausts: 0,
        sabotaged: 0,
        challengesWon: 0,
        challengesTried: 0,
        pathsTaken: 0,
        togetherSummit: false,
        turns: 0,
      },
      sabotageImmuneUntilRound: 0,
      lastSabotageRound: 0,
    }));
    this.state = {
      config,
      tuning,
      board,
      players,
      goals,
      round: 1,
      current: 0,
      arrivalCount: 0,
      countdownLeft: null,
      finished: false,
      pathSlots: {},
      log: [],
    };
  }

  // ───────── 유틸 ─────────
  private m(key: string, n = 1) {
    this.metrics[key] = (this.metrics[key] ?? 0) + n;
  }
  private log(msg: string) {
    if (this.options.verbose) this.state.log.push(`[R${this.state.round}] ${msg}`);
  }

  applyEffect(p: PlayerState, e: Effect): void {
    const t = this.state.tuning;
    for (const k of STAT_KEYS) {
      const d = e[k];
      if (d) p.stats[k] = Math.max(0, p.stats[k] + d);
    }
    if (e.stamina) p.stamina = clamp(p.stamina + e.stamina, 0, t.maxStamina);
    if (e.cp) p.cp = clamp(p.cp + e.cp, 0, t.maxCp);
  }

  /** 현재 점수 (목표 달성률 평균 × 100, 보너스 제외) */
  baseScore(p: PlayerState): number {
    const g = this.state.goals;
    return (g.reduce((a, goal) => a + goalCompletion(p, goal), 0) / g.length) * 100;
  }

  private drawJourney(zone: number): JourneyCard {
    let deck = this.journeyDecks.get(zone) ?? [];
    if (deck.length === 0) {
      const discard = this.journeyDiscard.get(zone) ?? [];
      const pool = discard.length ? discard : CARDS.filter((c) => c.zone === 0 || c.zone === zone);
      deck = this.rng.shuffle(pool);
      this.journeyDiscard.set(zone, []);
      this.journeyDecks.set(zone, deck);
    }
    const card = deck.pop()!;
    const d = this.journeyDiscard.get(zone) ?? [];
    d.push(card);
    this.journeyDiscard.set(zone, d);
    return card;
  }

  private drawWeather(): WeatherCard {
    if (this.weatherDeck.length === 0) this.weatherDeck = this.rng.shuffle(WEATHER);
    return this.weatherDeck.pop()!;
  }

  // ───────── 진행 ─────────
  run(controllers: Controller[]): GameResult {
    if (controllers.length !== this.state.players.length) throw new Error('컨트롤러 수 불일치');
    while (!this.state.finished) this.playRound(controllers);
    return this.result();
  }

  playRound(ctrls: Controller[]): void {
    const s = this.state;
    const P = s.players.length;
    if (s.round > 1) this.applyCatchUp();
    // 라운드마다 시작 플레이어가 한 칸씩 돈다 (자리 유리함 완화)
    for (let k = 0; k < P; k++) {
      const idx = (s.round - 1 + k) % P;
      s.current = idx;
      this.playTurn(idx, ctrls[idx]!);
    }
    // 종료 판정
    const allArrived = s.players.every((p) => p.arrived);
    if (allArrived) {
      s.finished = true;
      this.endedBy = 'allArrived';
    } else if (this.countdownEndsRound !== null && s.round >= this.countdownEndsRound) {
      s.finished = true;
      this.endedBy = 'countdown';
    } else if (s.round > 400) {
      // 안전장치: 비정상적으로 긴 게임
      s.finished = true;
      this.endedBy = 'countdown';
      this.m('safetyStop');
    }
    if (!s.finished) {
      s.round++;
      if (this.countdownEndsRound !== null) s.countdownLeft = this.countdownEndsRound - s.round + 1;
    }
  }
  private endedBy: 'allArrived' | 'countdown' = 'allArrived';

  /** 하위 1/3 에게 CP 보너스 (도착 안 한 플레이어만) */
  private applyCatchUp() {
    const s = this.state;
    const n = Math.floor(s.players.length / 3);
    if (n === 0) return;
    const ranked = s.players
      .filter((p) => !p.arrived)
      .map((p) => ({ p, v: this.baseScore(p) }))
      .sort((a, b) => a.v - b.v);
    for (const { p } of ranked.slice(0, n)) {
      this.applyEffect(p, { cp: s.tuning.catchUpCp });
      this.m('catchUpCp');
    }
  }

  private playTurn(idx: number, ctrl: Controller): void {
    const s = this.state;
    const p = s.players[idx]!;
    this.playerTurns++;
    p.track.turns++;

    if (p.arrived) {
      this.keeperAction(p, ctrl);
      return;
    }

    // 탈진: 이번 턴은 쉰다
    if (p.stamina <= 0) {
      p.track.exhausts++;
      this.m('exhausts');
      this.applyEffect(p, { stamina: 3 });
      this.log(`${p.name} 탈진 → 휴식`);
      return;
    }

    // 주사위 2개: 하나는 이동, 나머지가 4 이상이면 CP+1, 더블이면 CP+1
    const dice: [number, number] = [this.rng.die(), this.rng.die()];
    const pick = ctrl.chooseDie(s, idx, dice);
    const move = dice[pick];
    const left = pick === 0 ? dice[1] : dice[0];
    let cpGain = 0;
    if (left >= 4) cpGain++;
    if (dice[0] === dice[1]) cpGain++;
    if (cpGain) this.applyEffect(p, { cp: cpGain });
    this.m('moveTotal', move);

    this.moveAlong(p, ctrl, move);
    if (p.arrived) return;

    this.resolveTile(p, ctrl, s.board.tiles[p.pos]!);
    this.sabotagePhase(p, ctrl);
  }

  private moveAlong(p: PlayerState, ctrl: Controller, steps: number) {
    const s = this.state;
    for (let i = 0; i < steps; i++) {
      const cur = s.board.tiles[p.pos]!;
      if (cur.id === s.board.summit) break;
      let nextId: number;
      if (cur.next.length > 1) {
        const c = ctrl.choosePath(s, p.id, cur.next);
        nextId = cur.next[clamp(c, 0, cur.next.length - 1)]!;
        if (s.board.tiles[nextId]!.route === 'short') {
          p.track.shortcuts++;
          this.m('shortcuts');
        } else {
          this.m('longRoutes');
        }
      } else {
        nextId = cur.next[0]!;
      }
      p.pos = nextId;
      if (nextId === s.board.summit) {
        this.arrive(p);
        break;
      }
    }
  }

  private arrive(p: PlayerState) {
    const s = this.state;
    p.arrived = true;
    p.arrivalRank = ++s.arrivalCount;
    p.arrivalRound = s.round;
    for (const o of s.players) {
      if (o !== p && o.arrived && o.arrivalRound === s.round) {
        o.track.togetherSummit = true;
        p.track.togetherSummit = true;
      }
    }
    if (this.countdownEndsRound === null) {
      const zones = s.config.endZone - s.config.startZone + 1;
      const cd = Math.max(s.tuning.countdownRounds, Math.ceil(zones * s.tuning.countdownPerZone));
      this.countdownEndsRound = s.round + cd;
      s.countdownLeft = cd;
    }
    this.log(`${p.name} 정상 도착 (${p.arrivalRank}등)`);
  }

  private resolveTile(p: PlayerState, ctrl: Controller, tile: Tile) {
    const s = this.state;
    this.m(`tile:${tile.type}`);
    switch (tile.type) {
      case 'journey':
        return this.resolveJourney(p, ctrl, tile);
      case 'camp': {
        this.applyEffect(p, { stamina: 2 });
        const mates = s.players.filter((o) => o !== p && o.pos === p.pos).length;
        if (mates > 0) this.applyEffect(p, { network: 1 });
        return;
      }
      case 'path':
        return this.resolvePath(p, ctrl, tile);
      case 'lodge':
        if (p.stats.asset >= LODGE_COST && ctrl.chooseLodge(s, p.id)) {
          this.applyEffect(p, { asset: -LODGE_COST, ...LODGE_EFFECT });
          this.m('lodgeBought');
        }
        return;
      case 'weather': {
        const w = this.drawWeather();
        for (const o of s.players) this.applyEffect(o, w.effect);
        this.log(`날씨: ${w.title}`);
        return;
      }
      case 'milestone': {
        this.applyEffect(p, { asset: 1 }); // 이정표 축하금
        const zonesDone = tile.zone - s.config.startZone + 1;
        const sum = STAT_KEYS.reduce((a, k) => a + p.stats[k], 0);
        const startSum = STAT_KEYS.reduce((a, k) => a + START_STATS[k], 0);
        if (sum >= startSum + zonesDone * s.tuning.milestoneThresholdPerZone) {
          this.applyEffect(p, { cp: 2 });
          const lowest = STAT_KEYS.reduce((a, k) => (p.stats[k] < p.stats[a] ? k : a), STAT_KEYS[0]!);
          this.applyEffect(p, { [lowest]: 1 });
          this.m('milestoneBonus');
        }
        return;
      }
      case 'fork':
      case 'summit':
        return;
    }
  }

  private resolveJourney(p: PlayerState, ctrl: Controller, tile: Tile) {
    const s = this.state;
    const card = this.drawJourney(tile.zone);
    const cost = card.challenge.staminaCost;
    const canSafe = !tile.risky;
    let choice: 'safe' | 'challenge' = ctrl.chooseCardOption(s, p.id, card, canSafe);
    if (!canSafe) choice = 'challenge';
    else if (choice === 'challenge' && p.stamina < cost) choice = 'safe';

    if (choice === 'safe') {
      this.applyEffect(p, card.safe);
      this.m('safeChosen');
      return;
    }
    this.m('challengeTried');
    p.track.challengesTried++;
    this.applyEffect(p, { stamina: -Math.min(cost, p.stamina) });
    const boost = clamp(ctrl.chooseCpBoost(s, p.id, card), 0, Math.min(2, p.cp));
    if (boost) this.applyEffect(p, { cp: -boost });
    let roll = this.rng.die();
    let ok = roll + boost >= card.challenge.dc;
    if (!ok && p.cp >= s.tuning.rerollCost && ctrl.wantReroll(s, p.id, card, roll)) {
      this.applyEffect(p, { cp: -s.tuning.rerollCost });
      roll = this.rng.die();
      ok = roll + boost >= card.challenge.dc;
      this.m('rerolls');
    }
    if (ok) {
      p.track.challengesWon++;
      this.m('challengeWon');
      this.applyEffect(p, card.challenge.win);
    } else {
      this.applyEffect(p, card.challenge.lose);
    }
  }

  private resolvePath(p: PlayerState, ctrl: Controller, tile: Tile) {
    const s = this.state;
    const cap = Math.ceil(s.players.length / 2);
    const available = [0, 1, 2].map((i) => (s.pathSlots[`${tile.zone}:${i}`] ?? 0) < cap);
    if (!available.some(Boolean)) {
      this.m('pathAllFull');
      return;
    }
    const pick = ctrl.choosePathOption(s, p.id, tile.zone, available);
    if (pick < 0 || pick > 2 || !available[pick]) return;
    const key = `${tile.zone}:${pick}`;
    s.pathSlots[key] = (s.pathSlots[key] ?? 0) + 1;
    this.applyEffect(p, PATH_ARCHETYPES[pick]!);
    p.track.pathsTaken++;
    this.m('pathTaken');
  }

  private sabotageTargets(p: PlayerState, free: boolean): number[] {
    const s = this.state;
    const myZone = s.board.tiles[p.pos]!.zone;
    return s.players
      .filter(
        (o) =>
          o !== p &&
          !o.arrived &&
          o.team !== p.team &&
          (free || s.board.tiles[o.pos]!.zone === myZone) &&
          (free || o.sabotageImmuneUntilRound < s.round),
      )
      .map((o) => o.id);
  }

  private sabotagePhase(p: PlayerState, ctrl: Controller) {
    const s = this.state;
    if (p.cp < s.tuning.sabotageCost) return;
    const targets = this.sabotageTargets(p, false);
    if (!targets.length) return;
    const t = ctrl.chooseSabotage(s, p.id, targets, false);
    if (t === null || !targets.includes(t)) return;
    const target = s.players[t]!;
    this.applyEffect(p, { cp: -s.tuning.sabotageCost });
    this.applyEffect(target, SABOTAGE_EFFECT);
    target.track.sabotaged++;
    target.sabotageImmuneUntilRound = s.round + 1; // 연속 방해 방지
    this.m('sabotages');
    this.log(`${p.name} → ${target.name} 방해`);
  }

  /** 정상 지킴이 행동: 무료, 약한 효과 */
  private keeperAction(p: PlayerState, ctrl: Controller) {
    const s = this.state;
    const targets = this.sabotageTargets(p, true);
    if (!targets.length) return;
    const t = ctrl.chooseSabotage(s, p.id, targets, true);
    if (t === null || !targets.includes(t)) return;
    this.applyEffect(s.players[t]!, WIND_EFFECT);
    this.m('winds');
  }

  // ───────── 점수 ─────────
  score(p: PlayerState): ScoreBreakdown {
    const s = this.state;
    const completion = s.goals.map((g) => goalCompletion(p, g));
    const base = (completion.reduce((a, b) => a + b, 0) / completion.length) * 100;
    const arrivalBonus = p.arrived ? (s.tuning.arrivalBonus[p.arrivalRank - 1] ?? 0) : 0;
    const penalty = p.arrived ? 0 : s.tuning.notArrivedPenalty;
    const overflow = s.goals.reduce((a, g) => a + goalOverflow(p, g), 0);
    return {
      playerId: p.id,
      completion,
      base,
      arrivalBonus,
      penalty,
      total: base + arrivalBonus - penalty,
      overflow,
    };
  }

  result(): GameResult {
    const s = this.state;
    const scores = s.players.map((p) => this.score(p));
    const order = scores
      .slice()
      .sort((a, b) => {
        if (Math.abs(b.total - a.total) > 1e-9) return b.total - a.total;
        if (b.overflow !== a.overflow) return b.overflow - a.overflow;
        const ra = s.players[a.playerId]!.arrivalRank || 99;
        const rb = s.players[b.playerId]!.arrivalRank || 99;
        if (ra !== rb) return ra - rb;
        return a.playerId - b.playerId;
      })
      .map((x) => x.playerId);

    const res: GameResult = {
      scores,
      ranking: order,
      winner: order[0]!,
      rounds: s.round,
      endedBy: this.endedBy,
      metrics: { ...this.metrics },
      playerTurns: this.playerTurns,
    };
    if (s.config.teams) {
      const byTeam = new Map<number, number[]>();
      for (const sc of scores) {
        const t = s.players[sc.playerId]!.team;
        byTeam.set(t, [...(byTeam.get(t) ?? []), sc.total]);
      }
      res.teamScores = [...byTeam.entries()].map(([team, v]) => ({
        team,
        score: v.reduce((a, b) => a + b, 0) / v.length,
      }));
      res.winningTeam = res.teamScores.slice().sort((a, b) => b.score - a.score)[0]!.team;
    }
    return res;
  }
}

export type { StatKey };

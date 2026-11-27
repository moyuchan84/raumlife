import type {
  CardDeck,
  CardOption,
  Effect,
  GameConfig,
  GameEvent,
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
import { buildBoard, LENGTH_FACTOR } from './board';
import { DECKS } from './data/cards';
import { WEATHER } from './data/weather';
import { PATH_ARCHETYPES, ZONES } from './data/zones';
import { MILESTONES, meets, reqText, staminaCapFor, startLife } from './data/life';
import { hasAnythingToBuy, houseDividend, makeOffer, validAnswer, type HouseOffer } from './data/houses';
import type { JobChoice, MilestoneChoice, OptionState } from './controller';
import { JOB_BY_ID, jobOffer, pensionOf, salaryOf } from './data/jobs';
import { DEFAULT_TUNING } from './tuning';
import { START_STATS, generateGoals, goalCompletion, goalOverflow } from './goals';

export const LODGE_COST = 2;
export const LODGE_EFFECT: Effect = { happy: 3, stamina: 1 };
export const SABOTAGE_EFFECT: Effect = { stamina: -1, happy: -1 };
export const WIND_EFFECT: Effect = { stamina: -1 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface GameOptions {
  verbose?: boolean;
  /** 이벤트 수신. Promise 를 돌려주면 엔진이 기다린다 (연출 속도 조절용) */
  onEvent?: (e: GameEvent) => void | Promise<void>;
}

export class Game {
  readonly state: GameState;
  private rng: Rng;
  private journeyDecks = new Map<string, JourneyCard[]>();
  private journeyDiscard = new Map<string, JourneyCard[]>();
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
      lengthGain: config.tuning?.lengthGain ?? DEFAULT_TUNING.lengthGain,
      difficultyCoef: { ...DEFAULT_TUNING.difficultyCoef, ...(config.tuning?.difficultyCoef ?? {}) },
      statWeight: { ...DEFAULT_TUNING.statWeight, ...(config.tuning?.statWeight ?? {}) },
    };
    this.rng = new Rng(config.seed);
    const board = buildBoard(config.startZone, config.endZone, config.length ?? 1);
    const goals = generateGoals(config, tuning, this.rng);
    const players: PlayerState[] = Array.from({ length: config.players }, (_, i) => ({
      id: i,
      name: `P${i + 1}`,
      team: config.teams ? config.teams[i]! : i,
      pos: board.start,
      stats: { ...START_STATS },
      stamina: Math.min(tuning.startStamina, staminaCapFor(tuning.staminaCap, config.startZone)),
      cp: 0,
      life: startLife(config.startZone),
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
    for (const pl of players) {
      if (pl.life.home && !pl.life.house) {
        pl.life.house = { kind: 'ready', name: '아파트', size: 2, style: 1, color: 4, extras: [], price: 4, tileId: board.start, zone: config.startZone };
      }
    }
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
  private emit(e: GameEvent): void | Promise<void> {
    return this.options.onEvent?.(e);
  }
  private log(msg: string) {
    if (this.options.verbose) this.state.log.push(`[R${this.state.round}] ${msg}`);
  }

  /** 지금 있는 구간(나이)에서의 체력 상한 */
  staminaCap(p: PlayerState): number {
    const t = this.state.tuning;
    const zone = this.state.board.tiles[p.pos]!.zone;
    return Math.min(t.maxStamina, staminaCapFor(t.staminaCap, zone));
  }

  applyEffect(p: PlayerState, e: Effect): void {
    const t = this.state.tuning;
    for (const k of STAT_KEYS) {
      const d = e[k];
      if (d) p.stats[k] = Math.max(0, p.stats[k] + d);
    }
    if (e.stamina) p.stamina = clamp(p.stamina + e.stamina, 0, this.staminaCap(p));
    if (e.cp) p.cp = clamp(p.cp + e.cp, 0, t.maxCp);
    const l = e.life;
    if (l) {
      if (l.raise) p.life.raise = Math.min(3, p.life.raise + l.raise);
      if (l.partner) p.life.partner = true;
      if (l.children) p.life.children = Math.min(3, p.life.children + l.children);
      if (l.grandchildren) p.life.grandchildren = Math.min(3, p.life.grandchildren + l.grandchildren);
      if (l.home) p.life.home = true;
    }
  }

  /** 현재 점수 (목표 달성률 평균 × 100, 보너스 제외) */
  baseScore(p: PlayerState): number {
    const g = this.state.goals;
    return (g.reduce((a, goal) => a + goalCompletion(p, goal), 0) / g.length) * 100;
  }

  private drawCard(deck: CardDeck, zone: number, p: PlayerState): JourneyCard {
    const key = `${deck}:${zone}`;
    let cards = this.journeyDecks.get(key) ?? [];
    if (cards.length === 0) {
      const discard = this.journeyDiscard.get(key) ?? [];
      const pool = discard.length ? discard : DECKS[deck].filter((c) => c.zone === 0 || c.zone === zone);
      cards = this.rng.shuffle(pool);
      this.journeyDiscard.set(key, []);
      this.journeyDecks.set(key, cards);
    }
    // 이 플레이어의 인생 상태에 맞는 카드를 찾는다. 덱에 맞는 카드가 없으면 이 섬의 카드 전체에서 고른다
    const fits = (c: JourneyCard) => meets(c.requires, p.life, p.stats.asset);
    let idx = -1;
    for (let i = cards.length - 1; i >= 0; i--) {
      if (fits(cards[i]!)) {
        idx = i;
        break;
      }
    }
    let card: JourneyCard;
    if (idx >= 0) {
      card = cards.splice(idx, 1)[0]!;
    } else {
      const all = DECKS[deck].filter((c) => (c.zone === 0 || c.zone === zone) && fits(c));
      card = all[this.rng.int(all.length)]!; // 조건 없는 카드가 항상 있으므로 비지 않는다
    }
    const d = this.journeyDiscard.get(key) ?? [];
    d.push(card);
    this.journeyDiscard.set(key, d);
    return card;
  }

  private drawWeather(): WeatherCard {
    if (this.weatherDeck.length === 0) this.weatherDeck = this.rng.shuffle(WEATHER);
    return this.weatherDeck.pop()!;
  }

  // ───────── 진행 ─────────
  async run(controllers: Controller[]): Promise<GameResult> {
    if (controllers.length !== this.state.players.length) throw new Error('컨트롤러 수 불일치');
    while (!this.state.finished) await this.playRound(controllers);
    const res = this.result();
    await this.emit({ t: 'end', result: res });
    return res;
  }

  async playRound(ctrls: Controller[]): Promise<void> {
    const s = this.state;
    const P = s.players.length;
    await this.emit({ t: 'roundStart', round: s.round });
    if (s.round > 1) await this.applyCatchUp();
    // 라운드마다 시작 플레이어가 한 칸씩 돈다 (자리 유리함 완화)
    for (let k = 0; k < P; k++) {
      const idx = (s.round - 1 + k) % P;
      s.current = idx;
      await this.playTurn(idx, ctrls[idx]!);
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
  private async applyCatchUp() {
    const s = this.state;
    const n = Math.floor(s.players.length / 3);
    if (n === 0) return;
    const ranked = s.players
      .filter((p) => !p.arrived)
      .map((p) => ({ p, v: this.baseScore(p) }))
      .sort((a, b) => a.v - b.v);
    const got: number[] = [];
    for (const { p } of ranked.slice(0, n)) {
      this.applyEffect(p, { cp: s.tuning.catchUpCp });
      this.m('catchUpCp');
      got.push(p.id);
    }
    if (got.length) await this.emit({ t: 'catchUp', players: got });
  }

  private async playTurn(idx: number, ctrl: Controller): Promise<void> {
    const s = this.state;
    const p = s.players[idx]!;
    this.playerTurns++;
    p.track.turns++;

    await this.emit({ t: 'turnStart', player: idx, round: s.round });
    await this.maybeChooseJob(p, ctrl);
    if (p.arrived) {
      await this.keeperAction(p, ctrl);
      return;
    }

    // 탈진: 이번 턴은 쉰다
    if (p.stamina <= 0) {
      p.track.exhausts++;
      this.m('exhausts');
      this.applyEffect(p, { stamina: 3 });
      this.log(`${p.name} 탈진 → 휴식`);
      await this.emit({ t: 'rest', player: idx });
      return;
    }

    // 주사위 2개: 하나는 이동, 나머지가 4 이상이면 CP+1, 더블이면 CP+1
    const dice: [number, number] = [this.rng.die(), this.rng.die()];
    await this.emit({ t: 'dice', player: idx, dice });
    const pick = await ctrl.chooseDie(s, idx, dice);
    const move = dice[pick] + s.tuning.moveBonus;
    const left = pick === 0 ? dice[1] : dice[0];
    let cpGain = 0;
    if (left >= 4) cpGain++;
    if (dice[0] === dice[1]) cpGain++;
    if (cpGain) this.applyEffect(p, { cp: cpGain });
    this.m('moveTotal', move);
    await this.emit({ t: 'diceChosen', player: idx, pick, move, cpGain });

    const zoneBefore = s.board.tiles[p.pos]!.zone;
    const path = await this.moveAlong(p, ctrl, move);
    await this.emit({ t: 'move', player: idx, path });
    const zoneAfter = s.board.tiles[p.pos]!.zone;
    if (zoneAfter !== zoneBefore) {
      await this.emit({ t: 'zoneEnter', player: idx, zone: zoneAfter });
      await this.payday(p, zoneAfter);
      // 섬에 들어서면 진로를 고른다 (선착순, 자리가 한정되어 플레이어끼리 경쟁한다)
      if (ZONES[zoneAfter - 1]!.length === 16) await this.resolvePath(p, ctrl, zoneAfter);
    }
    if (p.arrived) return;

    const before = { ...p.stats, stamina: p.stamina, cp: p.cp };
    const tile = s.board.tiles[p.pos]!;
    await this.resolveTile(p, ctrl, tile);
    const delta: Effect = {};
    for (const k of STAT_KEYS) if (p.stats[k] !== before[k]) delta[k] = p.stats[k] - before[k];
    if (p.stamina !== before.stamina) delta.stamina = p.stamina - before.stamina;
    if (p.cp !== before.cp) delta.cp = p.cp - before.cp;
    await this.emit({ t: 'tile', player: idx, tile: tile.id, tileType: tile.type, delta });
    await this.sabotagePhase(p, ctrl);
  }

  private async moveAlong(p: PlayerState, ctrl: Controller, steps: number): Promise<number[]> {
    const s = this.state;
    const path: number[] = [];
    for (let i = 0; i < steps; i++) {
      const cur = s.board.tiles[p.pos]!;
      if (cur.id === s.board.summit) break;
      let nextId: number;
      if (cur.next.length > 1) {
        const c = await ctrl.choosePath(s, p.id, cur.next);
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
      const prevZone = s.board.tiles[p.pos]!.zone;
      p.pos = nextId;
      path.push(nextId);
      const nt = s.board.tiles[nextId]!;
      if (nt.zone !== prevZone) p.stamina = Math.min(p.stamina, this.staminaCap(p)); // 나이가 들면 체력 상한도 달라진다
      if (nextId === s.board.summit) {
        await this.arrive(p);
        break;
      }
      // 이정표(인생의 갈림길)는 반드시 멈춰 서서 결정한다
      if (nt.type === 'milestone') break;
    }
    return path;
  }

  private async arrive(p: PlayerState) {
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
      const cd = Math.max(s.tuning.countdownRounds, Math.ceil(zones * s.tuning.countdownPerZone * LENGTH_FACTOR[(s.config.length ?? 1) - 1]!));
      this.countdownEndsRound = s.round + cd;
      s.countdownLeft = cd;
    }
    this.log(`${p.name} 정상 도착 (${p.arrivalRank}등)`);
    await this.emit({ t: 'arrive', player: p.id, rank: p.arrivalRank });
    if (s.arrivalCount === 1 && s.countdownLeft !== null) await this.emit({ t: 'countdown', rounds: s.countdownLeft });
  }

  private async resolveTile(p: PlayerState, ctrl: Controller, tile: Tile): Promise<void> {
    const s = this.state;
    this.m(`tile:${tile.type}`);
    switch (tile.type) {
      case 'journey':
      case 'activity':
      case 'trouble':
        return this.resolveJourney(p, ctrl, tile);
      case 'camp': {
        this.applyEffect(p, { stamina: 2 });
        const mates = s.players.filter((o) => o !== p && o.pos === p.pos).length;
        if (mates > 0) this.applyEffect(p, { network: 1 });
        return;
      }
      case 'estate':
        return this.resolveEstate(p, ctrl, tile);
      case 'lodge':
        if (p.stats.asset >= LODGE_COST && (await ctrl.chooseLodge(s, p.id))) {
          this.applyEffect(p, { asset: -LODGE_COST, ...LODGE_EFFECT });
          this.m('lodgeBought');
          await this.emit({ t: 'lodge', player: p.id });
        }
        return;
      case 'weather': {
        const w = this.drawWeather();
        for (const o of s.players) this.applyEffect(o, w.effect);
        this.log(`날씨: ${w.title}`);
        await this.emit({ t: 'weather', player: p.id, card: w });
        return;
      }
      case 'milestone': {
        this.applyEffect(p, { asset: 1 }); // 이정표 축하금
        await this.resolveMilestone(p, ctrl, tile.zone, tile);
        this.applyEffect(p, this.lifeDividend(p));
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

  /** 인생 상태가 주는 꾸준한 이득: 이정표를 지날 때마다 받는다 (집값, 가족과의 행복 등. 월급은 섬을 옮길 때 따로 받는다) */
  lifeDividend(p: PlayerState): Effect {
    const l = p.life;
    const e: Effect = {};
    const add = (k: 'asset' | 'happy' | 'network', n: number) => {
      e[k] = (e[k] ?? 0) + n;
    };
    if (l.partner) add('happy', 1);
    if (l.children > 0) add('network', 1);
    if (l.grandchildren > 0) add('happy', 1);
    const h = houseDividend(l);
    for (const k of ['asset', 'happy', 'network', 'growth'] as const) if (h[k]) e[k] = (e[k] ?? 0) + h[k]!;
    if (h.stamina) e.stamina = (e.stamina ?? 0) + h.stamina;
    return e;
  }

  /** 성인이 되면(성인 초반~말기) 직업을 정한다. 라이프처럼 정해진 직업으로 월급을 받는다 */
  private async maybeChooseJob(p: PlayerState, ctrl: Controller): Promise<void> {
    const zone = this.state.board.tiles[p.pos]!.zone;
    if (p.life.jobAsked || p.life.jobId || zone < 5 || zone > 7) return;
    p.life.jobAsked = true;
    const offer = jobOffer((n) => this.rng.int(n), p.stats.growth);
    const choices: JobChoice[] = offer.map(({ job, enabled }) => ({ id: job.id, name: job.name, icon: job.icon, salary: job.salary, minGrowth: job.minGrowth, perkText: job.perkText, enabled }));
    let pick = await ctrl.chooseJob(this.state, p.id, choices);
    if (!Number.isInteger(pick) || pick < 0 || pick >= choices.length || !choices[pick]!.enabled) pick = choices.findIndex((c) => c.enabled);
    const job = JOB_BY_ID.get(choices[pick]!.id)!;
    p.life.jobId = job.id;
    p.life.career = job.name;
    this.m(`job:${job.id}`);
    await this.emit({ t: 'job', player: p.id, job: job.name, salary: job.salary });
  }

  /** 섬을 옮길 때마다 월급(은퇴 후에는 연금)을 받는다 */
  private async payday(p: PlayerState, zone: number): Promise<void> {
    if (!p.life.jobId) return;
    const pension = zone >= 8;
    const amount = pension ? pensionOf(p.life) : salaryOf(p.life);
    const job = JOB_BY_ID.get(p.life.jobId)!;
    const effect: Effect = { asset: amount, ...(pension ? {} : job.perk) };
    if (!amount) return;
    this.applyEffect(p, effect);
    this.m(pension ? 'pensionPaid' : 'salaryPaid', amount);
    await this.emit({ t: 'payday', player: p.id, zone, job: job.name, amount, pension, effect });
  }

  /** 부동산 칸: 원래 있는 집을 사거나 직접 지을 수 있고, 돈이 많으면 별장도 살 수 있다 (사는 집은 그대로) */
  private async resolveEstate(p: PlayerState, ctrl: Controller, tile: Tile): Promise<void> {
    const offer = makeOffer(p.life, p.stats.asset);
    if (!hasAnythingToBuy(offer)) {
      this.applyEffect(p, { happy: 1 }); // 모델하우스 구경
      return;
    }
    await this.resolveHouse(p, ctrl, tile, false);
  }

  /** 집/별장 구매 흐름. onlyHome=true 면 사는 집만(이정표의 내 집 마련) */
  private async resolveHouse(p: PlayerState, ctrl: Controller, tile: Tile, onlyHome: boolean): Promise<void> {
    const offer: HouseOffer = makeOffer(p.life, p.stats.asset, onlyHome);
    if (!hasAnythingToBuy(offer)) return;
    const answer = await ctrl.chooseHouse(this.state, p.id, offer);
    if (!answer) return;
    const q = validAnswer(answer, offer);
    if (!q) return;
    const spec = { ...q.spec, tileId: tile.id, zone: tile.zone };
    this.applyEffect(p, q.effect);
    if (spec.kind === 'villa') {
      p.life.villa = spec;
    } else {
      p.life.house = spec;
      p.life.home = true;
    }
    this.m(spec.kind === 'villa' ? 'villaBought' : spec.kind === 'custom' ? 'houseBuilt' : 'houseBought');
    await this.emit({ t: 'house', player: p.id, spec, effect: q.effect });
  }

  /** 구간 끝에서 인생의 갈림길(진학·취업·결혼·집·은퇴…)을 고른다 */
  private async resolveMilestone(p: PlayerState, ctrl: Controller, zone: number, tile: Tile): Promise<void> {
    const info = MILESTONES[zone];
    if (!info) return;
    const choices: MilestoneChoice[] = info.options.map((o) => {
      const enabled = meets(o.requires, p.life, p.stats.asset);
      return { id: o.id, name: o.name, desc: o.desc, effect: o.effect, ...(o.dc ? { dc: o.dc } : {}), ...(o.fail ? { fail: o.fail } : {}), enabled, why: enabled ? '' : reqText(o.requires) };
    });
    if (!choices.some((c) => c.enabled)) return;
    let pick = await ctrl.chooseMilestone(this.state, p.id, zone, info.title, choices);
    if (!Number.isInteger(pick) || pick < 0 || pick >= choices.length || !choices[pick]!.enabled) pick = choices.findIndex((c) => c.enabled);
    const opt = info.options[pick]!;
    let success: boolean | null = null;
    let effect = opt.effect;
    if (opt.action === 'house') {
      await this.resolveHouse(p, ctrl, tile, true);
      this.m(`milestone:${opt.id}`);
      return;
    }
    if (opt.dc) {
      success = this.rng.die() >= opt.dc;
      effect = success ? opt.effect : (opt.fail ?? {});
    }
    this.applyEffect(p, effect);
    this.m(`milestone:${opt.id}`);
    await this.emit({ t: 'milestone', player: p.id, zone, option: opt.name, success, effect });
  }

  /** 지름길은 험해서 주사위가 한 단계 어렵고 체력이 더 든다. 그래서 주사위 선택지만 가능하다 */
  private harden(card: JourneyCard): JourneyCard {
    return {
      ...card,
      options: card.options.map((opt) =>
        opt.roll
          ? { ...opt, roll: { ...opt.roll, dc: Math.min(6, opt.roll.dc + 1) }, cost: { ...opt.cost, stamina: (opt.cost?.stamina ?? 0) + 1 } }
          : opt,
      ),
    };
  }

  /** 해당 스탯 6마다 주사위 +1 (최대 +2): 준비된 사람이 기회를 잡는다 */
  rollBonus(p: PlayerState, stat?: StatKey): number {
    return stat ? Math.min(2, Math.floor(p.stats[stat] / 6)) : 0;
  }

  /** 선택지의 조건·비용을 이 플레이어가 맞출 수 있는지 */
  optionState(p: PlayerState, opt: CardOption, risky: boolean): OptionState {
    const bonus = this.rollBonus(p, opt.roll?.stat);
    const names = { network: '인맥', growth: '성장', asset: '자산', happy: '행복' } as const;
    if (risky && !opt.roll) return { enabled: false, why: '험한 지름길에서는 맞서야 해요', bonus };
    for (const k of ['network', 'growth', 'asset', 'happy'] as const) {
      const need = opt.gate?.[k];
      if (need !== undefined && p.stats[k] < need) return { enabled: false, why: `${names[k]} ${need} 이상 필요 (지금 ${p.stats[k]})`, bonus };
    }
    const c = opt.cost;
    if (c?.stamina && p.stamina < c.stamina) return { enabled: false, why: `체력 ${c.stamina} 필요 (지금 ${p.stamina})`, bonus };
    if (c?.asset && p.stats.asset < c.asset) return { enabled: false, why: `💰${c.asset} 필요 (지금 ${p.stats.asset})`, bonus };
    if (c?.cp && p.cp < c.cp) return { enabled: false, why: `✨${c.cp} 필요`, bonus };
    return { enabled: true, why: '', bonus };
  }

  private async resolveJourney(p: PlayerState, ctrl: Controller, tile: Tile): Promise<void> {
    const s = this.state;
    const deck = tile.type as CardDeck;
    const drawn = this.drawCard(deck, tile.zone, p);
    const risky = !!tile.risky;
    const card = risky ? this.harden(drawn) : drawn;
    const states = card.options.map((o) => this.optionState(p, o, risky));
    let pick = await ctrl.chooseCardOption(s, p.id, card, states);
    if (!Number.isInteger(pick) || pick < 0 || pick >= card.options.length || !states[pick]!.enabled) {
      pick = states.findIndex((st) => st.enabled);
      if (pick < 0) pick = card.options.findIndex((o) => o.roll) >= 0 ? card.options.findIndex((o) => o.roll) : 0; // 아무것도 못 고르면 가장 가까운 것
    }
    const opt = card.options[pick]!;
    // 값을 치른다 (모자라면 있는 만큼만)
    const c = opt.cost;
    if (c) {
      this.applyEffect(p, {
        stamina: -Math.min(c.stamina ?? 0, p.stamina),
        asset: -Math.min(c.asset ?? 0, p.stats.asset),
        cp: -Math.min(c.cp ?? 0, p.cp),
      });
    }

    let outcome = opt.win;
    let roll: number | null = null;
    let success: boolean | null = null;
    let boost = 0;
    let rerolled = false;
    const bonus = this.rollBonus(p, opt.roll?.stat);
    if (opt.roll) {
      this.m('challengeTried');
      p.track.challengesTried++;
      boost = clamp(await ctrl.chooseCpBoost(s, p.id, card, pick), 0, Math.min(2, p.cp));
      if (boost) this.applyEffect(p, { cp: -boost });
      roll = this.rng.die();
      let ok = roll + boost + bonus >= opt.roll.dc;
      if (!ok && p.cp >= s.tuning.rerollCost && (await ctrl.wantReroll(s, p.id, card, pick, roll))) {
        rerolled = true;
        this.applyEffect(p, { cp: -s.tuning.rerollCost });
        roll = this.rng.die();
        ok = roll + boost + bonus >= opt.roll.dc;
        this.m('rerolls');
      }
      success = ok;
      if (ok) {
        p.track.challengesWon++;
        this.m('challengeWon');
        outcome = opt.win;
      } else {
        outcome = opt.lose ?? { text: '잘 풀리지 않았어요.', effect: {} };
      }
    } else {
      this.m('safeChosen');
    }
    this.applyEffect(p, outcome.effect);
    await this.emit({ t: 'card', player: p.id, deck, card, option: pick, boost, bonus, roll, success, rerolled, outcome });
  }

  private async resolvePath(p: PlayerState, ctrl: Controller, zone: number): Promise<void> {
    const s = this.state;
    const cap = Math.ceil(s.players.length / 2);
    const available = [0, 1, 2].map((i) => (s.pathSlots[`${zone}:${i}`] ?? 0) < cap);
    if (!available.some(Boolean)) {
      this.m('pathAllFull');
      return;
    }
    const pick = await ctrl.choosePathOption(s, p.id, zone, available);
    if (pick < 0 || pick > 2 || !available[pick]) return;
    const key = `${zone}:${pick}`;
    s.pathSlots[key] = (s.pathSlots[key] ?? 0) + 1;
    this.applyEffect(p, PATH_ARCHETYPES[pick]!);
    p.track.pathsTaken++;
    this.m('pathTaken');
    await this.emit({ t: 'pathOption', player: p.id, zone, option: pick });
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

  private async sabotagePhase(p: PlayerState, ctrl: Controller): Promise<void> {
    const s = this.state;
    if (p.cp < s.tuning.sabotageCost) return;
    const targets = this.sabotageTargets(p, false);
    if (!targets.length) return;
    const t = await ctrl.chooseSabotage(s, p.id, targets, false);
    if (t === null || !targets.includes(t)) return;
    const target = s.players[t]!;
    this.applyEffect(p, { cp: -s.tuning.sabotageCost });
    this.applyEffect(target, SABOTAGE_EFFECT);
    target.track.sabotaged++;
    target.sabotageImmuneUntilRound = s.round + (s.config.length ?? 1); // 연속 방해 방지 (긴 여행일수록 더 오래)
    this.m('sabotages');
    this.log(`${p.name} → ${target.name} 방해`);
    await this.emit({ t: 'sabotage', from: p.id, to: target.id, free: false });
  }

  /** 정상 지킴이 행동: 무료, 약한 효과 */
  private async keeperAction(p: PlayerState, ctrl: Controller): Promise<void> {
    const s = this.state;
    const targets = this.sabotageTargets(p, true);
    if (!targets.length) return;
    const t = await ctrl.chooseSabotage(s, p.id, targets, true);
    if (t === null || !targets.includes(t)) return;
    this.applyEffect(s.players[t]!, WIND_EFFECT);
    this.m('winds');
    await this.emit({ t: 'sabotage', from: p.id, to: t, free: true });
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

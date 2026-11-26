import type { Controller, GameState, JourneyCard } from '../engine';
import { LODGE_COST, LODGE_EFFECT, PATH_ARCHETYPES, ZONES, distancesToSummit } from '../engine';
import type { Ask } from '../shared/protocol';
import type { Room } from './room';

export const FALLBACK = Symbol('fallback');

/**
 * 사람 플레이어. 결정이 필요할 때 클라이언트에 질문(ask)을 보내고 답을 기다린다.
 * 시간이 초과되거나 연결이 끊기면 대신 봇(fallback)이 결정한다.
 */
export class HumanController implements Controller {
  readonly name = 'human';
  constructor(
    private room: Room,
    private seat: number,
    private fallback: Controller,
  ) {}

  private ask<T>(ask: Ask, validate: (v: unknown) => T | typeof FALLBACK): Promise<T | typeof FALLBACK> {
    return this.room.ask(this.seat, ask).then((v) => (v === FALLBACK ? FALLBACK : validate(v)));
  }

  async chooseDie(s: GameState, me: number, dice: [number, number]): Promise<0 | 1> {
    const r = await this.ask(
      { kind: 'die', dice, bonus: s.tuning.moveBonus, cp: s.players[me]!.cp, maxCp: s.tuning.maxCp },
      (v) => (v === 0 || v === 1 ? v : FALLBACK),
    );
    return r === FALLBACK ? this.fallback.chooseDie(s, me, dice) : r;
  }

  async choosePath(s: GameState, me: number, options: number[]): Promise<number> {
    const d = distancesToSummit(s.board).min;
    const r = await this.ask(
      {
        kind: 'path',
        options: options.map((id) => ({ tileId: id, route: s.board.tiles[id]!.route ?? null, distance: d[id]! + 1 })),
        stamina: s.players[me]!.stamina,
      },
      (v) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < options.length ? v : FALLBACK),
    );
    return r === FALLBACK ? this.fallback.choosePath(s, me, options) : r;
  }

  async chooseCardOption(s: GameState, me: number, card: JourneyCard, canSafe: boolean): Promise<'safe' | 'challenge'> {
    const p = s.players[me]!;
    const r = await this.ask(
      { kind: 'card', deck: s.board.tiles[p.pos]!.type as 'journey' | 'activity' | 'trouble', card, canSafe, stamina: p.stamina, cp: p.cp },
      (v) => (v === 'safe' || v === 'challenge' ? v : FALLBACK),
    );
    return r === FALLBACK ? this.fallback.chooseCardOption(s, me, card, canSafe) : r;
  }

  async chooseCpBoost(s: GameState, me: number, card: JourneyCard): Promise<number> {
    const cp = s.players[me]!.cp;
    if (cp <= 0) return 0; // 쓸 CP 가 없으면 묻지 않는다
    const r = await this.ask({ kind: 'boost', card, cp }, (v) =>
      typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 2 ? v : FALLBACK,
    );
    return r === FALLBACK ? this.fallback.chooseCpBoost(s, me, card) : r;
  }

  async wantReroll(s: GameState, me: number, card: JourneyCard, roll: number): Promise<boolean> {
    const r = await this.ask({ kind: 'reroll', card, roll, cost: s.tuning.rerollCost }, (v) =>
      typeof v === 'boolean' ? v : FALLBACK,
    );
    return r === FALLBACK ? this.fallback.wantReroll(s, me, card, roll) : r;
  }

  async choosePathOption(s: GameState, me: number, zone: number, available: boolean[]): Promise<number> {
    const z = ZONES[zone - 1]!;
    const r = await this.ask(
      { kind: 'pathOption', zone, names: [...z.pathNames], effects: PATH_ARCHETYPES.map((e) => ({ ...e })), available },
      (v) => (typeof v === 'number' && Number.isInteger(v) && v >= -1 && v <= 2 && (v === -1 || available[v]) ? v : FALLBACK),
    );
    return r === FALLBACK ? this.fallback.choosePathOption(s, me, zone, available) : r;
  }

  async chooseLodge(s: GameState, me: number): Promise<boolean> {
    const r = await this.ask(
      { kind: 'lodge', cost: LODGE_COST, effect: { ...LODGE_EFFECT }, asset: s.players[me]!.stats.asset },
      (v) => (typeof v === 'boolean' ? v : FALLBACK),
    );
    return r === FALLBACK ? this.fallback.chooseLodge(s, me) : r;
  }

  async chooseSabotage(s: GameState, me: number, targets: number[], free: boolean): Promise<number | null> {
    const r = await this.ask(
      { kind: 'sabotage', targets, free, cost: s.tuning.sabotageCost, cp: s.players[me]!.cp },
      (v) => (v === null || (typeof v === 'number' && targets.includes(v)) ? v : FALLBACK),
    );
    return r === FALLBACK ? this.fallback.chooseSabotage(s, me, targets, free) : r;
  }
}

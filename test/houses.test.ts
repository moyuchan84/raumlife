import { describe, expect, it } from 'vitest';
import {
  BUILD_SIZES,
  DEFAULT_TUNING,
  Game,
  READY_HOUSES,
  VILLAS,
  VILLA_MIN_ASSET,
  emptyLife,
  hasAnythingToBuy,
  houseDividend,
  makeOffer,
  quote,
  validAnswer,
  type Controller,
  type GameConfig,
  type GameEvent,
  type GameState,
  type HouseAnswer,
  type HouseOffer,
  type JourneyCard,
} from '../src/engine';
import { createBot } from '../src/ai/bots';

const cfg = (over: Partial<GameConfig> = {}): GameConfig => ({ players: 2, startZone: 1, endZone: 10, difficulty: 'normal', seed: 1, ...over });

describe('집 데이터', () => {
  it('원래 있는 집은 값이 오를수록 행복이 크고, 직접 짓기는 같은 규모에서 더 싸다', () => {
    const sorted = READY_HOUSES.slice().sort((a, b) => a.price - b.price);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.happy).toBeGreaterThan(sorted[i - 1]!.happy);
    for (const sz of BUILD_SIZES) {
      const comparable = READY_HOUSES.find((h) => h.size === sz.size && h.price >= sz.price);
      if (comparable) expect(sz.happy / sz.price).toBeLessThanOrEqual(comparable.happy / comparable.price + 0.8);
    }
  });

  it('견적: 규모와 옵션의 값이 더해지고 효과도 더해진다', () => {
    const base = quote({ kind: 'custom', size: 2, style: 0, color: 0, extras: [] })!;
    expect(base.spec.price).toBe(5);
    expect(base.effect).toMatchObject({ asset: -5, happy: 4 });
    const full = quote({ kind: 'custom', size: 3, style: 1, color: 2, extras: ['garden', 'pool', 'attic', 'solar'] })!;
    expect(full.spec.price).toBe(8 + 1 + 2 + 1 + 1);
    expect(full.effect).toMatchObject({ asset: -13, happy: 6 + 2, network: 1, growth: 1 });
    expect(full.spec.extras).toHaveLength(4);
    // 같은 옵션을 두 번 넣어도 한 번만 계산
    expect(quote({ kind: 'custom', size: 1, style: 0, color: 0, extras: ['pool', 'pool'] })!.spec.price).toBe(3 + 2);
  });

  it('잘못된 답은 거부한다', () => {
    expect(quote({ kind: 'ready', id: 'nope' })).toBeNull();
    expect(quote({ kind: 'villa', id: 'nope' })).toBeNull();
    expect(quote({ kind: 'custom', size: 9 as never, style: 0, color: 0, extras: [] })).toBeNull();
    expect(quote({ kind: 'custom', size: 1, style: 99, color: 0, extras: [] })).toBeNull();
    expect(quote({ kind: 'custom', size: 1, style: 0, color: -1, extras: [] })).toBeNull();
    expect(quote({ kind: 'custom', size: 1, style: 0, color: 0, extras: ['rocket'] })).toBeNull();
  });

  it('부동산 제안: 집이 없을 때만 집을, 돈이 많을 때만 별장을 살 수 있다 (집이 있어도 별장은 가능)', () => {
    const life = emptyLife();
    const poor = makeOffer(life, 1);
    expect(poor.canBuyHome).toBe(true);
    expect(poor.canBuyVilla).toBe(false);
    expect(hasAnythingToBuy(poor)).toBe(false);
    const mid = makeOffer(life, 3);
    expect(mid.ready.filter((h) => h.affordable).map((h) => h.id)).toEqual(['studio', 'row']);
    expect(hasAnythingToBuy(mid)).toBe(true);
    const rich = makeOffer({ ...life, home: true }, VILLA_MIN_ASSET);
    expect(rich.canBuyHome).toBe(false); // 이미 집이 있다
    expect(rich.canBuyVilla).toBe(true); // 하지만 별장은 살 수 있다
    expect(rich.villas.filter((v) => v.affordable)).toHaveLength(VILLAS.length - (VILLAS.filter((v) => v.price > VILLA_MIN_ASSET).length));
    const has = makeOffer({ ...life, home: true, villa: { kind: 'villa' } as never }, 50);
    expect(has.canBuyVilla).toBe(false);
    expect(makeOffer(life, 50, true).canBuyVilla).toBe(false); // 이정표의 '내 집 마련'에서는 집만
  });

  it('돈이 모자라거나 이미 가진 것은 살 수 없다', () => {
    const offer = makeOffer(emptyLife(), 3);
    expect(validAnswer({ kind: 'ready', id: 'penthouse' }, offer)).toBeNull();
    expect(validAnswer({ kind: 'ready', id: 'studio' }, offer)).not.toBeNull();
    expect(validAnswer({ kind: 'villa', id: 'sea' }, offer)).toBeNull();
    expect(validAnswer({ kind: 'custom', size: 3, style: 0, color: 0, extras: [] }, offer)).toBeNull();
    const withHome = makeOffer({ ...emptyLife(), home: true }, 99);
    expect(validAnswer({ kind: 'ready', id: 'studio' }, withHome)).toBeNull();
    expect(validAnswer({ kind: 'villa', id: 'sea' }, withHome)).not.toBeNull();
  });

  it('꾸준한 이득: 집은 💰+1, 태양광은 더 +1, 별장은 ❤️+1 💪+1 (집은 그대로)', () => {
    const life = emptyLife();
    expect(houseDividend(life)).toEqual({});
    const house = { kind: 'ready', extras: [] } as never;
    expect(houseDividend({ ...life, house })).toEqual({ asset: 1 });
    expect(houseDividend({ ...life, house: { kind: 'custom', extras: ['solar'] } as never })).toEqual({ asset: 2 });
    expect(houseDividend({ ...life, house, villa: { kind: 'villa', extras: [] } as never })).toEqual({ asset: 1, happy: 1, stamina: 1 });
  });
});

/** 안전한 선택만 하되, 집 결정은 주어진 함수로 */
class Buyer implements Controller {
  name = 'buyer';
  offers: HouseOffer[] = [];
  constructor(private pick: (o: HouseOffer) => HouseAnswer | null) {}
  chooseDie(_s: GameState, _m: number, d: [number, number]): 0 | 1 { return d[0] >= d[1] ? 0 : 1; }
  choosePath(): number { return 0; }
  chooseCardOption(_s: GameState, _m: number, _c: JourneyCard, canSafe: boolean) { return canSafe ? ('safe' as const) : ('challenge' as const); }
  chooseCpBoost(): number { return 0; }
  wantReroll(): boolean { return false; }
  choosePathOption(_s: GameState, _m: number, _z: number, a: boolean[]): number { return a.findIndex(Boolean); }
  chooseJob(_s: GameState, _m: number, o: { enabled: boolean }[]): number { return o.findIndex((x) => x.enabled); }
  chooseMilestone(_s: GameState, _m: number, _z: number, _t: string, o: { enabled: boolean }[]): number { return o.findIndex((x) => x.enabled); }
  chooseHouse(_s: GameState, _m: number, offer: HouseOffer): HouseAnswer | null {
    this.offers.push(offer);
    return this.pick(offer);
  }
  chooseLodge(): boolean { return false; }
  chooseSabotage(): number | null { return null; }
}

describe('집 사기·짓기 진행', () => {
  const build: HouseAnswer = { kind: 'custom', size: 1, style: 5, color: 4, extras: ['garden'] };

  it('부동산에서 직접 짓거나 산 집은 상태·이벤트에 반영되고 돈이 빠진다', async () => {
    let built = 0;
    for (let seed = 1; seed <= 40 && built < 3; seed++) {
      const events: GameEvent[] = [];
      const game = new Game(cfg({ seed, startZone: 5, endZone: 7, players: 1 }), { onEvent: (e) => void events.push(e) });
      game.state.players[0]!.stats.asset = 20; // 부자로 시작
      const buyer = new Buyer((o) => (o.canBuyHome ? build : null));
      await game.run([buyer]);
      const p = game.state.players[0]!;
      const ev = events.filter((e): e is Extract<GameEvent, { t: 'house' }> => e.t === 'house');
      if (ev.length) {
        built++;
        expect(p.life.home).toBe(true);
        expect(p.life.house).toMatchObject({ kind: 'custom', size: 1, style: 5, price: 4, extras: ['garden'] });
        expect(p.life.house!.tileId).toBe(ev[0]!.spec.tileId);
        expect(ev).toHaveLength(1); // 집은 한 채만
        expect(game.state.board.tiles[p.life.house!.tileId]!.type === 'estate' || game.state.board.tiles[p.life.house!.tileId]!.type === 'milestone').toBe(true);
      }
    }
    expect(built).toBeGreaterThan(0);
  });

  it('별장을 사도 사는 집은 없어지지 않고, 별장은 한 채만 살 수 있다', async () => {
    let both = 0;
    for (let seed = 1; seed <= 60 && both < 3; seed++) {
      const game = new Game(cfg({ seed: seed + 500, startZone: 5, endZone: 9, players: 1, length: 2 }));
      game.state.players[0]!.stats.asset = 40;
      const buyer = new Buyer((o) => (o.canBuyHome ? { kind: 'ready', id: 'studio' } : o.canBuyVilla ? { kind: 'villa', id: 'sea' } : null));
      await game.run([buyer]);
      const p = game.state.players[0]!;
      if (p.life.house && p.life.villa) {
        both++;
        expect(p.life.home).toBe(true);
        expect(p.life.house.kind).toBe('ready');
        expect(p.life.villa.kind).toBe('villa');
      }
      // 어떤 경우에도 별장 구매 제안은 별장이 없을 때만 온다
      for (const o of buyer.offers) if (o.hasVilla) expect(o.canBuyVilla).toBe(false);
    }
    expect(both).toBeGreaterThan(0);
  });

  it('유효하지 않은 답(이미 집이 있는데 또 사기)은 무시된다', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const events: GameEvent[] = [];
      // 7번 섬에서 시작하면 이미 집이 있다
      const game = new Game(cfg({ seed: seed + 900, startZone: 7, endZone: 9, players: 1, length: 2 }), { onEvent: (e) => void events.push(e) });
      game.state.players[0]!.stats.asset = 30;
      const before = game.state.players[0]!.life.house;
      const buyer = new Buyer(() => ({ kind: 'ready', id: 'studio' }));
      await game.run([buyer]);
      const p = game.state.players[0]!;
      expect(p.life.house).toEqual(before); // 다른 집으로 바뀌지 않는다
      expect(events.some((e) => e.t === 'house')).toBe(false);
    }
  });

  it('돈이 모자란 답은 무시된다', async () => {
    const game = new Game(cfg({ seed: 77, startZone: 5, endZone: 6, players: 1 }));
    const offer = makeOffer(game.state.players[0]!.life, 1);
    expect(validAnswer({ kind: 'ready', id: 'penthouse' }, offer)).toBeNull();
    expect(validAnswer({ kind: 'custom', size: 1, style: 0, color: 0, extras: [] }, offer)).toBeNull();
  });

  it('이정표의 내 집 마련은 집 구매 화면을 연다 (별장은 제안되지 않는다)', async () => {
    let opened = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const game = new Game(cfg({ seed: seed + 1200, startZone: 5, endZone: 7, players: 1 }));
      game.state.players[0]!.stats.asset = 25;
      const buyer = new Buyer((o) => (o.canBuyHome ? { kind: 'ready', id: 'apt' } : null));
      // 이정표에서 '내 집 마련'을 고른다
      (buyer as unknown as { chooseMilestone: Controller['chooseMilestone'] }).chooseMilestone = (_s, _m, _z, _t, o) => {
        const i = o.findIndex((x) => x.enabled && /내 집 마련/.test(x.name));
        return i >= 0 ? i : o.findIndex((x) => x.enabled);
      };
      await game.run([buyer]);
      if (buyer.offers.length) opened++;
      for (const o of buyer.offers) if (!o.canBuyHome) expect(o.canBuyVilla || o.hasHome).toBe(true);
    }
    expect(opened).toBeGreaterThan(0);
  });

  it('살 것이 없는 부동산 칸은 구경만 해도 ❤️+1을 준다', async () => {
    let visits = 0;
    for (let seed = 1; seed <= 60 && visits < 3; seed++) {
      const events: GameEvent[] = [];
      const game = new Game(cfg({ seed: seed + 1500, startZone: 7, endZone: 8, players: 1 }), { onEvent: (e) => void events.push(e) });
      game.state.players[0]!.stats.asset = 0; // 돈이 없고 집은 이미 있다 (7번 섬 시작 상태)
      await game.run([new Buyer(() => null)]);
      for (const e of events) {
        if (e.t === 'tile' && e.tileType === 'estate') {
          visits++;
          expect(e.delta.happy).toBe(1);
        }
      }
    }
    expect(visits).toBeGreaterThan(0);
  });

  it('긴 여행에서도 규칙이 유지되고 한 판이 끝까지 진행된다 (봇 자기대전)', async () => {
    for (const L of [2, 3] as const) {
      for (let g = 0; g < 6; g++) {
        const game = new Game(cfg({ seed: g + 40, players: 3, length: L }));
        const res = await game.run([0, 1, 2].map((i) => createBot('greedy', i)));
        expect(game.state.finished).toBe(true);
        expect(res.metrics.safetyStop ?? 0).toBe(0);
        for (const p of game.state.players) {
          expect(p.stats.asset).toBeGreaterThanOrEqual(0);
          if (p.life.house) expect(p.life.home).toBe(true);
          expect(!p.life.villa || p.life.villa.kind === 'villa').toBe(true);
        }
      }
    }
  });

  it('여행 길이가 길수록 판이 길어지고 스탯 목표도 오른다', () => {
    const goals = (L: 1 | 2 | 3) => new Game(cfg({ length: L, difficulty: 'easy' })).state.goals;
    const g = (L: 1 | 2 | 3) => {
      const x = goals(L)[0]!;
      return x.kind === 'stat' ? x.target : 0;
    };
    // 같은 시드에서 첫 목표는 같은 스탯이므로 목표치를 직접 비교할 수 있다
    expect(g(2)).toBeGreaterThanOrEqual(g(1));
    expect(g(3)).toBeGreaterThan(g(1));
    expect(DEFAULT_TUNING.lengthGain).toHaveLength(3);
  });
});

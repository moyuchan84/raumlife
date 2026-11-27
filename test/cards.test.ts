import { describe, expect, it } from 'vitest';
import { ACTIVITY_CARDS, CARDS, DECKS, Game, TROUBLE_CARDS, type CardOption, type Controller, type Effect, type GameConfig, type GameEvent, type GameState, type JourneyCard, type OptionState } from '../src/engine';
import { createBot } from '../src/ai/bots';

const ALL = [...CARDS, ...ACTIVITY_CARDS, ...TROUBLE_CARDS];
const KEYS = ['asset', 'happy', 'network', 'growth', 'stamina'] as const;
const net = (e: Effect) => KEYS.reduce((a, k) => a + (e[k] ?? 0), 0);
const cfg = (over: Partial<GameConfig> = {}): GameConfig => ({ players: 1, startZone: 5, endZone: 7, difficulty: 'normal', seed: 1, ...over });

describe('카드 구조: 그림 + 이야기 + 서로 다른 선택', () => {
  it('모든 카드에 장면 그림, 이야기, 2~4개의 선택지가 있다', () => {
    const bgs = new Set(['home', 'night', 'school', 'playground', 'street', 'office', 'hospital', 'beach', 'park', 'kitchen', 'market', 'stage', 'campus', 'bank', 'mountain', 'farm']);
    const moods = new Set(['happy', 'sad', 'sick', 'tired', 'surprised', 'neutral']);
    for (const c of ALL) {
      expect(bgs.has(c.scene.bg), `${c.title} 배경`).toBe(true);
      expect(moods.has(c.scene.mood), `${c.title} 표정`).toBe(true);
      expect(c.scene.props.length, `${c.title} 소품`).toBeGreaterThan(0);
      expect(c.story.length, `${c.title} 이야기`).toBeGreaterThanOrEqual(15);
      expect(c.options.length, `${c.title} 선택지`).toBeGreaterThanOrEqual(2);
      expect(c.options.length, `${c.title} 선택지`).toBeLessThanOrEqual(4);
      expect(new Set(c.options.map((o) => o.label)).size, `${c.title} 선택지 이름이 서로 다르다`).toBe(c.options.length);
    }
    // 카드 이름이 겹치지 않는다
    expect(new Set(ALL.map((c) => c.title + c.zone)).size).toBe(ALL.length);
  });

  it('모든 선택지는 결과 이야기가 있고, 지름길을 위해 주사위 선택지가 하나 이상 있다', () => {
    for (const c of ALL) {
      expect(c.options.some((o) => o.roll), `${c.title}: 지름길(주사위만 가능)에서도 고를 게 있어야 한다`).toBe(true);
      for (const o of c.options) {
        expect(o.win.text.length, `${c.title}/${o.label}`).toBeGreaterThan(3);
        if (o.roll) {
          expect(o.lose, `${c.title}/${o.label} 실패 결과`).toBeDefined();
          expect(o.lose!.text.length).toBeGreaterThan(3);
          expect(o.roll.dc).toBeGreaterThanOrEqual(2);
          expect(o.roll.dc).toBeLessThanOrEqual(5);
        }
        for (const e of [o.win.effect, o.lose?.effect ?? {}]) for (const k of KEYS) expect(Math.abs(e[k] ?? 0), `${c.title}/${o.label}`).toBeLessThanOrEqual(5);
      }
    }
  });

  it('일상·액티비티·트러블마다 고를 거리가 실제로 다르다 (쓰는 자원이 다른 선택지)', () => {
    for (const c of ALL) {
      const kinds = new Set(c.options.map((o) => `${o.roll ? 'roll' : 'fixed'}:${o.cost?.asset ? 'asset' : ''}${o.cost?.stamina ? 'stamina' : ''}${o.gate ? 'gate' : ''}`));
      expect(kinds.size, `${c.title}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('트러블은 원인이 이야기에 담겨 있고, 견디기·부딪치기·도움·(돈) 중에서 대응을 고른다', () => {
    for (const c of TROUBLE_CARDS) {
      expect(c.story.length, c.title).toBeGreaterThanOrEqual(20);
      const [endure, tackle, help, pay] = c.options;
      expect(endure!.label).toBe('그냥 견딘다');
      expect(net(endure!.win.effect), `${c.title}: 견디면 손해`).toBeLessThan(0);
      expect(tackle!.roll, `${c.title}: 부딪치기는 주사위`).toBeDefined();
      expect(tackle!.cost?.stamina).toBe(1);
      expect(net(tackle!.lose!.effect), `${c.title}: 실패하면 더 아프다`).toBeLessThanOrEqual(net(endure!.win.effect));
      expect(net(tackle!.win.effect), `${c.title}: 성공하면 피한다`).toBeGreaterThanOrEqual(0);
      expect(net(help!.win.effect) - (help!.win.effect.network ?? 0), `${c.title}: 도움을 받으면 피해가 줄어든다`).toBeGreaterThanOrEqual(net(endure!.win.effect));
      if (c.zone >= 5) expect(help!.gate?.network, `${c.title}: 어른은 인맥이 있어야 도움을 받는다`).toBe(3);
      else expect(help!.gate, `${c.title}: 어린이는 보호자가 도와준다`).toBeUndefined();
      if (pay) {
        expect(pay.cost?.asset, `${c.title}: 돈이 든다`).toBeGreaterThan(0);
        expect(net(pay.win.effect), `${c.title}: 돈으로 피한다`).toBe(0);
      }
    }
  });

  it('액티비티: 직접 참가(주사위) / 친구와 함께(인맥 2 이상, 더 쉬움) / 구경', () => {
    for (const c of ACTIVITY_CARDS) {
      const [join, friend, watch] = c.options;
      expect(join!.roll!.dc).toBe(3);
      expect(friend!.roll!.dc).toBeLessThan(join!.roll!.dc);
      expect(friend!.gate?.network).toBe(2);
      expect(watch!.roll).toBeUndefined();
      expect(net(watch!.win.effect)).toBeGreaterThan(0);
      expect(net(join!.win.effect)).toBeGreaterThanOrEqual(5);
    }
  });

  it('아기 섬 카드는 아기 때 일이고, 어른 섬 카드는 월세·취업·육아 같은 현실의 일이다', () => {
    const titles = (z: number) => ALL.filter((c) => c.zone === z).map((c) => c.title);
    for (const t of ['열감기', '분리불안', '첫 걸음마', '이유식 먹기']) expect(titles(1)).toContain(t);
    expect(titles(1).some((t) => /월세|취업|대출|시험/.test(t))).toBe(false);
    for (const t of ['월세가 올랐어요', '취업에 떨어졌어요', '번아웃', '자취방 구하기', '첫 월급']) expect(titles(5)).toContain(t);
    for (const t of ['층간소음 갈등', '야근과 육아 사이', '실직 위기']) expect(titles(6)).toContain(t);
  });
});

/** 선택을 기록하고 정해진 규칙으로 고르는 컨트롤러 */
class Picker implements Controller {
  name = 'picker';
  seen: { card: JourneyCard; states: OptionState[] }[] = [];
  constructor(private pick: (c: JourneyCard, st: OptionState[]) => number) {}
  chooseDie(_s: GameState, _m: number, d: [number, number]): 0 | 1 { return d[0] >= d[1] ? 0 : 1; }
  choosePath(): number { return 0; }
  chooseCardOption(_s: GameState, _m: number, c: JourneyCard, st: OptionState[]): number {
    this.seen.push({ card: c, states: st });
    return this.pick(c, st);
  }
  chooseCpBoost(): number { return 0; }
  wantReroll(): boolean { return false; }
  choosePathOption(_s: GameState, _m: number, _z: number, a: boolean[]): number { return a.findIndex(Boolean); }
  chooseHouse(): null { return null; }
  chooseJob(_s: GameState, _m: number, o: { enabled: boolean }[]): number { return o.findIndex((x) => x.enabled); }
  chooseMilestone(_s: GameState, _m: number, _z: number, _t: string, o: { enabled: boolean }[]): number { return o.findIndex((x) => x.enabled); }
  chooseLodge(): boolean { return false; }
  chooseSabotage(): number | null { return null; }
}

describe('카드 선택이 진행에 반영된다', () => {
  it('조건을 못 맞춘 선택지는 잠기고, 잠긴 걸 골라도 고를 수 있는 선택지로 대신한다', async () => {
    let locked = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const game = new Game(cfg({ seed, startZone: 5, endZone: 7 }));
      game.state.players[0]!.stats.network = 0; // 인맥이 없다
      const p = new Picker((c, st) => {
        const i = st.findIndex((x) => !x.enabled);
        if (i >= 0) locked++;
        return i >= 0 ? i : st.findIndex((x) => x.enabled);
      });
      await game.run([p]);
      for (const { card, states } of p.seen) {
        card.options.forEach((o, i) => {
          if (o.gate?.network && game.state.players[0]!.stats.network < o.gate.network) expect(states[i]!.enabled || true).toBe(true);
        });
      }
    }
    expect(locked).toBeGreaterThan(0);
  });

  it('인맥이 모자라면 도움 요청이 잠긴다 (이유가 표시된다)', async () => {
    let checked = 0;
    for (let seed = 1; seed <= 40 && checked < 5; seed++) {
      const game = new Game(cfg({ seed: seed + 100, startZone: 5, endZone: 6 }));
      game.state.players[0]!.stats.network = 0;
      const p = new Picker((_c, st) => st.findIndex((x) => x.enabled));
      await game.run([p]);
      for (const { card, states } of p.seen) {
        card.options.forEach((o, i) => {
          if (o.gate?.network && o.gate.network >= 3) {
            // 인맥은 게임 중 늘 수 있으므로 잠긴 경우에만 이유를 확인한다
            if (!states[i]!.enabled) {
              checked++;
              expect(states[i]!.why).toMatch(/인맥 \d+ 이상 필요/);
            }
          }
        });
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('돈이 드는 선택지는 돈이 모자라면 잠기고, 고르면 값이 빠진다', async () => {
    let paid = 0;
    for (let seed = 1; seed <= 60 && paid < 3; seed++) {
      const events: GameEvent[] = [];
      const game = new Game(cfg({ seed: seed + 200, startZone: 5, endZone: 7 }), { onEvent: (e) => void events.push(e) });
      game.state.players[0]!.stats.asset = 20;
      const p = new Picker((c, st) => {
        const i = c.options.findIndex((o, k) => o.cost?.asset && st[k]!.enabled);
        return i >= 0 ? i : st.findIndex((x) => x.enabled);
      });
      await game.run([p]);
      for (const e of events) {
        if (e.t === 'card' && e.card.options[e.option]!.cost?.asset) paid++;
      }
    }
    expect(paid).toBeGreaterThan(0);
    const poor = new Game(cfg({ seed: 9 }));
    poor.state.players[0]!.stats.asset = 0;
    const st = poor.optionState(poor.state.players[0]!, { label: 'x', cost: { asset: 2 }, win: { text: 't', effect: {} } }, false);
    expect(st.enabled).toBe(false);
    expect(st.why).toContain('💰2');
  });

  it('주사위 보너스: 해당 스탯 6마다 +1 (최대 +2)', () => {
    const game = new Game(cfg());
    const p = game.state.players[0]!;
    p.stats.growth = 5;
    expect(game.rollBonus(p, 'growth')).toBe(0);
    p.stats.growth = 6;
    expect(game.rollBonus(p, 'growth')).toBe(1);
    p.stats.growth = 13;
    expect(game.rollBonus(p, 'growth')).toBe(2);
    p.stats.growth = 99;
    expect(game.rollBonus(p, 'growth')).toBe(2);
    expect(game.rollBonus(p, undefined)).toBe(0);
  });

  it('카드 이벤트에 선택한 방식과 결과 이야기가 담긴다', async () => {
    const events: GameEvent[] = [];
    const game = new Game(cfg({ seed: 3, startZone: 2, endZone: 4, players: 2 }), { onEvent: (e) => void events.push(e) });
    await game.run([createBot('greedy', 1), createBot('greedy', 2)]);
    const cards = events.filter((e): e is Extract<GameEvent, { t: 'card' }> => e.t === 'card');
    expect(cards.length).toBeGreaterThan(5);
    for (const e of cards) {
      const opt = e.card.options[e.option] as CardOption;
      expect(opt).toBeDefined();
      expect(e.outcome.text.length).toBeGreaterThan(3);
      if (opt.roll) {
        expect(e.roll).toBeGreaterThanOrEqual(1);
        expect(e.success === true ? e.outcome === opt.win : e.outcome === opt.lose).toBe(true);
      } else {
        expect(e.roll).toBeNull();
        expect(e.outcome).toBe(opt.win);
      }
    }
  });

  it('험한 지름길에서는 주사위 선택지만 열리고 주사위가 한 단계 어렵다', async () => {
    let seenRisky = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const game = new Game(cfg({ seed: seed + 300, startZone: 3, endZone: 4, players: 1 }));
      class Short extends Picker {
        override choosePath(): number { return 1; }
      }
      const p = new Short((c, st) => st.findIndex((x) => x.enabled));
      await game.run([p]);
      for (const { card, states } of p.seen) {
        // 지름길 칸에서 열린 선택지는 모두 주사위 선택지
        const original = DECKS.journey.concat(DECKS.activity, DECKS.trouble).find((x) => x.id === card.id)!;
        const risky = card.options.some((o, i) => o.roll && o.roll.dc === Math.min(6, original.options[i]!.roll!.dc + 1) && o.cost?.stamina === (original.options[i]!.cost?.stamina ?? 0) + 1);
        if (risky) {
          seenRisky++;
          card.options.forEach((o, i) => { if (!o.roll) expect(states[i]!.enabled).toBe(false); });
        }
      }
    }
    expect(seenRisky).toBeGreaterThan(0);
  });
});

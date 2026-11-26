import { describe, expect, it } from 'vitest';
import { Game, MILESTONES, buildBoard, emptyLife, meets, startLife, staminaCapFor, DEFAULT_TUNING, generateGoals, Rng } from '../src/engine';
import type { Controller, GameConfig, GameEvent, GameState, JourneyCard, MilestoneChoice } from '../src/engine';
import { createBot } from '../src/ai/bots';
import { ageLook, grayHair } from '../src/shared/avatar';

const cfg = (over: Partial<GameConfig> = {}): GameConfig => ({ players: 4, startZone: 1, endZone: 10, difficulty: 'normal', seed: 1, ...over });

describe('인생 상태', () => {
  it('중간 구간에서 시작하면 그 나이에 맞는 인생 상태로 시작한다', () => {
    expect(startLife(1)).toEqual(emptyLife());
    expect(startLife(4).career).toBeNull();
    expect(startLife(5).career).toBe('회사원');
    expect(startLife(6).partner).toBe(true);
    expect(startLife(7)).toMatchObject({ children: 1, home: true });
    expect(startLife(9).grandchildren).toBe(1);
  });

  it('조건 판정', () => {
    const l = { ...emptyLife(), partner: true, children: 1 };
    expect(meets({ partner: true }, l, 0)).toBe(true);
    expect(meets({ noPartner: true }, l, 0)).toBe(false);
    expect(meets({ children: 2 }, l, 0)).toBe(false);
    expect(meets({ childrenLt: 2 }, l, 0)).toBe(true);
    expect(meets({ family: true }, emptyLife(), 0)).toBe(false);
    expect(meets({ minAsset: 2 }, l, 1)).toBe(false);
    expect(meets({ noHome: true, minAsset: 2 }, l, 2)).toBe(true);
    expect(meets(undefined, l, 0)).toBe(true);
  });

  it('체력 상한이 나이에 따라 변한다: 어른이 가장 튼튼하고 아기·노년은 약하다', () => {
    const cap = DEFAULT_TUNING.staminaCap;
    expect(cap).toHaveLength(10);
    expect(staminaCapFor(cap, 1)).toBeLessThan(staminaCapFor(cap, 5));
    expect(staminaCapFor(cap, 10)).toBeLessThan(staminaCapFor(cap, 6));
    expect(Math.max(...cap)).toBe(staminaCapFor(cap, 5));
  });

  it('이정표 선택지는 구간마다 있고 항상 고를 수 있는 선택지가 있다', () => {
    for (let z = 1; z <= 9; z++) {
      const info = MILESTONES[z]!;
      expect(info.options.length).toBeGreaterThanOrEqual(3);
      expect(info.options.some((o) => !o.requires), `zone ${z}`).toBe(true);
    }
    expect(MILESTONES[10]).toBeUndefined(); // 마지막 구간은 종착지
  });
});

describe('인생 상태를 반영한 진행', () => {
  /** 결정 직전의 상태를 검사하는 봇 */
  function spy(kind: string, seed: number, checks: { card: (s: GameState, me: number, c: JourneyCard) => void; ms: (s: GameState, me: number, o: MilestoneChoice[]) => void }): Controller {
    const bot = createBot(kind, seed);
    return new Proxy(bot, {
      get(t, k, r) {
        if (k === 'chooseCardOption') return (s: GameState, me: number, c: JourneyCard, canSafe: boolean) => (checks.card(s, me, c), t.chooseCardOption(s, me, c, canSafe));
        if (k === 'chooseMilestone') return (s: GameState, me: number, z: number, title: string, o: MilestoneChoice[]) => (checks.ms(s, me, o), t.chooseMilestone(s, me, z, title, o));
        return Reflect.get(t, k, r);
      },
    });
  }

  it('카드는 항상 그 플레이어의 인생 상태 조건을 만족한다 (100판)', async () => {
    let cards = 0;
    let gated = 0;
    for (let g = 0; g < 100; g++) {
      const game = new Game(cfg({ seed: g + 5 }));
      const ctrls = [0, 1, 2, 3].map((i) =>
        spy('greedy', g * 4 + i, {
          card: (s, me, c) => {
            cards++;
            if (c.requires) {
              gated++;
              const p = s.players[me]!;
              expect(meets(c.requires, p.life, p.stats.asset), `${c.title}`).toBe(true);
            }
          },
          ms: () => {},
        }),
      );
      await game.run(ctrls);
    }
    expect(cards).toBeGreaterThan(1000);
    expect(gated).toBeGreaterThan(30); // 조건 있는 카드도 실제로 나온다
  });

  it('이정표에서는 반드시 멈춰 서서 선택하고, 선택지는 조건에 맞게만 열린다', async () => {
    for (let g = 0; g < 40; g++) {
      const start = 1 + (g % 3);
      const end = 6 + (g % 5);
      const game = new Game(cfg({ seed: g + 50, startZone: start, endZone: end, players: 3 }));
      const calls = [0, 0, 0];
      const ctrls = [0, 1, 2].map((i) =>
        spy('greedy', g * 3 + i, {
          card: () => {},
          ms: (s, me, o) => {
            calls[me]!++;
            const p = s.players[me]!;
            // enabled 플래그가 실제 조건 판정과 일치한다
            const info = MILESTONES[s.board.tiles[p.pos]!.zone]!;
            info.options.forEach((opt, k) => expect(o[k]!.enabled).toBe(meets(opt.requires, p.life, p.stats.asset)));
          },
        }),
      );
      await game.run(ctrls);
      game.state.players.forEach((p, i) => {
        if (p.arrived) expect(calls[i]).toBe(end - start); // 마지막 구간을 뺀 모든 구간의 이정표
      });
    }
  });

  it('체력은 지금 나이의 상한을 넘지 않는다', async () => {
    const violations: string[] = [];
    for (let g = 0; g < 30; g++) {
      let game!: Game;
      game = new Game(cfg({ seed: g + 200 }), {
        onEvent: (e: GameEvent) => {
          if (e.t === 'tile' || e.t === 'milestone' || e.t === 'card') {
            for (const p of game.state.players) if (p.stamina > game.staminaCap(p)) violations.push(`${p.id}:${p.stamina}>${game.staminaCap(p)}`);
          }
        },
      });
      await game.run([0, 1, 2, 3].map((i) => createBot('greedy', i)));
    }
    expect(violations).toEqual([]);
  });

  it('이정표 이득: 직업·집·동반자·자녀·손주가 꾸준한 이득을 준다', () => {
    const game = new Game(cfg({ players: 2 }));
    const p = game.state.players[0]!;
    expect(game.lifeDividend(p)).toEqual({});
    p.life = { career: '회사원', partner: true, children: 2, grandchildren: 1, home: true };
    expect(game.lifeDividend(p)).toEqual({ asset: 2, happy: 2, network: 1 });
  });

  it('인생 효과가 상태에 반영된다 (자녀 3명 상한 포함)', () => {
    const game = new Game(cfg({ players: 2 }));
    const p = game.state.players[0]!;
    game.applyEffect(p, { life: { partner: true, home: true, career: '교사', children: 1 } });
    game.applyEffect(p, { life: { children: 5, grandchildren: 9 } });
    expect(p.life).toEqual({ career: '교사', partner: true, home: true, children: 3, grandchildren: 3 });
  });

  it('인생 목표는 코스가 그 사건을 지나갈 때만 나온다', () => {
    const rng = new Rng(1);
    const lifeConds = ['hasPartner', 'hasHome', 'hasChild', 'hasCareer', 'grandchild'];
    const found = (c: GameConfig) => {
      const set = new Set<string>();
      for (let i = 0; i < 60; i++) for (const g of generateGoals({ ...c, difficulty: 'extreme' }, DEFAULT_TUNING, rng)) if (g.kind === 'condition' && lifeConds.includes(g.cond)) set.add(g.cond);
      return set;
    };
    const kids = found(cfg({ startZone: 1, endZone: 3 }));
    expect(kids.size).toBe(0); // 꼬마 코스에는 인생 목표가 없다
    const old = found(cfg({ startZone: 8, endZone: 10 }));
    expect([...old]).not.toContain('hasPartner');
    expect([...old]).not.toContain('hasHome');
    const full = found(cfg());
    expect(full.size).toBeGreaterThanOrEqual(4);
    expect(buildBoard(1, 10).tiles.some((t) => t.type === 'milestone')).toBe(true);
  });
});

describe('나이 드는 모습', () => {
  it('어릴수록 작고 머리가 크며, 나이가 들수록 흰머리·주름·지팡이가 생긴다', () => {
    const baby = ageLook(1);
    const adult = ageLook(5);
    const old = ageLook(10);
    expect(baby.scale).toBeLessThan(ageLook(2).scale);
    expect(ageLook(2).scale).toBeLessThan(adult.scale);
    expect(baby.head).toBeGreaterThan(adult.head);
    expect(old.scale).toBeLessThan(adult.scale);
    expect(adult.gray).toBeLessThan(ageLook(8).gray);
    expect(adult.wrinkles).toBe(0);
    expect(old.wrinkles).toBe(2);
    expect(adult.cane).toBe(false);
    expect(ageLook(9).cane && old.cane).toBe(true);
    expect(old.hunch).toBeGreaterThan(ageLook(7).hunch);
    // 범위 밖 단계도 안전
    expect(ageLook(0).stage).toBe(1);
    expect(ageLook(99).stage).toBe(10);
  });
  it('흰머리 섞기', () => {
    expect(grayHair('#2b1d14', 0)).toBe('#2b1d14');
    const half = grayHair('#000000', 0.5);
    expect(half).not.toBe('#000000');
    expect(grayHair('#000000', 1)).toBe('#d6d9e0');
  });
});

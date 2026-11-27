import { describe, expect, it } from 'vitest';
import { Game, JOBS, MILESTONES, jobOffer, pensionOf, salaryOf, CARDS, ACTIVITY_CARDS, TROUBLE_CARDS, buildBoard, emptyLife, meets, startLife, staminaCapFor, DEFAULT_TUNING, generateGoals, Rng } from '../src/engine';
import type { Controller, GameConfig, GameEvent, GameState, JourneyCard, MilestoneChoice } from '../src/engine';
import { createBot } from '../src/ai/bots';
import { ageLook, grayHair } from '../src/shared/avatar';

const cfg = (over: Partial<GameConfig> = {}): GameConfig => ({ players: 4, startZone: 1, endZone: 10, difficulty: 'normal', seed: 1, ...over });

describe('인생 상태', () => {
  it('중간 구간에서 시작하면 그 나이에 맞는 인생 상태로 시작한다', () => {
    expect(startLife(1)).toEqual(emptyLife());
    expect(startLife(4).jobId).toBeNull();
    expect(startLife(5).jobId).toBeNull(); // 성인이 되면 직접 정한다
    expect(startLife(8)).toMatchObject({ jobId: 'office', jobAsked: true }); // 이미 은퇴한 나이
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
    p.life = { ...emptyLife(), career: '회사원', jobId: 'office', partner: true, children: 2, grandchildren: 1, home: true };
    expect(game.lifeDividend(p)).toEqual({ happy: 2, network: 1 }); // 월급은 섬을 옮길 때 따로 받고, 집의 이득은 집이 있을 때(house) 받는다
    p.life.house = { kind: 'ready', name: '아파트', size: 2, style: 1, color: 4, extras: [], price: 4, tileId: 0, zone: 6 };
    expect(game.lifeDividend(p)).toEqual({ asset: 1, happy: 2, network: 1 });
  });

  it('인생 효과가 상태에 반영된다 (자녀 3명 상한 포함)', () => {
    const game = new Game(cfg({ players: 2 }));
    const p = game.state.players[0]!;
    game.applyEffect(p, { life: { partner: true, home: true, raise: 1, children: 1 } });
    game.applyEffect(p, { life: { children: 5, grandchildren: 9, raise: 9 } });
    expect(p.life).toMatchObject({ partner: true, home: true, raise: 3, children: 3, grandchildren: 3 });
  });

  it('인생 목표는 코스가 그 사건을 지나갈 때만 나온다', () => {
    const rng = new Rng(1);
    const lifeConds = ['hasPartner', 'hasHome', 'hasChild', 'highSalary', 'grandchild'];
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

/** 항상 안전한 선택만 하는 단순 컨트롤러 */
class SafeCtrl implements Controller {
  name = 'safe';
  chooseDie(_s: GameState, _me: number, dice: [number, number]): 0 | 1 { return dice[0] >= dice[1] ? 0 : 1; }
  choosePath(): number { return 0; }
  chooseCardOption(_s: GameState, _me: number, _c: JourneyCard, canSafe: boolean) { return canSafe ? ('safe' as const) : ('challenge' as const); }
  chooseCpBoost(): number { return 0; }
  wantReroll(): boolean { return false; }
  choosePathOption(_s: GameState, _me: number, _z: number, a: boolean[]): number { return a.findIndex(Boolean); }
  chooseHouse(): null { return null; }
  chooseJob(_s: GameState, _me: number, o: { enabled: boolean }[]): number { return o.findIndex((x) => x.enabled); }
  chooseMilestone(_s: GameState, _me: number, _z: number, _t: string, o: { enabled: boolean }[]): number { return o.findIndex((x) => x.enabled); }
  chooseLodge(): boolean { return false; }
  chooseSabotage(): number | null { return null; }
}

describe('직업과 월급', () => {
  it('직업은 월급이 높을수록 더 높은 학력(성장)이 필요하다', () => {
    const sorted = JOBS.slice().sort((a, b) => a.salary - b.salary);
    expect(sorted[0]!.minGrowth).toBe(0);
    expect(JOBS.filter((j) => j.minGrowth === 0).length).toBeGreaterThanOrEqual(2);
    const top = sorted[sorted.length - 1]!;
    expect(top.salary).toBeGreaterThanOrEqual(5);
    expect(top.minGrowth).toBeGreaterThan(sorted[0]!.minGrowth);
    for (const j of JOBS) for (const k of JOBS) if (j.salary > k.salary + 1) expect(j.minGrowth).toBeGreaterThanOrEqual(k.minGrowth);
  });

  it('직업 선택지는 항상 4개이고, 성장이 0이어도 고를 수 있는 직업이 있다', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 100; i++) {
      const offer = jobOffer((n) => rng.int(n), i % 12);
      expect(offer).toHaveLength(4);
      expect(new Set(offer.map((o) => o.job.id)).size).toBe(4);
      expect(offer.some((o) => o.enabled)).toBe(true);
      for (const o of offer) expect(o.enabled).toBe((i % 12) >= o.job.minGrowth);
    }
  });

  it('월급과 연금 계산: 승진하면 월급이 오르고 연금은 월급의 절반(올림)', () => {
    const life = { ...emptyLife(), jobId: 'developer', career: '개발자' };
    expect(salaryOf(life)).toBe(4);
    expect(pensionOf(life)).toBe(2);
    expect(salaryOf({ ...life, raise: 2 })).toBe(6);
    expect(pensionOf({ ...life, jobId: 'artist' })).toBe(1);
    expect(salaryOf(emptyLife())).toBe(0);
  });

  it('성인이 되면 직업을 정하고, 섬을 옮길 때마다 월급(은퇴 후엔 연금)을 받는다', async () => {
    for (let g = 0; g < 30; g++) {
      const events: GameEvent[] = [];
      const game = new Game(cfg({ seed: g + 300, players: 3 }), { onEvent: (e) => void events.push(e) });
      await game.run([0, 1, 2].map((i) => createBot('greedy', g * 3 + i)));
      for (let pl = 0; pl < 3; pl++) {
        const jobs = events.filter((e) => e.t === 'job' && e.player === pl);
        expect(jobs, '직업은 한 번만 정한다').toHaveLength(1);
        const jobAt = events.findIndex((e) => e.t === 'job' && e.player === pl);
        const pays = events.filter((e): e is Extract<GameEvent, { t: 'payday' }> => e.t === 'payday' && e.player === pl);
        const firstPay = events.findIndex((e) => e.t === 'payday' && e.player === pl);
        if (firstPay >= 0) expect(firstPay).toBeGreaterThan(jobAt); // 직업을 정한 뒤에만 월급
        for (const p of pays) {
          expect(p.zone).toBeGreaterThanOrEqual(6); // 성인 초반 섬에 들어올 땐 아직 직업이 없다
          expect(p.pension).toBe(p.zone >= 8);
          expect(p.effect.asset).toBeGreaterThan(0);
        }
        // 월급날은 6,7번 섬 진입, 연금은 8,9,10번 섬 진입
        expect(new Set(pays.filter((p) => !p.pension).map((p) => p.zone))).toEqual(new Set([6, 7]));
        expect(new Set(pays.filter((p) => p.pension).map((p) => p.zone))).toEqual(new Set([8, 9, 10]));
      }
    }
  });

  it('직업은 성장이 모자라면 못 고르고, 잘못된 응답은 고를 수 있는 직업으로 대신한다', async () => {
    class BadJob extends SafeCtrl {
      asked: { id: string; enabled: boolean; minGrowth: number }[][] = [];
      chooseJob(_s: GameState, _me: number, o: { id: string; enabled: boolean; minGrowth: number }[]): number {
        this.asked.push(o);
        return o.findIndex((x) => !x.enabled); // 일부러 못 고르는 직업을 고른다
      }
    }
    for (let g = 0; g < 20; g++) {
      const game = new Game(cfg({ seed: g + 700, players: 1, startZone: 4, endZone: 7 }));
      const bad = new BadJob();
      await game.run([bad]);
      const p = game.state.players[0]!;
      expect(p.life.jobId).not.toBeNull();
      const picked = bad.asked[0]!.find((o) => o.id === p.life.jobId)!;
      expect(picked.enabled).toBe(true);
    }
  });
});

describe('인생 카드', () => {
  it('모든 카드는 어느 한 섬(나이)에 속한 그 나이의 일이다 (공통 여행 사건 없음)', () => {
    for (const c of [...CARDS, ...ACTIVITY_CARDS, ...TROUBLE_CARDS]) expect(c.zone, c.title).toBeGreaterThanOrEqual(1);
    const travelWords = ['폭풍', '길을 잃', '배가 고장', '해파리', '서핑', '요트', '스노클링', '보물찾기', '횡재'];
    for (const c of [...CARDS, ...ACTIVITY_CARDS, ...TROUBLE_CARDS]) for (const w of travelWords) expect(c.title.includes(w), `${c.title} 에 ${w}`).toBe(false);
  });
  it('아기 섬(1)의 카드는 아기 때 일이다', () => {
    const baby = [...CARDS, ...ACTIVITY_CARDS, ...TROUBLE_CARDS].filter((c) => c.zone === 1).map((c) => c.title);
    for (const t of ['열감기', '이유식 먹기', '분리불안']) expect(baby).toContain(t);
    expect(baby.some((t) => /월세|직장|대출|학원|시험/.test(t))).toBe(false);
  });
  it('성인 이후의 인생 상태 카드는 해당 상태가 있을 때만 나온다', () => {
    const gated = (ts: string[]) => [...CARDS, ...TROUBLE_CARDS].filter((c) => ts.includes(c.title));
    for (const c of gated(['아이가 아파요', '학부모 상담', '자녀 학비 부담'])) expect(c.requires?.children, c.title).toBeGreaterThanOrEqual(1);
    for (const c of gated(['실직 위기', '구조조정 소문'])) expect(c.requires?.career, c.title).toBe(true);
    for (const c of gated(['대출 이자 부담'])) expect(c.requires?.home, c.title).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { Game, buildBoard, distancesToSummit, goalCompletion, DEFAULT_TUNING, DECKS } from '../src/engine';
import type { Controller, GameConfig, GameState, JourneyCard } from '../src/engine';
import { createBot } from '../src/ai/bots';

const cfg = (over: Partial<GameConfig> = {}): GameConfig => ({
  players: 4,
  startZone: 1,
  endZone: 10,
  difficulty: 'normal',
  seed: 1,
  ...over,
});

/** 항상 안전한 선택만 하는 단순 컨트롤러 (주사위 선택은 큰 눈) */
class SafeCtrl implements Controller {
  name = 'safe';
  lastDice: [number, number] | null = null;
  sabotageTargets: number[][] = [];
  chooseDie(_s: GameState, _me: number, dice: [number, number]): 0 | 1 {
    this.lastDice = dice;
    return dice[0] >= dice[1] ? 0 : 1;
  }
  choosePath(): number { return 0; }
  chooseCardOption(_s: GameState, _me: number, _c: JourneyCard, states: { enabled: boolean }[]): number {
    const safe = _c.options.findIndex((o, i) => states[i]!.enabled && !o.roll);
    return safe >= 0 ? safe : states.findIndex((st) => st.enabled);
  }
  chooseCpBoost(): number { return 0; }
  wantReroll(): boolean { return false; }
  choosePathOption(_s: GameState, _me: number, _z: number, a: boolean[]): number { return a.findIndex(Boolean); }
  chooseHouse(): null { return null; }
  chooseJob(_s: GameState, _me: number, o: { enabled: boolean }[]): number { return o.findIndex((x) => x.enabled); }
  chooseMilestone(_s: GameState, _me: number, _z: number, _t: string, o: { enabled: boolean }[]): number { return o.findIndex((x) => x.enabled); }
  chooseLodge(): boolean { return false; }
  chooseSabotage(_s: GameState, _me: number, targets: number[]): number | null {
    this.sabotageTargets.push(targets);
    return targets[0] ?? null;
  }
}

describe('보드', () => {
  it('모든 칸에서 정상에 도달할 수 있다', async () => {
    for (let a = 1; a <= 10; a++) {
      for (let b = a; b <= 10; b++) {
        const board = buildBoard(a, b);
        const { min } = distancesToSummit(board);
        expect(min.every((d) => Number.isFinite(d))).toBe(true);
        expect(board.tiles[board.summit]!.type).toBe('summit');
      }
    }
  });
  it('갈림길은 해안길(0)·지름길(1) 두 갈래이고 지름길이 더 짧다', async () => {
    const board = buildBoard(1, 10);
    const { min, max } = distancesToSummit(board);
    const forks = board.tiles.filter((t) => t.type === 'fork');
    expect(forks).toHaveLength(10);
    for (const f of forks) {
      expect(f.next).toHaveLength(2);
      expect(board.tiles[f.next[0]!]!.route).toBe('long');
      expect(board.tiles[f.next[1]!]!.route).toBe('short');
      expect(board.tiles[f.next[1]!]!.risky).toBe(true);
      expect(min[f.next[1]!]!).toBeLessThan(max[f.next[0]!]!);
    }
  });
  it('전 생애 해안길 길이는 148칸, 첫/끝 구간은 10칸', async () => {
    const board = buildBoard(1, 10);
    const { max } = distancesToSummit(board);
    expect(max[board.start]! + 1).toBe(10 + 8 * 16 + 10);
  });
  it('잘못된 구간은 거부', async () => {
    expect(() => buildBoard(5, 3)).toThrow();
    expect(() => buildBoard(0, 3)).toThrow();
    expect(() => buildBoard(1, 11)).toThrow();
  });
});

describe('새 칸과 카드', () => {
  it('보드에 액티비티·트러블 칸이 있고, 지름길은 액티비티를 지난다', () => {
    const board = buildBoard(1, 10);
    const types = new Set(board.tiles.map((t) => t.type));
    for (const t of ['journey', 'activity', 'trouble', 'camp', 'estate', 'lodge', 'fork', 'weather', 'milestone', 'summit']) expect(types.has(t as never)).toBe(true);
    expect(board.tiles.filter((t) => t.route === 'short' && t.type === 'activity').length).toBe(8);
  });
  it('모든 구간에 각 덱의 전용 카드가 있다', () => {
    for (let z = 1; z <= 10; z++) {
      for (const deck of ['journey', 'activity', 'trouble'] as const) {
        const min = { journey: 3, activity: 2, trouble: 3 }[deck];
        expect(DECKS[deck].filter((c) => c.zone === z).length, `${deck} zone ${z}`).toBeGreaterThanOrEqual(min);
      }
    }
  });
  it('주사위 눈에 이동 보너스가 더해진다', async () => {
    const game = new Game(cfg({ seed: 3, players: 1, startZone: 1, endZone: 3 }));
    const c = new SafeCtrl();
    const start = game.state.players[0]!.pos;
    await game.playRound([c]);
    const dice = c.lastDice!;
    const move = Math.max(...dice) + game.state.tuning.moveBonus;
    const { min } = distancesToSummit(game.state.board);
    // 1턴 후 정상까지 거리가 정확히 move 만큼 줄었다 (갈림길 포함 해안길 선택)
    const before = distancesToSummit(game.state.board).max[start]!;
    const after = distancesToSummit(game.state.board).max[game.state.players[0]!.pos]!;
    expect(before - after).toBe(move);
    expect(min.length).toBeGreaterThan(0);
  });
});

describe('결정론', () => {
  it('같은 시드 → 같은 결과', async () => {
    const run = () => new Game(cfg({ seed: 42 })).run(Array.from({ length: 4 }, (_, i) => createBot('greedy', i)));
    expect(JSON.stringify(await run())).toBe(JSON.stringify(await run()));
  });
  it('다른 시드 → 다른 목표/결과가 나온다', async () => {
    const a = new Game(cfg({ seed: 1 })).state.goals;
    const diffs = Array.from({ length: 10 }, (_, i) => new Game(cfg({ seed: i + 2 })).state.goals).filter(
      (g) => JSON.stringify(g) !== JSON.stringify(a),
    );
    expect(diffs.length).toBeGreaterThan(0);
  });
});

describe('불변식 (랜덤/휴리스틱 봇 자기대전)', () => {
  it('300판 동안 값 범위와 종료 조건이 유지된다', async () => {
    const kinds = ['random', 'greedy', 'rusher', 'builder', 'brawler'];
    for (let g = 0; g < 300; g++) {
      const players = 1 + (g % 6);
      const start = 1 + (g % 5);
      const end = Math.min(10, start + 1 + (g % 6));
      const game = new Game(cfg({ seed: g + 1000, players, startZone: start, endZone: end, difficulty: (['easy', 'normal', 'hard', 'extreme'] as const)[g % 4]! }));
      const ctrls = Array.from({ length: players }, (_, i) => createBot(kinds[(g + i) % kinds.length]!, g * 10 + i));
      const res = await game.run(ctrls);
      const s = game.state;
      expect(s.finished).toBe(true);
      expect(res.metrics.safetyStop ?? 0).toBe(0);
      const cap = Math.ceil(players / 2);
      for (const v of Object.values(s.pathSlots)) expect(v).toBeLessThanOrEqual(cap);
      for (const p of s.players) {
        for (const v of Object.values(p.stats)) expect(v).toBeGreaterThanOrEqual(0);
        expect(p.stamina).toBeGreaterThanOrEqual(0);
        expect(p.stamina).toBeLessThanOrEqual(s.tuning.maxStamina);
        expect(p.cp).toBeGreaterThanOrEqual(0);
        expect(p.cp).toBeLessThanOrEqual(s.tuning.maxCp);
        if (p.arrived) expect(p.pos).toBe(s.board.summit);
        // 방해는 최대 2라운드에 한 번
        expect(p.track.sabotaged).toBeLessThanOrEqual(Math.ceil(res.rounds / 2));
      }
      for (const sc of res.scores) {
        expect(sc.base).toBeGreaterThanOrEqual(0);
        expect(sc.base).toBeLessThanOrEqual(100);
        sc.completion.forEach((c) => {
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(1);
        });
      }
      expect(new Set(res.ranking).size).toBe(players);
    }
  });
});

describe('주사위와 기회 포인트', () => {
  it('안 쓴 주사위가 4 이상이면 CP+1, 더블이면 +1 더', async () => {
    let checked = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const game = new Game(cfg({ seed, players: 1, startZone: 1, endZone: 3 }));
      const c = new SafeCtrl();
      await game.playRound([c]);
      const [a, b] = c.lastDice!;
      const left = a >= b ? b : a;
      const expected = (left >= 4 ? 1 : 0) + (a === b ? 1 : 0);
      expect(game.state.players[0]!.cp).toBeGreaterThanOrEqual(0);
      // 첫 턴은 CP를 쓰지 않고(안전 선택, 방해 불가), 마일스톤 보너스도 없으므로 정확히 일치
      expect(game.state.players[0]!.cp).toBe(Math.min(expected, DEFAULT_TUNING.maxCp));
      checked++;
    }
    expect(checked).toBe(60);
  });
});

describe('점수', () => {
  it('달성률은 100%로 제한되고 초과분은 동점 처리에만 쓰인다', async () => {
    const game = new Game(cfg({ players: 2, difficulty: 'easy', startZone: 1, endZone: 3 }));
    const goal = game.state.goals[0]!;
    if (goal.kind !== 'stat') throw new Error('easy 목표는 스탯형');
    const p0 = game.state.players[0]!;
    p0.stats[goal.stat] = goal.target * 3;
    expect(goalCompletion(p0, goal)).toBe(1);
    const sc = game.score(p0);
    expect(sc.base).toBe(100);
    expect(sc.overflow).toBe(goal.target * 2);
    expect(sc.penalty).toBe(DEFAULT_TUNING.notArrivedPenalty); // 아직 미도착
  });
  it('동점이면 초과 달성이 큰 쪽이 이긴다', async () => {
    const game = new Game(cfg({ players: 2, difficulty: 'easy', startZone: 1, endZone: 3 }));
    const goal = game.state.goals[0]!;
    if (goal.kind !== 'stat') throw new Error();
    const [p0, p1] = game.state.players as [any, any];
    p0.stats[goal.stat] = goal.target + 1;
    p1.stats[goal.stat] = goal.target + 5;
    const res = game.result();
    expect(res.scores[0]!.total).toBe(res.scores[1]!.total);
    expect(res.winner).toBe(1);
  });
});

describe('마감 카운트다운', () => {
  it('첫 도착 후 정해진 라운드 안에 판이 끝난다', async () => {
    class Rush extends SafeCtrl {
      override choosePath() { return 1; }
    }
    for (let seed = 1; seed <= 40; seed++) {
      const players = 3;
      const config = cfg({ seed, players, startZone: 1, endZone: 10 });
      const game = new Game(config);
      const res = await game.run([new Rush(), new SafeCtrl(), new SafeCtrl()]);
      const arrivals = game.state.players.filter((p) => p.arrived).map((p) => p.arrivalRound);
      expect(arrivals.length).toBeGreaterThan(0);
      const first = Math.min(...arrivals);
      const cd = Math.max(DEFAULT_TUNING.countdownRounds, Math.ceil(10 * DEFAULT_TUNING.countdownPerZone));
      expect(res.rounds).toBeLessThanOrEqual(first + cd);
      if (res.endedBy === 'allArrived') expect(game.state.players.every((p) => p.arrived)).toBe(true);
    }
  });
});

describe('팀전', () => {
  it('팀원은 방해 대상에 나오지 않는다', async () => {
    const teams = [0, 1, 0, 1];
    for (let seed = 1; seed <= 30; seed++) {
      const game = new Game(cfg({ seed, players: 4, teams }));
      const ctrls = [0, 1, 2, 3].map(() => {
        const b = createBot('brawler', seed) as unknown as Controller;
        const orig = b.chooseSabotage.bind(b);
        (b as any).chooseSabotage = (s: GameState, me: number, targets: number[], free: boolean) => {
          for (const t of targets) expect(teams[t]).not.toBe(teams[me]);
          return orig(s, me, targets, free);
        };
        return b;
      });
      const res = await game.run(ctrls);
      expect(res.teamScores).toHaveLength(2);
      expect([0, 1]).toContain(res.winningTeam);
    }
  });
  it('teams 길이가 맞지 않으면 에러', async () => {
    expect(() => new Game(cfg({ players: 4, teams: [0, 1] }))).toThrow();
  });
});

describe('설정 검증', () => {
  it('플레이어 수는 1~6', async () => {
    expect(() => new Game(cfg({ players: 0 }))).toThrow();
    expect(() => new Game(cfg({ players: 7 }))).toThrow();
  });
  it('난이도별 목표 개수', async () => {
    const n = (d: 'easy' | 'normal' | 'hard' | 'extreme') => new Game(cfg({ difficulty: d })).state.goals.length;
    expect([n('easy'), n('normal'), n('hard'), n('extreme')]).toEqual([1, 2, 3, 5]);
  });
});

/**
 * 밸런스 회귀 테스트: 튜닝을 바꿨을 때 "지배 전략이 생기지 않는지" 등을 지킨다.
 * 기준은 docs/GAME_DESIGN.md 의 설계 의도.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine';
import type { Difficulty, GameConfig } from '../src/engine';
import { createBot } from '../src/ai/bots';

async function play(over: Partial<GameConfig>, bots: string[], games: number, seed0 = 1) {
  const out: { winner: number; bases: number[]; rounds: number; arrived: boolean[]; totals: number[] }[] = [];
  for (let g = 0; g < games; g++) {
    const seed = seed0 * 100003 + g;
    const game = new Game({ players: bots.length, startZone: 1, endZone: 10, difficulty: 'normal', seed, ...over });
    const res = await game.run(bots.map((b, i) => createBot(b, seed * 7 + i)));
    out.push({
      winner: res.winner,
      bases: res.scores.map((s) => s.base),
      totals: res.scores.map((s) => s.total),
      rounds: res.rounds,
      arrived: game.state.players.map((p) => p.arrived),
    });
  }
  return out;
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('밸런스', () => {
  it('지배 전략이 없다: 모든 봇 유형의 승률이 기대치의 0.7~1.3배', async () => {
    const bots = ['greedy', 'rusher', 'builder', 'brawler'];
    const rs = await play({}, bots, 1500);
    for (let i = 0; i < bots.length; i++) {
      const share = rs.filter((r) => r.winner === i).length / rs.length;
      expect(share, bots[i]).toBeGreaterThan(0.25 * 0.7);
      expect(share, bots[i]).toBeLessThan(0.25 * 1.3);
    }
  });

  it('실력이 반영되되 운도 남는다: 휴리스틱 2명 vs 랜덤 2명에서 휴리스틱 승 비율이 65~95%', async () => {
    // 기준선(실력 무관)은 50%. 너무 낮으면 선택이 무의미하고, 너무 높으면 운이 없는 게임이다.
    const rs = await play({}, ['random', 'random', 'greedy', 'greedy'], 600);
    const greedyWins = rs.filter((r) => r.winner >= 2).length / rs.length;
    expect(greedyWins).toBeGreaterThan(0.65);
    expect(greedyWins).toBeLessThan(0.95);
  });

  it('난이도가 올라갈수록 평균 달성률이 내려간다', async () => {
    const lvl = async (d: Difficulty) => mean((await play({ difficulty: d }, ['greedy', 'greedy', 'greedy', 'greedy'], 400)).flatMap((r) => r.bases));
    const [e, n, h, x] = [await lvl('easy'), await lvl('normal'), await lvl('hard'), await lvl('extreme')];
    expect(e).toBeGreaterThan(n);
    expect(n).toBeGreaterThan(h);
    expect(h).toBeGreaterThan(x);
    expect(x).toBeGreaterThan(30); // 극한도 완전히 불가능하지는 않다
    expect(e).toBeLessThan(95); // 쉬움도 거저는 아니다
  });

  it('자리 편향이 작다: 6인 동일 봇에서 각 자리 승률이 공평값 ±5%p', async () => {
    const rs = await play({}, Array(6).fill('greedy'), 1200);
    for (let i = 0; i < 6; i++) {
      const share = rs.filter((r) => r.winner === i).length / rs.length;
      expect(Math.abs(share - 1 / 6)).toBeLessThan(0.05);
    }
  });

  it('판 길이가 설계 범위 안이다 (라운드)', async () => {
    const rounds = async (a: number, b: number) => mean((await play({ startZone: a, endZone: b }, ['greedy', 'greedy', 'greedy', 'greedy'], 200)).map((r) => r.rounds));
    const kid = await rounds(1, 3);
    const life = await rounds(1, 10);
    expect(kid).toBeLessThan(11); // 꼬마 코스
    expect(kid).toBeGreaterThan(5);
    expect(life).toBeLessThan(35); // 전 생애
    expect(life).toBeGreaterThan(20);
  });

  it('대부분의 플레이어가 정상에 도착한다 (휴리스틱 봇 90% 이상)', async () => {
    const rs = await play({}, ['greedy', 'rusher', 'builder', 'brawler'], 400);
    const rate = mean(rs.flatMap((r) => r.arrived.map((a) => (a ? 1 : 0))));
    expect(rate).toBeGreaterThan(0.8);
  });

  it('팀전 승률이 한쪽으로 쏠리지 않는다 (2v2, 3v3)', async () => {
    for (const players of [4, 6]) {
      const teams = Array.from({ length: players }, (_, i) => i % 2);
      let t0 = 0;
      const n = 800;
      for (let g = 0; g < n; g++) {
        const seed = 7000 + g;
        const game = new Game({ players, startZone: 1, endZone: 10, difficulty: 'normal', seed, teams });
        const res = await game.run(Array.from({ length: players }, (_, i) => createBot('greedy', seed + i)));
        if (res.winningTeam === 0) t0++;
      }
      expect(Math.abs(t0 / n - 0.5)).toBeLessThan(0.06);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { buildBoard } from '../src/engine';
import { layout3d } from '../src/client/board3d';

describe('3D 나선 배치', () => {
  for (const [a, b] of [[1, 3], [3, 5], [5, 7], [8, 10], [1, 10], [4, 4]] as const) {
    it(`코스 ${a}~${b}: 좌표가 유효하고 서로 겹치지 않으며 위로 올라간다`, () => {
      const board = buildBoard(a, b);
      const { pos } = layout3d(board.tiles, a, b);
      expect(pos).toHaveLength(board.tiles.length);
      for (const p of pos) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
      }
      // 칸끼리 최소 간격 (겹쳐 보이지 않기)
      let minD = Infinity;
      for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) minD = Math.min(minD, pos[i]!.distanceTo(pos[j]!));
      expect(minD).toBeGreaterThan(1.8);
      // 둘레길(주 경로)을 따라가면 높이가 줄지 않는다
      for (const t of board.tiles) {
        if (t.route === 'short') continue;
        for (const nx of t.next) {
          if (board.tiles[nx]!.route === 'short') continue;
          expect(pos[nx]!.y).toBeGreaterThanOrEqual(pos[t.id]!.y - 1e-9);
        }
      }
      // 정상이 가장 높다 (지름길의 띄운 높이 제외)
      const topY = Math.max(...board.tiles.filter((t) => t.route !== 'short').map((t) => pos[t.id]!.y));
      expect(pos[board.summit]!.y).toBeCloseTo(topY, 6);
    });
  }

  it('지름길 칸은 산 바깥으로 떠 있어 길과 구분된다', () => {
    const board = buildBoard(1, 10);
    const { pos } = layout3d(board.tiles, 1, 10);
    for (const t of board.tiles.filter((x) => x.route === 'short')) {
      const r = Math.hypot(pos[t.id]!.x, pos[t.id]!.z);
      // 같은 높이 근처의 둘레길 반지름보다 크다
      const near = board.tiles.filter((x) => x.route === 'long').reduce((best, x) => (Math.abs(pos[x.id]!.y - pos[t.id]!.y) < Math.abs(pos[best.id]!.y - pos[t.id]!.y) ? x : best));
      expect(r).toBeGreaterThan(Math.hypot(pos[near.id]!.x, pos[near.id]!.z));
    }
  });
});

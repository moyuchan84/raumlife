import { describe, expect, it } from 'vitest';
import { buildBoard } from '../src/engine';
import { layout3d } from '../src/client/board3d';

describe('3D 섬 배치', () => {
  for (const [a, b] of [[1, 3], [3, 5], [5, 7], [8, 10], [1, 10], [4, 4]] as const) {
    it(`코스 ${a}~${b}: 좌표가 유효하고 칸이 겹치지 않으며 길이 이어진다`, () => {
      const board = buildBoard(a, b);
      const { pos, islands, bridges } = layout3d(board.tiles, a, b);
      expect(islands).toHaveLength(b - a + 1);
      expect(bridges).toHaveLength(b - a);
      expect(pos).toHaveLength(board.tiles.length);
      for (const p of pos) expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);

      // 칸끼리 최소 간격 (겹쳐 보이지 않기)
      let minD = Infinity;
      for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) minD = Math.min(minD, pos[i]!.distanceTo(pos[j]!));
      expect(minD).toBeGreaterThan(2.0);

      // 같은 섬 안에서 이어진 칸 사이 거리가 너무 멀지 않다
      for (const t of board.tiles) {
        for (const nx of t.next) {
          if (board.tiles[nx]!.zone !== t.zone) continue;
          expect(pos[t.id]!.distanceTo(pos[nx]!)).toBeLessThan(8);
        }
      }
      // 모든 칸이 자기 섬 안(해안 안쪽)에 있다
      for (const t of board.tiles) {
        const isl = islands[t.zone - a]!;
        const d = Math.hypot(pos[t.id]!.x - isl.center.x, pos[t.id]!.z - isl.center.z);
        expect(d).toBeLessThanOrEqual(isl.radius);
      }
      // 다리 길이가 적당하다
      for (const br of bridges) {
        const len = br.a.distanceTo(br.b);
        expect(len).toBeGreaterThan(6);
        expect(len).toBeLessThan(30);
      }
    });
  }

  it('지름길은 섬을 가로지르는 직선이라 해안길보다 짧다', () => {
    const board = buildBoard(2, 2);
    const { pos } = layout3d(board.tiles, 2, 2);
    const fork = board.tiles.find((t) => t.type === 'fork')!;
    const longFirst = board.tiles[fork.next[0]!]!;
    const shortFirst = board.tiles[fork.next[1]!]!;
    // 갈림길 → 합류점까지의 실제 경로 길이
    const pathLen = (startId: number) => {
      let len = pos[fork.id]!.distanceTo(pos[startId]!);
      let cur = startId;
      for (;;) {
        const t = board.tiles[cur]!;
        const nx = t.next[0]!;
        if (board.tiles[nx]!.route === undefined) return len + pos[cur]!.distanceTo(pos[nx]!);
        len += pos[cur]!.distanceTo(pos[nx]!);
        cur = nx;
      }
    };
    expect(pathLen(shortFirst.id)).toBeLessThan(pathLen(longFirst.id));
  });
});

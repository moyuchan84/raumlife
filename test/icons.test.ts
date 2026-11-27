import { describe, expect, it } from 'vitest';
import type { TileType } from '../src/engine';
import { TILE_ICON, tileIcon } from '../src/client/board';

describe('칸 기호', () => {
  const types = Object.keys(TILE_ICON) as TileType[];
  it('아기 섬(1)은 단순한 기호를 쓰고 다른 섬은 기본 기호를 쓴다', () => {
    expect(tileIcon('trouble', 1)).toBe('😢');
    expect(tileIcon('activity', 1)).toBe('😄');
    for (const t of types) expect(tileIcon(t, 2)).toBe(TILE_ICON[t]);
    expect(tileIcon('trouble', 1)).not.toBe(tileIcon('trouble', 2));
  });
  it('좋은 칸/나쁜 칸이 아기 섬에서 한눈에 구분된다', () => {
    const baby = new Set(types.map((t) => tileIcon(t, 1)));
    expect(baby.has('😢') && baby.has('😄') && baby.has('⭐')).toBe(true);
  });
});

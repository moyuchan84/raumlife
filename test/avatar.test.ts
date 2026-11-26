import { describe, expect, it } from 'vitest';
import { AVATAR_RANGES, DEFAULT_AVATAR, randomAvatar, sameAvatar, sanitizeAvatar, type Avatar } from '../src/shared/avatar';
import { Rng } from '../src/engine';

describe('아바타', () => {
  it('잘못된 입력은 기본값으로 고친다', () => {
    expect(sanitizeAvatar(null)).toEqual(DEFAULT_AVATAR);
    expect(sanitizeAvatar('x')).toEqual(DEFAULT_AVATAR);
    expect(sanitizeAvatar({ skin: -1, hairStyle: 1000, face: 1.5, top: '2', accessory: NaN })).toEqual(DEFAULT_AVATAR);
  });
  it('유효한 값은 그대로 유지한다', () => {
    const a: Avatar = { skin: 3, hairStyle: 5, hairColor: 7, top: 4, topColor: 2, bottomColor: 5, accessory: 5, face: 3 };
    expect(sanitizeAvatar(a)).toEqual(a);
  });
  it('랜덤 아바타는 항상 유효한 범위이고 서로 다양하다', () => {
    const rng = new Rng(7);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const a = randomAvatar(() => rng.next());
      expect(sanitizeAvatar(a)).toEqual(a);
      for (const k of Object.keys(AVATAR_RANGES) as (keyof Avatar)[]) {
        expect(a[k]).toBeGreaterThanOrEqual(0);
        expect(a[k]).toBeLessThan(AVATAR_RANGES[k]);
      }
      seen.add(JSON.stringify(a));
    }
    expect(seen.size).toBeGreaterThan(250);
    expect(sameAvatar(DEFAULT_AVATAR, { ...DEFAULT_AVATAR })).toBe(true);
    expect(sameAvatar(DEFAULT_AVATAR, { ...DEFAULT_AVATAR, face: 2 })).toBe(false);
  });
});

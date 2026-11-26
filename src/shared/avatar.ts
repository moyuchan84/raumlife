/** 플레이어가 직접 꾸미는 사람 캐릭터. 모든 값은 아래 목록의 인덱스다. */
export interface Avatar {
  skin: number;
  hairStyle: number;
  hairColor: number;
  top: number;
  topColor: number;
  bottomColor: number;
  accessory: number;
  face: number;
}

export const SKIN_TONES = ['#ffe3cf', '#f8cfa9', '#e9b48b', '#cf9468', '#a56e45', '#7b4c2e'] as const;
export const HAIR_COLORS = ['#2b1d14', '#5b3a24', '#8b5a2b', '#d9a441', '#c94f4f', '#e27aa9', '#4a78c9', '#9aa0aa'] as const;
export const HAIR_STYLES = ['짧은 머리', '단발', '포니테일', '양갈래', '뾰족 머리', '곱슬 머리'] as const;
export const TOPS = ['티셔츠', '후드', '원피스', '멜빵바지', '재킷'] as const;
export const OUTFIT_COLORS = ['#e85d5d', '#f2994a', '#f2c94c', '#6fcf97', '#56ccf2', '#2f80ed', '#9b51e0', '#f2a1c6'] as const;
export const BOTTOM_COLORS = ['#3b4a6b', '#2d2d33', '#7b5e3b', '#4f7f5a', '#8a8f99', '#a14d4d'] as const;
export const ACCESSORIES = ['없음', '안경', '밀짚모자', '머리띠', '배낭', '선글라스'] as const;
export const FACES = ['방긋 웃음', '윙크', '쿨한 표정', '깜짝 놀람'] as const;

/** 좌석(플레이어 번호)별 표시 색 */
export const SEAT_COLORS = ['#ef5350', '#42a5f5', '#66bb6a', '#ffa726', '#ab47bc', '#26c6da'] as const;

export const AVATAR_RANGES: Record<keyof Avatar, number> = {
  skin: SKIN_TONES.length,
  hairStyle: HAIR_STYLES.length,
  hairColor: HAIR_COLORS.length,
  top: TOPS.length,
  topColor: OUTFIT_COLORS.length,
  bottomColor: BOTTOM_COLORS.length,
  accessory: ACCESSORIES.length,
  face: FACES.length,
};

export const DEFAULT_AVATAR: Avatar = { skin: 1, hairStyle: 0, hairColor: 1, top: 0, topColor: 5, bottomColor: 0, accessory: 0, face: 0 };

/** 외부(클라이언트)에서 온 값을 안전한 아바타로 고친다. 잘못된 값은 기본값 */
export function sanitizeAvatar(x: unknown): Avatar {
  const out: Avatar = { ...DEFAULT_AVATAR };
  if (typeof x !== 'object' || x === null) return out;
  const o = x as Record<string, unknown>;
  for (const k of Object.keys(AVATAR_RANGES) as (keyof Avatar)[]) {
    const v = o[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < AVATAR_RANGES[k]) out[k] = v;
  }
  return out;
}

/** rand: 0..1 난수 함수 */
export function randomAvatar(rand: () => number): Avatar {
  const pick = (n: number) => Math.floor(rand() * n);
  const a = { ...DEFAULT_AVATAR };
  for (const k of Object.keys(AVATAR_RANGES) as (keyof Avatar)[]) a[k] = pick(AVATAR_RANGES[k]);
  return a;
}

export function sameAvatar(a: Avatar, b: Avatar): boolean {
  return (Object.keys(AVATAR_RANGES) as (keyof Avatar)[]).every((k) => a[k] === b[k]);
}

export const BOT_NAMES = ['하나', '민준', '서연', '도윤', '지우', '예준', '수아', '시우', '아라', '건우'] as const;

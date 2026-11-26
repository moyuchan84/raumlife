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

// ───────── 나이에 따른 모습 ─────────
/** 구간(1~10) 번호가 곧 나이 단계다: 1 아기 … 6 성인 … 10 아주 연로한 노년 */
export interface AgeLook {
  stage: number;
  label: string;
  /** 전체 키/몸 크기 */
  scale: number;
  /** 머리 크기 배율 (어릴수록 머리가 크다) */
  head: number;
  /** 흰머리 정도 0..1 */
  gray: number;
  /** 주름 0(없음) 1(약간) 2(뚜렷) */
  wrinkles: 0 | 1 | 2;
  /** 구부정한 정도 (라디안) */
  hunch: number;
  cane: boolean;
  /** 눈이 얼마나 크게 보이는지 (아기일수록 큼) */
  eye: number;
}

const AGE_TABLE: AgeLook[] = [
  { stage: 1, label: '아기', scale: 0.62, head: 1.2, gray: 0, wrinkles: 0, hunch: 0, cane: false, eye: 1.3 },
  { stage: 2, label: '어린이', scale: 0.76, head: 1.1, gray: 0, wrinkles: 0, hunch: 0, cane: false, eye: 1.18 },
  { stage: 3, label: '중학생', scale: 0.9, head: 1.03, gray: 0, wrinkles: 0, hunch: 0, cane: false, eye: 1.08 },
  { stage: 4, label: '고등학생', scale: 0.98, head: 1.0, gray: 0, wrinkles: 0, hunch: 0, cane: false, eye: 1.04 },
  { stage: 5, label: '청년', scale: 1.0, head: 0.97, gray: 0, wrinkles: 0, hunch: 0, cane: false, eye: 1 },
  { stage: 6, label: '성인', scale: 1.0, head: 0.96, gray: 0.05, wrinkles: 0, hunch: 0, cane: false, eye: 0.96 },
  { stage: 7, label: '중년', scale: 1.0, head: 0.96, gray: 0.4, wrinkles: 1, hunch: 0.03, cane: false, eye: 0.94 },
  { stage: 8, label: '노년 초반', scale: 0.97, head: 0.97, gray: 0.8, wrinkles: 1, hunch: 0.1, cane: false, eye: 0.92 },
  { stage: 9, label: '노년 중반', scale: 0.93, head: 0.98, gray: 1, wrinkles: 2, hunch: 0.18, cane: true, eye: 0.9 },
  { stage: 10, label: '노년 말기', scale: 0.9, head: 0.99, gray: 1, wrinkles: 2, hunch: 0.26, cane: true, eye: 0.88 },
];

export function ageLook(stage: number): AgeLook {
  return AGE_TABLE[Math.max(1, Math.min(10, Math.round(stage))) - 1]!;
}

/** 머리색을 흰머리 쪽으로 섞는다 (t: 0..1) */
export function grayHair(hex: string, t: number): string {
  if (t <= 0) return hex;
  const n = parseInt(hex.slice(1), 16);
  const target = [214, 217, 224];
  const mix = (c: number, i: number) => Math.round(c + (target[i]! - c) * Math.min(1, t));
  const r = mix((n >> 16) & 255, 0);
  const g = mix((n >> 8) & 255, 1);
  const b = mix(n & 255, 2);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** 캐릭터 만들기 화면의 "나이 미리보기" 단계 */
export const AGE_PREVIEW_STAGES = [1, 2, 4, 5, 7, 9] as const;

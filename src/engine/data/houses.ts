import type { Effect, HouseSpec, LifeState } from '../types';

/** 라이프처럼 집은 "원래 있는 집을 사거나", "자유롭게 직접 지을 수" 있다. 돈이 많아지면 별장도 산다. */

export interface ReadyHouse {
  id: string;
  name: string;
  price: number;
  size: 1 | 2 | 3;
  style: number;
  color: number;
  /** 입주 직후 행복 */
  happy: number;
  desc: string;
}

export const READY_HOUSES: ReadyHouse[] = [
  { id: 'studio', name: '원룸', price: 2, size: 1, style: 3, color: 4, happy: 1, desc: '작지만 내 공간' },
  { id: 'row', name: '빌라', price: 3, size: 1, style: 3, color: 1, happy: 2, desc: '아담하고 아늑한 집' },
  { id: 'apt', name: '아파트', price: 4, size: 2, style: 1, color: 4, happy: 3, desc: '편리한 단지 생활' },
  { id: 'detached', name: '단독주택', price: 6, size: 2, style: 5, color: 3, happy: 4, desc: '마당이 있는 집' },
  { id: 'penthouse', name: '펜트하우스', price: 8, size: 3, style: 1, color: 5, happy: 5, desc: '전망 좋은 고층' },
];

// ───── 직접 짓기 ─────
export const BUILD_SIZES = [
  { size: 1 as const, name: '작은 집', price: 3, happy: 2 },
  { size: 2 as const, name: '중간 집', price: 5, happy: 4 },
  { size: 3 as const, name: '큰 집', price: 8, happy: 6 },
];
export const BUILD_EXTRAS = [
  { id: 'garden', name: '정원', price: 1, desc: '🤝 인맥 +1 (이웃과 정원 파티)', effect: { network: 1 } as Effect },
  { id: 'pool', name: '수영장', price: 2, desc: '❤️ 행복 +2', effect: { happy: 2 } as Effect },
  { id: 'attic', name: '다락방 서재', price: 1, desc: '🌱 성장 +1', effect: { growth: 1 } as Effect },
  { id: 'solar', name: '태양광 지붕', price: 1, desc: '이정표마다 💰 +1 (전기요금 절약)', effect: {} as Effect },
] as const;
export const HOUSE_STYLES = ['통나무집', '현대식 주택', '한옥', '벽돌집', '오두막', '지중해풍'] as const;
export const HOUSE_COLORS = ['#e85d5d', '#f2994a', '#f2c94c', '#6fcf97', '#56ccf2', '#2f80ed', '#9b51e0', '#f2a1c6'] as const;

// ───── 별장 ─────
export interface Villa {
  id: string;
  name: string;
  price: number;
  style: number;
  color: number;
  happy: number;
  desc: string;
}
export const VILLAS: Villa[] = [
  { id: 'sea', name: '바닷가 별장', price: 6, style: 5, color: 4, happy: 4, desc: '파도 소리가 들리는 휴식처' },
  { id: 'mountain', name: '숲속 별장', price: 6, style: 0, color: 3, happy: 4, desc: '조용한 숲속 통나무집' },
  { id: 'luxury', name: '호화 별장', price: 9, style: 1, color: 5, happy: 6, desc: '수영장이 딸린 대저택' },
];
/** 별장은 돈이 충분히 많을 때(이 💰 이상)만 살 수 있다 */
export const VILLA_MIN_ASSET = 10;

export type HouseAnswer =
  | { kind: 'ready'; id: string }
  | { kind: 'custom'; size: 1 | 2 | 3; style: number; color: number; extras: string[] }
  | { kind: 'villa'; id: string };

export interface HousePurchase {
  spec: Omit<HouseSpec, 'tileId' | 'zone'>;
  effect: Effect;
}

/** 답을 검증하고 가격과 효과를 계산한다. 잘못된 답이면 null */
export function quote(answer: HouseAnswer): HousePurchase | null {
  if (answer.kind === 'ready') {
    const h = READY_HOUSES.find((x) => x.id === answer.id);
    if (!h) return null;
    return {
      spec: { kind: 'ready', name: h.name, size: h.size, style: h.style, color: h.color, extras: [], price: h.price },
      effect: { asset: -h.price, happy: h.happy, stamina: 1 },
    };
  }
  if (answer.kind === 'villa') {
    const v = VILLAS.find((x) => x.id === answer.id);
    if (!v) return null;
    return {
      spec: { kind: 'villa', name: v.name, size: 3, style: v.style, color: v.color, extras: [], price: v.price },
      effect: { asset: -v.price, happy: v.happy, stamina: 2 },
    };
  }
  const size = BUILD_SIZES.find((s) => s.size === answer.size);
  if (!size) return null;
  if (!Number.isInteger(answer.style) || answer.style < 0 || answer.style >= HOUSE_STYLES.length) return null;
  if (!Number.isInteger(answer.color) || answer.color < 0 || answer.color >= HOUSE_COLORS.length) return null;
  const extras = [...new Set(answer.extras)];
  let price = size.price;
  const effect: Effect = { happy: size.happy, stamina: 1 };
  for (const id of extras) {
    const e = BUILD_EXTRAS.find((x) => x.id === id);
    if (!e) return null;
    price += e.price;
    for (const k of ['asset', 'happy', 'network', 'growth'] as const) if (e.effect[k]) effect[k] = (effect[k] ?? 0) + e.effect[k]!;
  }
  effect.asset = -price;
  return {
    spec: { kind: 'custom', name: `${HOUSE_STYLES[answer.style]} (${size.name})`, size: answer.size, style: answer.style, color: answer.color, extras, price },
    effect,
  };
}

/** 이 집들이 이정표마다 주는 꾸준한 이득 */
export function houseDividend(life: LifeState): Effect {
  const e: Effect = {};
  const add = (k: 'asset' | 'happy', n: number) => {
    e[k] = (e[k] ?? 0) + n;
  };
  if (life.house) {
    add('asset', 1); // 집값 상승
    if (life.house.extras.includes('solar')) add('asset', 1);
  }
  if (life.villa) {
    add('happy', 1);
    e.stamina = 1; // 별장에서 푹 쉰다
  }
  return e;
}

export interface HouseOffer {
  asset: number;
  hasHome: boolean;
  hasVilla: boolean;
  canBuyHome: boolean;
  canBuyVilla: boolean;
  ready: (ReadyHouse & { affordable: boolean })[];
  villas: (Villa & { affordable: boolean })[];
  /** 짓기 비용표 */
  sizes: typeof BUILD_SIZES;
  extras: typeof BUILD_EXTRAS;
}

export function makeOffer(life: LifeState, asset: number, onlyHome = false): HouseOffer {
  const canBuyHome = !life.home;
  const canBuyVilla = !onlyHome && !life.villa && asset >= VILLA_MIN_ASSET;
  return {
    asset,
    hasHome: life.home,
    hasVilla: !!life.villa,
    canBuyHome,
    canBuyVilla,
    ready: READY_HOUSES.map((h) => ({ ...h, affordable: asset >= h.price })),
    villas: VILLAS.map((v) => ({ ...v, affordable: asset >= v.price })),
    sizes: BUILD_SIZES,
    extras: BUILD_EXTRAS,
  };
}

/** 지금 살 수 있는 것이 하나라도 있는지 */
export function hasAnythingToBuy(o: HouseOffer): boolean {
  if (o.canBuyHome && (o.ready.some((h) => h.affordable) || o.asset >= BUILD_SIZES[0]!.price)) return true;
  return o.canBuyVilla && o.villas.some((v) => v.affordable);
}

/** 답이 지금 상태에서 유효한지(소유 제한, 돈) */
export function validAnswer(answer: HouseAnswer, o: HouseOffer): HousePurchase | null {
  const q = quote(answer);
  if (!q) return null;
  if (answer.kind === 'villa') {
    if (!o.canBuyVilla || o.asset < q.spec.price) return null;
  } else if (!o.canBuyHome || o.asset < q.spec.price) {
    return null;
  }
  return q;
}

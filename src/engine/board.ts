import type { Board, Tile, TileType } from './types';
import { ZONES } from './data/zones';

/**
 * 선택한 구간(startZone..endZone)으로 산길 그래프를 만든다.
 * 구간(=섬) 템플릿 (16칸 구간 / 10칸 구간):
 *   앞길 → 갈림길 → [해안길(길다) | 샛길(지름길, 짧다)] → 뒷길 → 이정표
 * 마지막 구간의 이정표는 종착지(summit, 등대)이다.
 */
/** 여행 길이별 칸 수 배율: 보통 1배(약 150칸), 길게 1.5배(약 220칸), 아주 길게 2배(약 300칸) */
export const LENGTH_FACTOR = [1, 1.5, 2] as const;

/** 길이를 늘릴 때 끼워 넣는 칸의 순환 (일상·활동·어려움이 고르게 섞인다) */
const FILLER: TileType[] = ['journey', 'activity', 'journey', 'trouble', 'journey', 'camp', 'journey', 'weather'];

/** base 의 앞뒤 칸은 그대로 두고, 사이사이에 extra 개의 칸을 고르게 끼워 넣는다 */
function extend(base: TileType[], extra: number, fillerStart: number, special?: TileType): TileType[] {
  if (extra <= 0) return base;
  if (base.length === 1) return [base[0]!, ...Array.from({ length: extra }, (_, i) => FILLER[(fillerStart + i) % FILLER.length]!)];
  const out: TileType[] = [];
  const gaps = base.length - 1;
  let given = 0;
  let k = fillerStart;
  for (let i = 0; i < base.length; i++) {
    out.push(base[i]!);
    if (i < gaps) {
      const target = Math.round(((i + 1) * extra) / gaps);
      while (given < target) {
        out.push(special && given === Math.floor(extra / 2) ? special : FILLER[k++ % FILLER.length]!);
        given++;
      }
    }
  }
  return out;
}

export function buildBoard(startZone: number, endZone: number, length: 1 | 2 | 3 = 1): Board {
  if (startZone < 1 || endZone > ZONES.length || startZone > endZone) {
    throw new Error(`잘못된 구간 범위: ${startZone}~${endZone}`);
  }
  const factor = LENGTH_FACTOR[length - 1]!;
  const tiles: Tile[] = [];
  const add = (zone: number, type: TileType, extra: Partial<Tile> = {}): number => {
    const id = tiles.length;
    tiles.push({ id, zone, type, next: [], ...extra });
    return id;
  };
  const link = (a: number, b: number) => {
    tiles[a]!.next.push(b);
  };
  const chain = (zone: number, types: TileType[], extra: Partial<Tile> = {}): number[] =>
    types.map((t) => add(zone, t, extra));

  let prevTail: number | null = null;
  let first = -1;

  for (let z = startZone; z <= endZone; z++) {
    const info = ZONES[z - 1]!;
    const isLastZone = z === endZone;
    const tailType: TileType = isLastZone ? 'summit' : 'milestone';
    // 성인 섬(5~9)에는 부동산 칸이 있어 집을 사거나 짓고, 돈이 많으면 별장도 산다
    const house: TileType = z >= 5 && z <= 9 ? 'estate' : 'lodge';

    const std = info.length === 16;
    const base = std ? 16 : 10;
    const extra = Math.round(base * (factor - 1));
    const eLead = Math.floor(extra * 0.25);
    const eLong = Math.floor(extra * 0.5);
    const eTail = extra - eLead - eLong;
    // 지름길은 해안길보다 훨씬 짧아야 하지만, 섬이 커져도 칸 사이가 너무 벌어지지 않게 길이에 맞춰 늘린다
    const eShort = std ? Math.floor(extra / 6) : Math.round(extra / 2.5);

    // 이정표에서 멈춘 뒤에는 최소 3칸을 이동하므로 섬의 첫 두 칸은 밟을 일이 없다 (진로는 섬에 들어올 때 고른다)
    const leadBase: TileType[] = std ? ['journey', 'journey', 'activity', 'journey'] : ['journey', 'journey', 'activity'];
    const longBase: TileType[] = std ? ['journey', 'camp', 'trouble', house, 'weather', 'activity', z >= 5 && z <= 9 ? 'estate' : 'journey'] : ['journey', 'journey', 'camp'];
    const shortBase: TileType[] = std ? ['journey', 'trouble', 'activity'] : ['journey'];
    const tailBase: TileType[] = std ? ['journey', 'trouble', 'camp', tailType] : ['journey', 'trouble', tailType];

    // 칸 id가 진행 방향으로 증가하도록 순서대로 생성한다 (lead → fork → 해안길 → 지름길 → tail)
    const lead = chain(z, extend(leadBase, eLead, 0));
    const fork = add(z, 'fork');
    // 길게 할수록 부동산 칸도 하나 더 (성인 섬)
    const longTypes = extend(longBase, eLong, 3, z >= 5 && z <= 9 && eLong >= 3 ? 'estate' : undefined);
    const longRoute = chain(z, longTypes, { route: 'long' });
    const shortRoute = chain(z, extend(shortBase, eShort, 1), { route: 'short', risky: true });
    const tail = chain(z, extend(tailBase, eTail, 5));

    if (first < 0) first = lead[0]!;
    if (prevTail !== null) link(prevTail, lead[0]!);
    for (let i = 0; i < lead.length - 1; i++) link(lead[i]!, lead[i + 1]!);
    link(lead[lead.length - 1]!, fork);
    link(fork, longRoute[0]!); // next[0] = 해안길
    link(fork, shortRoute[0]!); // next[1] = 지름길
    for (let i = 0; i < longRoute.length - 1; i++) link(longRoute[i]!, longRoute[i + 1]!);
    for (let i = 0; i < shortRoute.length - 1; i++) link(shortRoute[i]!, shortRoute[i + 1]!);
    link(longRoute[longRoute.length - 1]!, tail[0]!);
    link(shortRoute[shortRoute.length - 1]!, tail[0]!);
    for (let i = 0; i < tail.length - 1; i++) link(tail[i]!, tail[i + 1]!);
    prevTail = tail[tail.length - 1]!;
  }

  return { tiles, start: first, summit: prevTail! };
}

/** 어떤 칸에서 정상까지의 최단/최장 거리 (밸런스 분석용) */
export function distancesToSummit(board: Board): { min: number[]; max: number[] } {
  const n = board.tiles.length;
  const min = new Array<number>(n).fill(Infinity);
  const max = new Array<number>(n).fill(-Infinity);
  for (let i = n - 1; i >= 0; i--) {
    const t = board.tiles[i]!;
    if (t.id === board.summit) {
      min[i] = 0;
      max[i] = 0;
      continue;
    }
    for (const nx of t.next) {
      min[i] = Math.min(min[i]!, 1 + min[nx]!);
      max[i] = Math.max(max[i]!, 1 + max[nx]!);
    }
  }
  return { min, max };
}

import type { Board, Tile, TileType } from './types';
import { ZONES } from './data/zones';

/**
 * 선택한 구간(startZone..endZone)으로 산길 그래프를 만든다.
 * 구간(=섬) 템플릿 (16칸 구간 / 10칸 구간):
 *   앞길 → 갈림길 → [해안길(길다) | 샛길(지름길, 짧다)] → 뒷길 → 이정표
 * 마지막 구간의 이정표는 종착지(summit, 등대)이다.
 */
export function buildBoard(startZone: number, endZone: number): Board {
  if (startZone < 1 || endZone > ZONES.length || startZone > endZone) {
    throw new Error(`잘못된 구간 범위: ${startZone}~${endZone}`);
  }
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

    // 칸 id가 진행 방향으로 증가하도록 순서대로 생성한다 (lead → fork → 해안길 → 지름길 → tail)
    const std = info.length === 16;
    const lead = chain(z, std ? ['journey', 'path', 'journey', 'activity'] : ['journey', 'camp', 'activity']);
    const fork = add(z, 'fork');
    const longRoute = chain(
      z,
      std
        ? ['journey', 'camp', 'trouble', 'lodge', 'weather', 'activity', 'journey']
        : ['journey', 'journey', 'camp'],
      { route: 'long' },
    );
    const shortRoute = chain(z, std ? ['journey', 'activity', 'journey'] : ['journey'], { route: 'short', risky: true });
    const tail = chain(z, std ? ['journey', 'trouble', 'camp', tailType] : ['journey', 'trouble', tailType]);

    if (first < 0) first = lead[0]!;
    if (prevTail !== null) link(prevTail, lead[0]!);
    for (let i = 0; i < lead.length - 1; i++) link(lead[i]!, lead[i + 1]!);
    link(lead[lead.length - 1]!, fork);
    link(fork, longRoute[0]!); // next[0] = 둘레길
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

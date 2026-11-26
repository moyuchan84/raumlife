import type { Tile, TileType } from '../engine';
import { ZONES } from '../engine';
import type { PlayerView } from '../shared/protocol';
import { SEAT_COLORS } from '../shared/avatar';
import { avatarImageEl } from './avatar2d';

export const TILE_ICON: Record<TileType, string> = {
  journey: '🌴',
  activity: '🏄',
  trouble: '⚠️',
  camp: '⛺',
  path: '🪧',
  lodge: '🏠',
  fork: '🔀',
  weather: '🌦️',
  milestone: '🚩',
  summit: '🗼',
};
export const TILE_NAME: Record<TileType, string> = {
  journey: '여정',
  activity: '액티비티',
  trouble: '트러블',
  camp: '캠프',
  path: '진로',
  lodge: '보금자리',
  fork: '갈림길',
  weather: '날씨',
  milestone: '이정표',
  summit: '종착지',
};

const ZONE_COLORS = [
  ['#f9e3ef', '#4a2640'], // 유아 꽃밭
  ['#dff1d6', '#27421f'], // 숲
  ['#d3ecf1', '#17414a'], // 계곡
  ['#e8e1d3', '#4a3b22'], // 절벽
  ['#f3e6c7', '#4a3a14'], // 능선
  ['#e3efc9', '#364a14'], // 고원
  ['#e6edf5', '#26364a'], // 설선
  ['#dcdfe6', '#2a2f3b'], // 바위
  ['#e9ecf8', '#2b3050'], // 구름
  ['#fde9c9', '#5a3410'], // 정상
] as const;

export interface Pt {
  x: number;
  y: number;
}

const W = 860;
const LEFT = 120;
const RIGHT = 36;
const ROW_H = 150;
const TOP = 24;
const LANE = 46;
const R = 17;

export interface Layout {
  pos: Pt[]; // tile id → 좌표
  width: number;
  height: number;
  zoneRows: { zone: number; y0: number; y1: number }[];
}

/** 구간마다 한 줄씩, 아래(시작)에서 위(정상)로 지그재그로 올라가는 배치 */
export function layoutBoard(tiles: Tile[], startZone: number, endZone: number): Layout {
  const n = endZone - startZone + 1;
  const pos: Pt[] = new Array(tiles.length);
  const height = TOP * 2 + n * ROW_H;
  const zoneRows: Layout['zoneRows'] = [];
  const span = W - LEFT - RIGHT;

  for (let z = startZone; z <= endZone; z++) {
    const idx = z - startZone;
    const rowFromTop = n - 1 - idx;
    const y0 = TOP + rowFromTop * ROW_H;
    zoneRows.push({ zone: z, y0, y1: y0 + ROW_H });
    const baseY = y0 + ROW_H / 2 + 20;
    const mirrored = idx % 2 === 1;
    const zt = tiles.filter((t) => t.zone === z);
    const fork = zt.find((t) => t.type === 'fork')!;
    const longs = zt.filter((t) => t.route === 'long');
    const shorts = zt.filter((t) => t.route === 'short');
    const leadCount = zt.filter((t) => t.id < fork.id).length;
    const cols = zt.length - shorts.length; // 둘레길 기준 열 수
    const colX = (c: number) => {
      const f = cols === 1 ? 0 : c / (cols - 1);
      return LEFT + (mirrored ? 1 - f : f) * span;
    };
    let c = 0;
    for (const t of zt) {
      if (t.route === 'short') continue;
      pos[t.id] = { x: colX(c), y: baseY };
      c++;
    }
    // 지름길 칸은 둘레길 위 칸 사이에 고르게 배치 (한 단 위)
    const firstLong = leadCount + 1;
    shorts.forEach((t, j) => {
      const f = firstLong - 1 + ((j + 1) * (longs.length + 1)) / (shorts.length + 1);
      pos[t.id] = { x: colX(f), y: baseY - LANE };
    });
  }
  return { pos, width: W, height, zoneRows };
}

// ───────── 그리기 ─────────

export interface DrawOptions {
  tiles: Tile[];
  layout: Layout;
  players: PlayerView[];
  current: number;
  /** 애니메이션 중인 말의 화면 좌표 (없으면 칸 위치) */
  tokenPos: Map<number, Pt>;
  highlight?: number | null; // 강조할 칸
  me: number;
  dpr: number;
}

export function draw(ctx: CanvasRenderingContext2D, o: DrawOptions) {
  const { layout, tiles } = o;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
  ctx.clearRect(0, 0, layout.width, layout.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 구간 배경
  for (const row of layout.zoneRows) {
    const [bg, fg] = ZONE_COLORS[row.zone - 1]!;
    ctx.fillStyle = dark ? shade(bg, 0.28) : bg;
    ctx.fillRect(0, row.y0, layout.width, ROW_H);
    ctx.fillStyle = dark ? '#ffffff22' : '#00000010';
    ctx.fillRect(0, row.y0, layout.width, 1);
    const info = ZONES[row.zone - 1]!;
    ctx.textAlign = 'left';
    ctx.fillStyle = dark ? '#e8e8ea' : fg;
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.fillText(info.name, 14, row.y0 + 24);
    ctx.font = '12px system-ui, sans-serif';
    ctx.globalAlpha = 0.75;
    ctx.fillText(`${info.island} · ${info.ages}세`, 14, row.y0 + 44);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
  }

  // 길
  ctx.lineCap = 'round';
  for (const t of tiles) {
    const a = layout.pos[t.id]!;
    for (const nx of t.next) {
      const b = layout.pos[nx]!;
      const nt = tiles[nx]!;
      const short = nt.route === 'short' || t.route === 'short';
      ctx.beginPath();
      ctx.setLineDash(short ? [6, 6] : []);
      ctx.lineWidth = short ? 3 : 6;
      ctx.strokeStyle = short ? (dark ? '#e0a050' : '#c9822a') : dark ? '#8d8470' : '#b9ad92';
      if (t.zone !== nt.zone) {
        // 구간 사이는 부드러운 곡선
        ctx.moveTo(a.x, a.y);
        ctx.bezierCurveTo(a.x, (a.y + b.y) / 2, b.x, (a.y + b.y) / 2, b.x, b.y);
      } else {
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  // 칸
  for (const t of tiles) {
    const p = layout.pos[t.id]!;
    ctx.beginPath();
    ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
    ctx.fillStyle = dark ? '#2b2b30' : '#fffdf8';
    ctx.fill();
    ctx.lineWidth = t.risky ? 3 : 2;
    ctx.strokeStyle = t.risky ? '#d9731f' : t.type === 'summit' ? '#e0a100' : dark ? '#6b6b73' : '#a89d85';
    ctx.stroke();
    ctx.font = '17px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    ctx.fillStyle = '#000';
    ctx.fillText(TILE_ICON[t.type], p.x, p.y + 1);
    if (o.highlight === t.id) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, R + 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#2f80ed';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  // 말: 같은 칸에 있으면 둘레에 나눠 배치
  const byTile = new Map<number, PlayerView[]>();
  for (const p of o.players) {
    byTile.set(p.pos, [...(byTile.get(p.pos) ?? []), p]);
  }
  for (const p of o.players) {
    const group = byTile.get(p.pos)!;
    const k = group.indexOf(p);
    const base = o.tokenPos.get(p.id) ?? layout.pos[p.pos]!;
    let x = base.x;
    let y = base.y - 4;
    if (!o.tokenPos.has(p.id) && group.length > 1) {
      const ang = (k / group.length) * Math.PI * 2 - Math.PI / 2;
      const rad = group.length > 3 ? 23 : 19;
      x += Math.cos(ang) * rad;
      y += Math.sin(ang) * rad - 4;
    }
    const col = SEAT_COLORS[p.id % SEAT_COLORS.length]!;
    const sz = p.id === o.me ? 34 : 30;
    if (p.id === o.current) {
      ctx.beginPath();
      ctx.arc(x, y - 2, sz / 2 + 6, 0, Math.PI * 2);
      ctx.fillStyle = col + '44';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y - 2, sz / 2 + 2, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    const img = avatarImageEl(p.avatar, 64);
    if (img.complete && img.naturalWidth) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y - 2, sz / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#e6f4fb';
      ctx.fillRect(x - sz / 2, y - 2 - sz / 2, sz, sz);
      ctx.drawImage(img, x - sz / 2, y - 2 - sz / 2, sz, sz);
      ctx.restore();
    }
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fffdf8';
    ctx.strokeText(p.id === o.me ? `${p.name} (나)` : p.name, x, y - sz / 2 - 9);
    ctx.fillStyle = col;
    ctx.fillText(p.id === o.me ? `${p.name} (나)` : p.name, x, y - sz / 2 - 9);
  }
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}

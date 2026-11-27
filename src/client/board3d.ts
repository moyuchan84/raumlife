import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Tile, TileType } from '../engine';
import { Rng, ZONES } from '../engine';
import { SEAT_COLORS } from '../shared/avatar';
import type { PlayerView } from '../shared/protocol';
import { animateCharacter, createCharacter, type Char3D, type CharMode } from './avatar3d';
import { tileIcon } from './board';

// ───────── 배치 ─────────
const SPACING = 42; // 섬 사이 간격
const SWAY = 20; // 섬이 지그재그로 놓이는 폭
const TOP_Y = 1.0; // 섬 윗면 높이
const R_STD = 13;
const R_SHORT = 10;

export interface Island {
  zone: number;
  center: THREE.Vector3;
  radius: number;
  ringR: number;
  thetaIn: number;
  thetaOut: number;
  sweep: number;
  sgn: 1 | -1;
}

const ang2 = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(to.z - from.z, to.x - from.x);
const mod2pi = (x: number) => ((x % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

/**
 * 구간(=섬)마다 하나의 섬을 만들고, 섬들을 바다 위에 지그재그로 늘어놓는다.
 * 해안길은 섬의 둘레를 따라 호를 그리고, 지름길은 그 호를 가로지르는 직선(현)이다.
 */
export function layout3d(tiles: Tile[], startZone: number, endZone: number) {
  const n = endZone - startZone + 1;
  const pos: THREE.Vector3[] = new Array(tiles.length);
  const centers = Array.from({ length: n }, (_, i) => new THREE.Vector3(i * SPACING - ((n - 1) * SPACING) / 2, 0, Math.sin(i * 1.1) * SWAY));
  const islands: Island[] = [];
  const bridges: { a: THREE.Vector3; b: THREE.Vector3 }[] = [];

  for (let i = 0; i < n; i++) {
    const z = startZone + i;
    const info = ZONES[z - 1]!;
    const c = centers[i]!;
    const radius = info.length === 16 ? R_STD : R_SHORT;
    const ringR = radius * 0.88;
    const thetaIn = i === 0 ? Math.PI : ang2(c, centers[i - 1]!);
    const thetaOut = i === n - 1 ? thetaIn + Math.PI : ang2(c, centers[i + 1]!);
    const d = mod2pi(thetaOut - thetaIn);
    // 해안길이 섬을 더 길게(반 바퀴 이상) 돌도록 방향을 정한다. 반반이면 섬마다 번갈아
    let sgn: 1 | -1 = d >= Math.PI ? 1 : -1;
    if (Math.abs(d - Math.PI) < 0.3) sgn = i % 2 === 0 ? 1 : -1;
    const sweep = sgn === 1 ? d : Math.PI * 2 - d;
    const isl: Island = { zone: z, center: c, radius, ringR, thetaIn, thetaOut, sweep: Math.max(sweep, Math.PI * 0.9), sgn };
    islands.push(isl);

    const zt = tiles.filter((t) => t.zone === z);
    const ring = zt.filter((t) => t.route !== 'short'); // 앞길 → 갈림길 → 해안길 → 뒷길
    const shorts = zt.filter((t) => t.route === 'short');
    ring.forEach((t, k) => {
      const ang = isl.thetaIn + isl.sgn * isl.sweep * (ring.length === 1 ? 0 : k / (ring.length - 1));
      pos[t.id] = new THREE.Vector3(c.x + Math.cos(ang) * ringR, TOP_Y, c.z + Math.sin(ang) * ringR);
    });
    const fork = zt.find((t) => t.type === 'fork')!;
    const lastShort = shorts[shorts.length - 1]!;
    const tailFirst = ring.find((t) => t.id > lastShort.id) ?? ring[ring.length - 1]!;
    const f = pos[fork.id]!;
    const e = pos[tailFirst.id]!;
    shorts.forEach((t, j) => {
      pos[t.id] = f.clone().lerp(e, (j + 1) / (shorts.length + 1));
    });
  }
  // 섬과 섬을 잇는 다리: 한 섬의 마지막 칸 → 다음 섬의 첫 칸
  for (let i = 0; i < n - 1; i++) {
    const last = tiles.filter((t) => t.zone === startZone + i).reduce((a, t) => (t.id > a.id ? t : a));
    const first = tiles.filter((t) => t.zone === startZone + i + 1).reduce((a, t) => (t.id < a.id ? t : a));
    bridges.push({ a: pos[last.id]!.clone(), b: pos[first.id]!.clone() });
  }
  return { pos, islands, bridges };
}

// ───────── 재료 ─────────
const lamberts = new Map<string, THREE.MeshLambertMaterial>();
function lam(color: string | number, emissive?: number): THREE.MeshLambertMaterial {
  const key = `${color}:${emissive ?? ''}`;
  let m = lamberts.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...(emissive !== undefined ? { emissive } : {}) });
    lamberts.set(key, m);
  }
  return m;
}

const GEO = {
  sphere: new THREE.SphereGeometry(1, 10, 8),
  ico: new THREE.IcosahedronGeometry(1, 0),
  cone: new THREE.ConeGeometry(1, 1, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  box: new THREE.BoxGeometry(1, 1, 1),
};
function mk(geo: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy = sx, sz = sx, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

// ───────── 소품 ─────────
function palm(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const h = 3 + rng.next() * 1.6;
  const lean = (rng.next() - 0.5) * 0.5;
  for (let i = 0; i < 4; i++) {
    g.add(mk(GEO.cyl, lam('#9c6b3f'), 0.26 - i * 0.03, h / 4, 0.26 - i * 0.03, lean * i * 0.5, (h / 4) * (i + 0.5), 0));
  }
  const top = new THREE.Group();
  top.position.set(lean * 1.5, h, 0);
  for (let i = 0; i < 6; i++) {
    const leaf = mk(GEO.cone, lam(i % 2 ? '#3f9b4a' : '#4fb35a'), 0.28, 1.9, 0.08);
    leaf.rotation.set(0, 0, -1.25);
    leaf.position.set(0.9, -0.15, 0);
    const holder = new THREE.Group();
    holder.rotation.y = (i / 6) * Math.PI * 2;
    holder.add(leaf);
    top.add(holder);
  }
  top.add(mk(GEO.sphere, lam('#7a4a22'), 0.22, 0.22, 0.22, 0.1, -0.15, 0.1));
  g.add(top);
  return g;
}
function pine(rng: Rng, snow = false): THREE.Group {
  const g = new THREE.Group();
  const s = 0.9 + rng.next() * 0.6;
  g.add(mk(GEO.cyl, lam('#7a5230'), 0.22 * s, 0.9 * s, 0.22 * s, 0, 0.45 * s, 0));
  for (let i = 0; i < 3; i++) {
    g.add(mk(GEO.cone, lam(snow ? '#e8f1f7' : i % 2 ? '#2f8a4a' : '#3a9a52'), (1.25 - i * 0.28) * s, 1.3 * s, (1.25 - i * 0.28) * s, 0, (1.2 + i * 0.85) * s, 0));
  }
  return g;
}
function roundTree(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const s = 0.9 + rng.next() * 0.5;
  g.add(mk(GEO.cyl, lam('#8a5a33'), 0.24 * s, 1.4 * s, 0.24 * s, 0, 0.7 * s, 0));
  g.add(mk(GEO.ico, lam('#58b04f'), 1.3 * s, 1.15 * s, 1.3 * s, 0, 2.0 * s, 0));
  g.add(mk(GEO.ico, lam('#6cc45e'), 0.9 * s, 0.8 * s, 0.9 * s, 0.5 * s, 2.7 * s, 0.2 * s));
  return g;
}
function rock(rng: Rng, big = false): THREE.Group {
  const g = new THREE.Group();
  const n = big ? 3 : 1 + rng.int(2);
  for (let i = 0; i < n; i++) {
    const s = (big ? 1.4 : 0.55) * (0.7 + rng.next() * 0.7);
    const m = mk(GEO.ico, lam(i % 2 ? '#9aa1a8' : '#b6bcc2'), s, s * (0.7 + rng.next() * 0.6), s, (rng.next() - 0.5) * 1.2, s * 0.4, (rng.next() - 0.5) * 1.2);
    m.rotation.set(rng.next() * 3, rng.next() * 3, 0);
    g.add(m);
  }
  return g;
}
function flower(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const col = ['#ff7a90', '#ffd24a', '#ffffff', '#c58bff', '#ff9a4a'][rng.int(5)]!;
  g.add(mk(GEO.cyl, lam('#4f9a3f'), 0.04, 0.5, 0.04, 0, 0.25, 0));
  g.add(mk(GEO.sphere, lam(col), 0.2, 0.14, 0.2, 0, 0.55, 0));
  return g;
}
function shell(): THREE.Group {
  const g = new THREE.Group();
  g.add(mk(GEO.cone, lam('#fff3e6'), 0.3, 0.45, 0.3, 0, 0.2, 0));
  return g;
}
function cloudPuff(rng: Rng, s = 1): THREE.Group {
  const g = new THREE.Group();
  const w = lam('#ffffff');
  for (let i = 0; i < 4; i++) g.add(mk(GEO.sphere, w, (1.3 - i * 0.18) * s, (0.9 - i * 0.1) * s, (1.1 - i * 0.12) * s, (i - 1.5) * 1.2 * s, rng.next() * 0.3 * s, (rng.next() - 0.5) * 0.6 * s));
  return g;
}
function tent(): THREE.Group {
  const g = new THREE.Group();
  g.add(mk(GEO.cone, lam('#f08a3c'), 1.15, 1.5, 1.15, 0, 0.75, 0));
  g.add(mk(GEO.cone, lam('#fff3d6'), 0.4, 0.7, 0.4, 0, 0.35, 0.78));
  return g;
}
function house(): THREE.Group {
  const g = new THREE.Group();
  g.add(mk(GEO.box, lam('#f3e2c1'), 1.5, 1.1, 1.3, 0, 0.55, 0));
  const roof = mk(GEO.cone, lam('#d86a6a'), 1.35, 0.9, 1.35, 0, 1.55, 0);
  roof.rotation.y = Math.PI / 4;
  g.add(roof, mk(GEO.box, lam('#8a5a33'), 0.3, 0.6, 0.05, 0, 0.3, 0.68));
  return g;
}
function flag(color = '#ffd23f'): THREE.Group {
  const g = new THREE.Group();
  g.add(mk(GEO.cyl, lam('#8a8f99'), 0.06, 2.6, 0.06, 0, 1.3, 0), mk(GEO.box, lam(color), 0.9, 0.55, 0.05, 0.45, 2.3, 0));
  return g;
}
function umbrella(): THREE.Group {
  const g = new THREE.Group();
  g.add(mk(GEO.cyl, lam('#f5f5f5'), 0.06, 2.4, 0.06, 0, 1.2, 0), mk(GEO.cone, lam('#ff5f8a'), 1.4, 0.7, 1.4, 0, 2.5, 0));
  g.add(mk(GEO.cone, lam('#ffe45e'), 0.8, 0.7, 0.8, 0, 2.52, 0));
  return g;
}
function troubleProp(): THREE.Group {
  const g = new THREE.Group();
  g.add(mk(GEO.ico, lam('#7b7f86'), 0.8, 0.7, 0.8, -0.4, 0.4, 0));
  g.add(mk(GEO.cyl, lam('#6b4a2a'), 0.06, 1.8, 0.06, 0.6, 0.9, 0), mk(GEO.cone, lam('#e8483f'), 0.6, 0.6, 0.12, 0.6, 1.9, 0));
  return g;
}
function signpost(): THREE.Group {
  const g = new THREE.Group();
  g.add(mk(GEO.cyl, lam('#8a5a33'), 0.09, 2.2, 0.09, 0, 1.1, 0), mk(GEO.box, lam('#f1d28a'), 1.0, 0.34, 0.07, 0.3, 1.9, 0), mk(GEO.box, lam('#f1d28a'), 0.9, 0.3, 0.07, -0.25, 1.45, 0));
  return g;
}
function snowman(): THREE.Group {
  const g = new THREE.Group();
  const w = lam('#ffffff');
  g.add(mk(GEO.sphere, w, 0.8, 0.8, 0.8, 0, 0.7, 0), mk(GEO.sphere, w, 0.58, 0.58, 0.58, 0, 1.7, 0), mk(GEO.sphere, w, 0.42, 0.42, 0.42, 0, 2.4, 0));
  const nose = mk(GEO.cone, lam('#ff8a2a'), 0.08, 0.4, 0.08, 0, 2.4, 0.45);
  nose.rotation.x = Math.PI / 2;
  g.add(nose);
  return g;
}
function windmill(): THREE.Group {
  const g = new THREE.Group();
  g.add(mk(GEO.cyl, lam('#f3e8d0'), 1.4, 4.6, 1.4, 0, 2.3, 0));
  g.add(mk(GEO.cone, lam('#c45d4a'), 1.75, 1.6, 1.75, 0, 5.3, 0));
  const blades = new THREE.Group();
  blades.position.set(0, 4.4, 1.6);
  for (let i = 0; i < 4; i++) {
    const b = mk(GEO.box, lam('#ffffff'), 0.45, 3.2, 0.08, 0, 1.6, 0);
    const holder = new THREE.Group();
    holder.rotation.z = (i / 4) * Math.PI * 2;
    holder.add(b);
    blades.add(holder);
  }
  blades.userData.spinZ = true;
  g.add(blades);
  return g;
}
function volcano(): THREE.Group {
  const g = new THREE.Group();
  g.add(mk(GEO.cone, lam('#6e5448'), 5.2, 6.5, 5.2, 0, 3.25, 0));
  g.add(mk(GEO.cyl, lam('#ff6a2a', 0xff4a10), 1.7, 0.3, 1.7, 0, 6.5, 0));
  for (let i = 0; i < 3; i++) g.add(mk(GEO.sphere, lam('#d0d0d4'), 0.9 + i * 0.35, 0.8 + i * 0.3, 0.9 + i * 0.35, 0.3 * i, 8 + i * 1.4, 0));
  return g;
}
function lighthouse(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const r = 1.8 - i * 0.2;
    g.add(mk(GEO.cyl, lam(i % 2 ? '#ffffff' : '#e8483f'), r, 2.2, r, 0, 1.1 + i * 2.2, 0));
  }
  g.add(mk(GEO.cyl, lam('#3a3a44'), 1.9, 0.3, 1.9, 0, 9.0, 0));
  g.add(mk(GEO.cyl, lam('#fff2a8', 0xffe066), 0.9, 1.3, 0.9, 0, 9.8, 0));
  g.add(mk(GEO.cone, lam('#e8483f'), 1.3, 1.2, 1.3, 0, 11.1, 0));
  const beam = mk(GEO.cone, new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.26, depthWrite: false }), 2.6, 16, 2.6, 8, 0, 0);
  beam.rotation.z = -Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(beam);
  holder.position.y = 9.8;
  holder.userData.spinY = true;
  g.add(holder);
  return g;
}

interface Biome {
  ground: string;
  sand: string;
  mix: (rng: Rng) => THREE.Object3D | null;
  feature?: () => THREE.Object3D;
  featureClear?: number;
  pond?: boolean;
  count: number;
  lift?: number;
}

const BIOMES: Biome[] = [
  { ground: '#f1dca4', sand: '#f8e9c0', count: 20, mix: (r) => (r.next() < 0.45 ? palm(r) : r.next() < 0.6 ? shell() : rock(r)) },
  { ground: '#5fae5b', sand: '#e8d6a3', count: 34, mix: (r) => (r.next() < 0.55 ? pine(r) : roundTree(r)) },
  { ground: '#78c47a', sand: '#e8d6a3', count: 26, pond: true, mix: (r) => (r.next() < 0.6 ? roundTree(r) : r.next() < 0.5 ? flower(r) : rock(r)) },
  { ground: '#b9ad98', sand: '#d6ccb8', count: 22, feature: () => rock(new Rng(3), true), featureClear: 4, mix: (r) => (r.next() < 0.6 ? rock(r, r.next() < 0.3) : pine(r)) },
  { ground: '#8c6a58', sand: '#5a4a44', count: 18, feature: volcano, featureClear: 6, mix: (r) => (r.next() < 0.7 ? rock(r) : palm(r)) },
  { ground: '#9fd46b', sand: '#efe0a8', count: 38, feature: windmill, featureClear: 3, mix: (r) => (r.next() < 0.7 ? flower(r) : roundTree(r)) },
  { ground: '#f1f6fb', sand: '#dce8f2', count: 28, feature: snowman, featureClear: 2, mix: (r) => (r.next() < 0.75 ? pine(r, true) : rock(r)) },
  { ground: '#aeb4bb', sand: '#cfd3d8', count: 22, mix: (r) => (r.next() < 0.65 ? rock(r, r.next() < 0.25) : palm(r)) },
  { ground: '#f4f6ff', sand: '#e6e9fb', count: 14, lift: 3, mix: (r) => (r.next() < 0.5 ? cloudPuff(r, 0.9) : flower(r)) },
  { ground: '#ffd7a1', sand: '#ffe9c4', count: 18, mix: (r) => (r.next() < 0.5 ? palm(r) : r.next() < 0.5 ? shell() : rock(r)) },
];
const liftOfZone = (zone: number) => BIOMES[(zone - 1) % BIOMES.length]!.lift ?? 0;

// ───────── 3D 보드 ─────────
export interface Board3D {
  update(players: PlayerView[], current: number, me: number): void;
  animateMove(player: number, path: number[]): void;
  floatText(tileId: number, text: string): void;
  /** 캐릭터 머리 위에 축하 문구를 띄우고 만세를 시킨다 */
  celebrate(player: number, text: string): void;
  focus(tileId: number): void;
  setOverview(on: boolean): void;
  resize(): void;
  destroy(): void;
  readonly canvas: HTMLCanvasElement;
}

function emojiTexture(emoji: string, size = 96): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${size * 0.72}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.fillText(emoji, size / 2, size / 2 + size * 0.04);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function textSprite(text: string, color = '#222', w = 10): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.font = '700 44px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(255,255,255,.96)';
  g.strokeText(text, 256, 48);
  g.fillStyle = color;
  g.fillText(text, 256, 48);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  s.scale.set(w, (w * 96) / 512, 1);
  s.renderOrder = 10;
  return s;
}

const TILE_COLOR: Record<TileType, string> = {
  journey: '#7cc46a',
  activity: '#ffcf4a',
  trouble: '#e8645a',
  camp: '#f0a04a',
  path: '#b58cf0',
  lodge: '#f08aa0',
  fork: '#5aa0e8',
  weather: '#8cc4e8',
  milestone: '#ffd23f',
  summit: '#ffe066',
};

/** 위치에 따라 같은 값을 돌려주는 해시 (지오메트리 이음새가 갈라지지 않게) */
const hash3 = (x: number, y: number, z: number) => {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
};
function jitter(geo: THREE.BufferGeometry, amp: number) {
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = hash3(Math.round(x * 4) / 4, Math.round(y * 4) / 4, Math.round(z * 4) / 4) - 0.5;
    p.setXYZ(i, x + k * amp, y, z + (hash3(z, x, y) - 0.5) * amp);
  }
  geo.computeVertexNormals();
}

export function createBoard3D(container: HTMLElement, tiles: Tile[], startZone: number, endZone: number): Board3D {
  const { pos, islands, bridges } = layout3d(tiles, startZone, endZone);
  const n = islands.length;
  const rng = new Rng(20240611);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0xbfe6f7);
  container.append(renderer.domElement);
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfe6f7, 260, 900);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 1200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6fb4d4, 1.5));
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.7);
  sun.position.set(40, 80, 30);
  scene.add(sun);

  // ── 바다
  const seaGeo = new THREE.PlaneGeometry(900, 500, 70, 40);
  seaGeo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(seaGeo, new THREE.MeshPhongMaterial({ color: 0x3aa8d8, flatShading: true, transparent: true, opacity: 0.92, shininess: 60 }));
  sea.position.y = 0.05;
  scene.add(sea);
  const seaBase = Float32Array.from(seaGeo.attributes.position!.array);

  const spinners: THREE.Object3D[] = [];
  const foams: THREE.Mesh[] = [];
  const clouds: THREE.Group[] = [];
  const chordSegs: { a: THREE.Vector3; b: THREE.Vector3 }[] = [];

  // ── 길: 해안길은 모래색 띠, 지름길은 갈색 점선
  const roadMat = lam('#ecdcae');
  const shortMat = lam('#a9733d');
  const up = new THREE.Vector3(0, 1, 0);
  const tube = (a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, y = TOP_Y + 0.03): THREE.Mesh => {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(GEO.cyl, mat);
    m.scale.set(r, len, r);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.position.y = y;
    m.quaternion.setFromUnitVectors(up, b.clone().sub(a).setY(0).normalize().add(new THREE.Vector3(0, 0, 0)));
    scene.add(m);
    return m;
  };
  const flatTube = (a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) => {
    const dir = b.clone().sub(a);
    const len = dir.length();
    const m = new THREE.Mesh(GEO.cyl, mat);
    m.scale.set(r, len, r);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, dir.normalize());
    scene.add(m);
    return m;
  };

  for (const t of tiles) {
    for (const nx of t.next) {
      const a = pos[t.id]!;
      const b = pos[nx]!;
      if (tiles[nx]!.zone !== t.zone) continue; // 섬 사이는 다리로
      const isShort = tiles[nx]!.route === 'short' || t.route === 'short';
      if (isShort) {
        chordSegs.push({ a, b });
        const len = a.distanceTo(b);
        const steps = Math.max(2, Math.round(len / 1.1));
        for (let i = 0; i < steps; i += 2) {
          flatTube(a.clone().lerp(b, i / steps).setY(TOP_Y + 0.05), a.clone().lerp(b, (i + 0.8) / steps).setY(TOP_Y + 0.05), 0.22, shortMat);
        }
      } else {
        flatTube(a.clone().setY(TOP_Y + 0.05), b.clone().setY(TOP_Y + 0.05), 0.48, roadMat);
      }
    }
  }
  void tube;

  // ── 섬
  islands.forEach((isl) => {
    const biome = BIOMES[(isl.zone - 1) % BIOMES.length]!;
    const R = isl.radius;
    const lift = biome.lift ?? 0;
    const g = new THREE.Group();
    g.position.set(isl.center.x, lift, isl.center.z);
    const sandGeo = new THREE.CylinderGeometry(R + 2.2, R + 3.2, 1.2, 28);
    jitter(sandGeo, 1.2);
    const sand = new THREE.Mesh(sandGeo, lam(biome.sand));
    const grassGeo = new THREE.CylinderGeometry(R, R + 0.9, 0.9, 28);
    jitter(grassGeo, 0.9);
    const grass = new THREE.Mesh(grassGeo, lam(biome.ground));
    grass.position.y = TOP_Y - 0.45;
    const underGeo = new THREE.CylinderGeometry(R + 3, R * 0.45, 5, 18);
    jitter(underGeo, 2);
    const under = new THREE.Mesh(underGeo, lam('#8b6b4a'));
    under.position.y = -3;
    g.add(sand, grass, under);
    scene.add(g);

    if (lift) {
      for (let k = 0; k < 9; k++) {
        const c = cloudPuff(rng, 1.6);
        const a = (k / 9) * Math.PI * 2;
        c.position.set(isl.center.x + Math.cos(a) * (R + 2), -1.5 + rng.next(), isl.center.z + Math.sin(a) * (R + 2));
        scene.add(c);
      }
    }
    const foam = new THREE.Mesh(new THREE.RingGeometry(R + 3, R + 4.4, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(isl.center.x, 0.12, isl.center.z);
    scene.add(foam);
    foams.push(foam);

    // 길 주변에는 소품을 놓지 않는다
    const myTiles = tiles.filter((t) => t.zone === isl.zone).map((t) => pos[t.id]!);
    const chords = chordSegs.filter((s) => myTiles.some((p) => p.distanceTo(s.a) < 0.01));
    const clearance = (x: number, z: number) => {
      let d = Infinity;
      for (const p of myTiles) d = Math.min(d, Math.hypot(p.x - x, p.z - z));
      for (const s of chords) {
        const abx = s.b.x - s.a.x;
        const abz = s.b.z - s.a.z;
        const u = Math.max(0, Math.min(1, ((x - s.a.x) * abx + (z - s.a.z) * abz) / (abx * abx + abz * abz)));
        d = Math.min(d, Math.hypot(s.a.x + abx * u - x, s.a.z + abz * u - z));
      }
      return d;
    };
    const bestSpot = (): THREE.Vector3 => {
      let best = new THREE.Vector3(isl.center.x, 0, isl.center.z);
      let bestD = -1;
      for (let r = 0; r <= R * 0.7; r += 1) {
        for (let a = 0; a < Math.PI * 2; a += 0.3) {
          const x = isl.center.x + Math.cos(a) * r;
          const z = isl.center.z + Math.sin(a) * r;
          const d = clearance(x, z);
          if (d > bestD) {
            bestD = d;
            best = new THREE.Vector3(x, 0, z);
          }
        }
      }
      return best;
    };
    const placed: THREE.Vector3[] = [];
    if (biome.feature) {
      const spot = bestSpot();
      const f = biome.feature();
      f.position.set(spot.x, TOP_Y + lift, spot.z);
      scene.add(f);
      placed.push(spot);
      f.traverse((o) => {
        if (o.userData.spinY || o.userData.spinZ) spinners.push(o);
      });
    }
    if (biome.pond) {
      const spot = bestSpot();
      const pond = new THREE.Mesh(new THREE.CircleGeometry(3.2, 20), lam('#5ec0e8'));
      pond.rotation.x = -Math.PI / 2;
      pond.position.set(spot.x, TOP_Y + 0.04 + lift, spot.z);
      scene.add(pond);
      placed.push(spot);
    }
    let tries = 0;
    let made = 0;
    while (made < biome.count && tries++ < biome.count * 25) {
      const a = rng.next() * Math.PI * 2;
      const r = Math.sqrt(rng.next()) * (R - 1.2);
      const x = isl.center.x + Math.cos(a) * r;
      const z = isl.center.z + Math.sin(a) * r;
      if (clearance(x, z) < 2.6) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < (biome.featureClear ?? 3) + 2.2)) continue;
      const prop = biome.mix(rng);
      if (!prop) continue;
      prop.position.set(x, TOP_Y + lift, z);
      prop.rotation.y = rng.next() * Math.PI * 2;
      scene.add(prop);
      made++;
    }
  });

  // ── 다리
  const plankMat = lam('#b58a54');
  const railMat = lam('#8a6a40');
  for (const { a, b } of bridges) {
    const len = a.distanceTo(b);
    const dir = b.clone().sub(a).normalize();
    const planks = Math.max(2, Math.floor(len / 0.85));
    const yaw = Math.atan2(dir.x, dir.z);
    const sideV = new THREE.Vector3(dir.z, 0, -dir.x);
    for (let i = 0; i <= planks; i++) {
      const p = a.clone().lerp(b, i / planks);
      const pl = mk(GEO.box, plankMat, 2.2, 0.16, 0.7, p.x, TOP_Y - 0.05, p.z);
      pl.rotation.y = yaw;
      scene.add(pl);
      if (i % 3 === 0) {
        for (const s of [-1, 1]) scene.add(mk(GEO.cyl, railMat, 0.09, 1.0, 0.09, p.x + sideV.x * s * 1.1, TOP_Y + 0.4, p.z + sideV.z * s * 1.1));
      }
    }
    for (const s of [-1, 1]) {
      const o = sideV.clone().multiplyScalar(s * 1.1);
      flatTube(a.clone().add(o).setY(TOP_Y + 0.85), b.clone().add(o).setY(TOP_Y + 0.85), 0.07, railMat);
    }
  }

  // ── 칸 (원판 + 아이콘 + 작은 소품)
  const icons = new Map<string, THREE.CanvasTexture>();
  const tileIconSprites: THREE.Sprite[] = [];
  for (const t of tiles) {
    const p = pos[t.id]!;
    const isl = islands[t.zone - startZone]!;
    const lift = liftOfZone(t.zone);
    const big = t.type === 'summit';
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(big ? 1.6 : 1.1, big ? 1.8 : 1.25, 0.34, 18), lam(t.risky && t.type === 'journey' ? '#ee9a3a' : TILE_COLOR[t.type]));
    disc.position.set(p.x, p.y + 0.08 + lift, p.z);
    scene.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.14, 0.07, 6, 22), lam(t.risky ? '#d9731f' : '#ffffff'));
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(disc.position).setY(disc.position.y + 0.17);
    scene.add(ring);
    const outward = new THREE.Vector3(p.x - isl.center.x, 0, p.z - isl.center.z);
    if (outward.lengthSq() < 1e-6) outward.set(0, 0, 1);
    outward.normalize();
    // 소품은 해안 쪽(바깥)에 놓아 길을 가리지 않게
    let prop: THREE.Object3D | null = null;
    switch (t.type) {
      case 'camp': prop = tent(); break;
      case 'lodge': prop = house(); break;
      case 'milestone': prop = flag(); break;
      case 'activity': prop = umbrella(); break;
      case 'trouble': prop = troubleProp(); break;
      case 'path':
      case 'fork': prop = signpost(); break;
      case 'weather': prop = cloudPuff(rng, 0.9); break;
      case 'summit': prop = null; break;
      default: prop = rng.next() < 0.5 ? palm(rng) : roundTree(rng);
    }
    if (prop) {
      const side = outward.clone().multiplyScalar(2.3);
      prop.position.set(p.x + side.x, p.y + lift + (t.type === 'weather' ? 3.4 : 0), p.z + side.z);
      prop.rotation.y = Math.atan2(-outward.x, -outward.z);
      scene.add(prop);
    }
    if (t.type !== 'journey' && t.type !== 'fork') {
      const glyph = tileIcon(t.type, t.zone);
      if (!icons.has(glyph)) icons.set(glyph, emojiTexture(glyph));
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: icons.get(glyph)!, transparent: true }));
      spr.scale.setScalar(big ? 3 : 1.7);
      spr.position.set(p.x, p.y + lift + 2.2 + (big ? 1 : 0), p.z);
      spr.userData.baseY = spr.position.y;
      scene.add(spr);
      tileIconSprites.push(spr);
    }
    if (big) {
      const lh = lighthouse();
      lh.position.set(p.x + outward.x * 5, p.y + lift, p.z + outward.z * 5);
      scene.add(lh);
      lh.traverse((o) => {
        if (o.userData.spinY || o.userData.spinZ) spinners.push(o);
      });
      const glow = new THREE.PointLight(0xffd27a, 80, 60);
      glow.position.set(lh.position.x, p.y + lift + 10, lh.position.z);
      scene.add(glow);
    }
  }

  // ── 구름
  for (let i = 0; i < 9; i++) {
    const c = cloudPuff(rng, 2.4);
    c.position.set((rng.next() - 0.5) * (n * SPACING + 80), 38 + rng.next() * 18, (rng.next() - 0.5) * 140);
    scene.add(c);
    clouds.push(c);
  }

  // ── 섬 이름표
  islands.forEach((isl) => {
    const label = textSprite(ZONES[isl.zone - 1]!.island, '#17414a', 12);
    label.position.set(isl.center.x, 15 + liftOfZone(isl.zone), isl.center.z);
    scene.add(label);
  });

  // ── 캐릭터
  interface Tok {
    stage: number;
    popUntil: number;
    avatarKey: string;
    char: Char3D;
    root: THREE.Group;
    ring: THREE.Mesh;
    label: THREE.Sprite;
    anim: { pts: THREE.Vector3[]; t0: number } | null;
    cur: THREE.Vector3;
    heading: number;
    cheerUntil: number;
  }
  const toks = new Map<number, Tok>();
  let lastPlayers: PlayerView[] = [];
  let current = -1;
  let me = -1;

  const liftOf = (p: PlayerView) => liftOfZone(tiles[p.pos]!.zone);
  const stageOf = (p: PlayerView) => tiles[p.pos]!.zone;
  const baseScale = (c: Char3D) => 0.78 * c.look.scale;
  function ensureTok(p: PlayerView): Tok {
    let t = toks.get(p.id);
    if (t) return t;
    const char = createCharacter(p.avatar, stageOf(p));
    const root = new THREE.Group();
    char.group.scale.setScalar(baseScale(char));
    root.add(char.group);
    const col = SEAT_COLORS[p.id % SEAT_COLORS.length]!;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.14, 8, 26), new THREE.MeshBasicMaterial({ color: col }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.2, 18), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.06;
    const short = p.name.split(' (')[0]!;
    const label = textSprite(p.id === me ? `${short} (나)` : short, col, 6.5);
    label.position.y = 4.6;
    root.add(ring, shadow, label);
    scene.add(root);
    t = { stage: stageOf(p), popUntil: 0, avatarKey: JSON.stringify(p.avatar), char, root, ring, label, anim: null, cur: pos[p.pos]!.clone(), heading: 0, cheerUntil: 0 };
    t.cur.y += liftOf(p);
    toks.set(p.id, t);
    return t;
  }
  function slotOffset(p: PlayerView): THREE.Vector3 {
    const mates = lastPlayers.filter((o) => o.pos === p.pos);
    if (mates.length < 2) return new THREE.Vector3();
    const k = mates.findIndex((o) => o.id === p.id);
    const a = (k / mates.length) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6);
  }

  // ── 카메라
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 10;
  controls.maxDistance = 700;
  controls.maxPolarAngle = Math.PI * 0.47;
  const start = pos[0]!;
  controls.target.copy(start);
  camera.position.set(start.x - 24, start.y + 20, start.z + 30);
  let lastUserMove = -1e9;
  let overview = false;
  const camDist = 34;
  controls.addEventListener('start', () => (lastUserMove = performance.now()));

  const floats: { s: THREE.Sprite; t0: number; y0: number }[] = [];

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // 브라우저 테스트/디버깅용 훅
  (window as unknown as { __lh3d?: unknown }).__lh3d = { camera, controls, toks, islands };

  let raf = 0;
  let lastNow = performance.now();
  const ease = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.5, Math.max(0.001, (now - lastNow) / 1000));
    lastNow = now;
    const t = now / 1000;

    const sp = seaGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) {
      const x = seaBase[i * 3]!;
      const z = seaBase[i * 3 + 2]!;
      sp.setY(i, Math.sin(x * 0.12 + t * 1.2) * 0.22 + Math.cos(z * 0.15 + t * 0.9) * 0.2);
    }
    sp.needsUpdate = true;
    seaGeo.computeVertexNormals();
    foams.forEach((f, i) => f.scale.setScalar(1 + Math.sin(t * 1.3 + i) * 0.03));
    spinners.forEach((s) => {
      if (s.userData.spinZ) s.rotation.z += dt * 0.9;
      else s.rotation.y += dt * 1.1;
    });
    clouds.forEach((c, i) => {
      c.position.x += dt * (0.8 + (i % 3) * 0.3);
      if (c.position.x > n * SPACING * 0.5 + 80) c.position.x = -n * SPACING * 0.5 - 80;
    });
    tileIconSprites.forEach((s, i) => (s.position.y = (s.userData.baseY as number) + Math.sin(t * 2 + i) * 0.18));

    for (const p of lastPlayers) {
      const k = ensureTok(p);
      // 다른 나이 구간(섬)에 들어서면 모습이 바뀐다
      const stg = stageOf(p);
      if (stg !== k.stage) {
        const old = k.char.group;
        const rot = old.rotation.y;
        k.root.remove(old);
        k.char = createCharacter(p.avatar, stg);
        k.char.group.rotation.y = rot;
        k.root.add(k.char.group);
        k.stage = stg;
        k.popUntil = now + 900;
        k.cheerUntil = Math.max(k.cheerUntil, now + 1400);
      }
      const pop = k.popUntil > now ? 1 - (k.popUntil - now) / 900 : 1;
      k.char.group.scale.setScalar(baseScale(k.char) * (0.55 + 0.45 * (1 - Math.pow(1 - pop, 3)) + Math.sin(pop * Math.PI) * 0.18));
      const base = pos[p.pos]!.clone().add(slotOffset(p));
      base.y += liftOf(p);
      let mode: CharMode = 'idle';
      if (k.anim) {
        const f = (now - k.anim.t0) / 300;
        const pts = k.anim.pts;
        if (f >= pts.length - 1) {
          k.anim = null;
        } else {
          const i = Math.max(0, Math.floor(f));
          const u = Math.max(0, f - i);
          k.cur.lerpVectors(pts[i]!, pts[i + 1]!, u);
          k.cur.y += Math.sin(u * Math.PI) * 1.4;
          const d = pts[i + 1]!.clone().sub(pts[i]!);
          if (d.lengthSq() > 1e-4) k.heading = Math.atan2(d.x, d.z);
          mode = 'walk';
        }
      }
      if (!k.anim) k.cur.lerp(base, ease(dt, 0.08));
      if (p.arrived || now < k.cheerUntil) mode = 'cheer';
      k.root.position.copy(k.cur);
      // 걸을 땐 가는 방향, 서 있을 땐 카메라 쪽을 본다
      const faceTarget = mode === 'walk' ? k.heading : Math.atan2(camera.position.x - k.cur.x, camera.position.z - k.cur.z);
      let dy = faceTarget - k.char.group.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      k.char.group.rotation.y += dy * ease(dt, 0.15);
      animateCharacter(k.char, t + p.id * 1.3, mode);
      k.ring.visible = p.id === current;
      if (p.id === current) k.ring.scale.setScalar(1 + Math.sin(t * 5) * 0.08);
      (k.label.material as THREE.SpriteMaterial).opacity = p.connected ? 1 : 0.55;
      const mates = lastPlayers.filter((o) => o.pos === p.pos);
      k.label.position.y = 4.6 + (mates.length > 1 ? mates.findIndex((o) => o.id === p.id) * 1.15 : 0);
    }

    // 카메라 추적
    if (overview) {
      controls.target.lerp(new THREE.Vector3(0, 0, 0), ease(dt, 0.4));
      const d = Math.max(130, n * SPACING * 1.05);
      camera.position.lerp(new THREE.Vector3(0, d * 0.78, d * 0.6), ease(dt, 0.6));
    } else {
      const who = current >= 0 ? current : me;
      const f = toks.get(who);
      const pv = lastPlayers.find((x) => x.id === who);
      if (f && pv) {
        controls.target.lerp(f.cur, ease(dt, 0.25));
        if (now - lastUserMove > 5000) {
          const isl = islands[Math.max(0, Math.min(n - 1, tiles[pv.pos]!.zone - startZone))]!;
          const out = new THREE.Vector3(f.cur.x - isl.center.x, 0, f.cur.z - isl.center.z);
          if (out.lengthSq() < 1e-4) out.set(0, 0, 1);
          out.normalize();
          const side = new THREE.Vector3(-out.z, 0, out.x);
          const desired = f.cur.clone().addScaledVector(out, camDist * 0.85).addScaledVector(side, camDist * 0.4);
          desired.y = f.cur.y + camDist * 0.55;
          camera.position.lerp(desired, ease(dt, 0.8));
        }
      }
    }

    for (let i = floats.length - 1; i >= 0; i--) {
      const fl = floats[i]!;
      const u = (now - fl.t0) / 1800;
      if (u >= 1) {
        scene.remove(fl.s);
        floats.splice(i, 1);
        continue;
      }
      fl.s.position.y = fl.y0 + 4.2 + u * 3;
      (fl.s.material as THREE.SpriteMaterial).opacity = 1 - u * u;
    }
    controls.update();
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);

  return {
    canvas: renderer.domElement,
    update(players, cur, meId) {
      lastPlayers = players;
      current = cur;
      me = meId;
    },
    animateMove(player, path) {
      const t = toks.get(player);
      if (!t || !path.length) return;
      const lifted = (id: number) => pos[id]!.clone().setY(pos[id]!.y + liftOfZone(tiles[id]!.zone));
      t.anim = { pts: [t.cur.clone(), ...path.map(lifted)], t0: performance.now() };
    },
    celebrate(player, text) {
      const t = toks.get(player);
      if (!t) return;
      const s = textSprite(text, '#7a2fd0', 9);
      s.position.set(t.cur.x, t.cur.y + 6.2, t.cur.z);
      scene.add(s);
      floats.push({ s, t0: performance.now(), y0: t.cur.y + 2 });
      t.cheerUntil = performance.now() + 1400;
    },
    floatText(tileId, text) {
      const s = textSprite(text, '#111', 8);
      const p = pos[tileId]!;
      const y = p.y + liftOfZone(tiles[tileId]!.zone);
      s.position.set(p.x, y + 4.2, p.z);
      scene.add(s);
      floats.push({ s, t0: performance.now(), y0: y });
      const owner = [...toks.values()].find((k) => k.cur.distanceTo(new THREE.Vector3(p.x, y, p.z)) < 3);
      if (owner) owner.cheerUntil = performance.now() + 900;
    },
    focus() {
      lastUserMove = -1e9;
      overview = false;
    },
    setOverview(on) {
      overview = on;
      if (!on) lastUserMove = -1e9;
    },
    resize,
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

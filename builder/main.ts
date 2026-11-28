import * as THREE from 'three';

// ───────── 월드 ─────────
const W = 64, D = 64, H = 64, CS = 16;
const vox = new Uint8Array(W * H * D);
const idx = (x: number, y: number, z: number) => x + W * (z + D * y);
const inb = (x: number, y: number, z: number) => x >= 0 && x < W && y >= 0 && y < H && z >= 0 && z < D;
const getV = (x: number, y: number, z: number) => (inb(x, y, z) ? vox[idx(x, y, z)]! : 0);
const key = (x: number, y: number, z: number) => idx(x, y, z);

interface BlockDef { id: number; name: string; color: number; clear?: boolean }
const BLOCKS: BlockDef[] = [
  { id: 1, name: '잔디', color: 0x5aa84a }, { id: 2, name: '흙', color: 0x8a5a34 },
  { id: 3, name: '모래', color: 0xe4d49a }, { id: 4, name: '돌', color: 0x8d9096 },
  { id: 5, name: '나무판자', color: 0xb98a4f }, { id: 6, name: '벽돌', color: 0xb5503c },
  { id: 7, name: '유리', color: 0xbfe6ff, clear: true }, { id: 8, name: '하얀 벽', color: 0xf0eee8 },
  { id: 9, name: '지붕', color: 0x3f5f8f }, { id: 10, name: '눈', color: 0xf4f8ff },
  { id: 11, name: '물', color: 0x3b7fe0, clear: true }, { id: 12, name: '수영장 타일', color: 0x9fd8e8 },
  { id: 13, name: '카펫', color: 0xa84a5e },
];
const BCOLOR: Record<number, THREE.Color> = {};
BLOCKS.forEach((b) => (BCOLOR[b.id] = new THREE.Color(b.color)));
const isClear = (v: number) => v === 7 || v === 11;
const WATER = 11;

// 가구 (한 칸짜리, 회전 가능)
interface FurnDef { id: string; name: string; solid: boolean; sit?: boolean }
const FURN: FurnDef[] = [
  { id: 'sofa', name: '소파', solid: true, sit: true }, { id: 'tv', name: 'TV', solid: true },
  { id: 'bed', name: '침대', solid: true, sit: true }, { id: 'table', name: '식탁', solid: true },
  { id: 'chair', name: '의자', solid: true, sit: true }, { id: 'shelf', name: '책장', solid: true },
  { id: 'fridge', name: '냉장고', solid: true }, { id: 'lamp', name: '조명', solid: false },
  { id: 'plant', name: '화분', solid: false }, { id: 'ladder', name: '사다리', solid: false },
];
interface Furn { type: string; rot: number; on?: boolean }
const furn = new Map<number, Furn>();
const furnGroups = new Map<number, THREE.Object3D>();
const furnDef = (t: string) => FURN.find((f) => f.id === t)!;

// ───────── 지형 생성 ─────────
function hash2(x: number, z: number, s: number) {
  let h = (x * 374761393 + z * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, z: number, s: number) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi, s), b = hash2(xi + 1, zi, s), c = hash2(xi, zi + 1, s), d = hash2(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, z: number, s: number) => vnoise(x / 16, z / 16, s) * 0.6 + vnoise(x / 8, z / 8, s + 7) * 0.3 + vnoise(x / 4, z / 4, s + 13) * 0.1;

type Preset = 'flat' | 'hills' | 'lake' | 'island' | 'snow';
const PRESETS: [Preset, string][] = [['flat', '평지'], ['hills', '언덕'], ['lake', '호수'], ['island', '섬'], ['snow', '설산']];

function generate(preset: Preset, seed: number) {
  vox.fill(0); furn.clear();
  const water = 9;
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const n = fbm(x, z, seed);
    const dx = (x - W / 2) / (W / 2), dz = (z - D / 2) / (D / 2), r = Math.min(1, Math.hypot(dx, dz));
    let h = 10;
    if (preset === 'hills') h = 8 + n * 16;
    else if (preset === 'lake') h = 10 + n * 8 - 9 * Math.exp(-r * r * 6);
    else if (preset === 'island') h = 4 + (1 - r * r) * 10 + n * 5 - 2;
    else if (preset === 'snow') h = 10 + n * 24;
    h = Math.max(3, Math.round(h));
    const sandy = preset !== 'flat' && preset !== 'hills' && preset !== 'snow' && h <= water + 1;
    for (let y = 0; y <= h; y++) {
      let b = 4;
      if (y > h - 4) b = 2;
      if (y === h) b = sandy || h < water ? 3 : preset === 'snow' && h > 20 ? 10 : 1;
      vox[idx(x, y, z)] = b;
    }
    if (preset === 'lake' || preset === 'island') for (let y = h + 1; y <= water; y++) vox[idx(x, y, z)] = WATER;
  }
  dirtyAll();
  const t = topY(W / 2, D / 2);
  return t;
}

const topY = (x: number, z: number) => {
  for (let y = H - 1; y >= 0; y--) if (getV(x, y, z)) return y;
  return 0;
};

// ───────── 렌더 ─────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 50, 130);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 300);
scene.add(new THREE.HemisphereLight(0xffffff, 0x6a6a7a, 1.5));
const sun = new THREE.DirectionalLight(0xfff2d8, 1.8);
sun.position.set(30, 60, 20);
scene.add(sun);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

const matOpaque = new THREE.MeshLambertMaterial({ vertexColors: true });
const matClear = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false });
const FACES = [
  { d: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { d: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { d: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { d: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { d: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { d: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
] as const;

interface Chunk { op?: THREE.Mesh; cl?: THREE.Mesh }
const chunks = new Map<number, Chunk>();
const dirty = new Set<number>();
const CX = W / CS, CY = H / CS, CZ = D / CS;
const ck = (cx: number, cy: number, cz: number) => cx + CX * (cz + CZ * cy);
function dirtyAll() { for (let i = 0; i < CX * CY * CZ; i++) dirty.add(i); }
function markDirty(x: number, y: number, z: number) {
  const cx = (x / CS) | 0, cy = (y / CS) | 0, cz = (z / CS) | 0;
  dirty.add(ck(cx, cy, cz));
  if (x % CS === 0 && cx > 0) dirty.add(ck(cx - 1, cy, cz));
  if (x % CS === CS - 1 && cx < CX - 1) dirty.add(ck(cx + 1, cy, cz));
  if (y % CS === 0 && cy > 0) dirty.add(ck(cx, cy - 1, cz));
  if (y % CS === CS - 1 && cy < CY - 1) dirty.add(ck(cx, cy + 1, cz));
  if (z % CS === 0 && cz > 0) dirty.add(ck(cx, cy, cz - 1));
  if (z % CS === CS - 1 && cz < CZ - 1) dirty.add(ck(cx, cy, cz + 1));
}
function setV(x: number, y: number, z: number, v: number) {
  if (!inb(x, y, z)) return;
  vox[idx(x, y, z)] = v; markDirty(x, y, z);
}

function buildGeo(list: { p: number[]; n: number[]; c: number[]; i: number[] }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(list.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(list.n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(list.c, 3));
  g.setIndex(list.i);
  return g;
}
function rebuildChunk(id: number) {
  const cx = id % CX, cz = ((id / CX) | 0) % CZ, cy = (id / (CX * CZ)) | 0;
  const L = [0, 1].map(() => ({ p: [] as number[], n: [] as number[], c: [] as number[], i: [] as number[] }));
  for (let y = cy * CS; y < cy * CS + CS; y++) for (let z = cz * CS; z < cz * CS + CS; z++) for (let x = cx * CS; x < cx * CS + CS; x++) {
    const v = vox[idx(x, y, z)]!;
    if (!v) continue;
    const clear = isClear(v), l = L[clear ? 1 : 0]!;
    const col = BCOLOR[v]!, nz = 0.92 + hash2(x + y * 3, z - y, 5) * 0.12;
    for (const f of FACES) {
      const nv = getV(x + f.d[0], y + f.d[1], z + f.d[2]);
      if (!(nv === 0 || (isClear(nv) && nv !== v))) continue;
      const base = l.p.length / 3;
      for (const c of f.c) {
        l.p.push(x + c[0], y + c[1], z + c[2]); l.n.push(...f.d);
        l.c.push(col.r * nz, col.g * nz, col.b * nz);
      }
      l.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const old = chunks.get(id) ?? {};
  for (const m of [old.op, old.cl]) if (m) { scene.remove(m); m.geometry.dispose(); }
  const ch: Chunk = {};
  if (L[0]!.i.length) { ch.op = new THREE.Mesh(buildGeo(L[0]!), matOpaque); scene.add(ch.op); }
  if (L[1]!.i.length) { ch.cl = new THREE.Mesh(buildGeo(L[1]!), matClear); ch.cl.renderOrder = 1; scene.add(ch.cl); }
  chunks.set(id, ch);
}

// ───────── 가구 모델 ─────────
const bm = (c: number, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
function box(g: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o;
}
function makeFurn(type: string): THREE.Group {
  const g = new THREE.Group();
  const wood = bm(0x8a5a34), dark = bm(0x25262b);
  if (type === 'sofa') {
    const m = bm(0x4f6fa8);
    box(g, 0.96, 0.35, 0.9, 0, 0.18, 0, m); box(g, 0.96, 0.55, 0.2, 0, 0.55, -0.36, m);
    box(g, 0.14, 0.3, 0.7, -0.41, 0.5, 0.05, bm(0x3d5a8c)); box(g, 0.14, 0.3, 0.7, 0.41, 0.5, 0.05, bm(0x3d5a8c));
  } else if (type === 'tv') {
    box(g, 0.7, 0.3, 0.4, 0, 0.15, 0, wood); box(g, 0.94, 0.58, 0.08, 0, 0.62, 0, dark);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.48), new THREE.MeshBasicMaterial({ color: 0x0b0d12 }));
    s.position.set(0, 0.62, 0.045); s.name = 'screen'; g.add(s);
  } else if (type === 'bed') {
    box(g, 0.98, 0.3, 0.98, 0, 0.15, 0, wood); box(g, 0.9, 0.2, 0.94, 0, 0.4, 0, bm(0xe9e6df));
    box(g, 0.5, 0.1, 0.25, 0, 0.55, -0.3, bm(0x7fb0e0)); box(g, 0.9, 0.12, 0.55, 0, 0.5, 0.2, bm(0xd25a6a));
    box(g, 0.98, 0.7, 0.08, 0, 0.35, -0.47, wood);
  } else if (type === 'table') {
    box(g, 0.98, 0.1, 0.98, 0, 0.8, 0, wood);
    for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]] as const) box(g, 0.1, 0.75, 0.1, x, 0.375, z, wood);
  } else if (type === 'chair') {
    const m = bm(0xc89a5a);
    box(g, 0.6, 0.1, 0.6, 0, 0.45, 0, m); box(g, 0.6, 0.55, 0.1, 0, 0.75, -0.25, m);
    for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]] as const) box(g, 0.07, 0.4, 0.07, x, 0.2, z, m);
  } else if (type === 'shelf') {
    box(g, 0.96, 0.98, 0.4, 0, 0.49, -0.28, wood);
    const cols = [0xd25a4a, 0x4a8ad2, 0x5ab06a, 0xe0b040];
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) box(g, 0.18, 0.22, 0.3, -0.36 + i * 0.24, 0.2 + r * 0.3, -0.05, bm(cols[(i + r) % 4]!));
  } else if (type === 'fridge') {
    box(g, 0.8, 0.98, 0.7, 0, 0.49, 0, bm(0xdfe4ea)); box(g, 0.05, 0.3, 0.05, 0.3, 0.7, 0.38, bm(0x777b82)); box(g, 0.78, 0.02, 0.02, 0, 0.55, 0.36, dark);
  } else if (type === 'lamp') {
    box(g, 0.08, 0.7, 0.08, 0, 0.35, 0, dark); const s = box(g, 0.36, 0.3, 0.36, 0, 0.8, 0, bm(0xf6e6a8, 0x000000)); s.name = 'shade';
  } else if (type === 'plant') {
    box(g, 0.35, 0.3, 0.35, 0, 0.15, 0, bm(0xb5603c));
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), bm(0x3f9a4a)); l.position.y = 0.6; g.add(l);
  } else if (type === 'ladder') {
    box(g, 0.06, 1, 0.06, -0.3, 0.5, -0.45, wood); box(g, 0.06, 1, 0.06, 0.3, 0.5, -0.45, wood);
    for (let i = 0; i < 4; i++) box(g, 0.6, 0.05, 0.05, 0, 0.12 + i * 0.25, -0.45, wood);
  }
  return g;
}
function applyFurnState(k: number) {
  const f = furn.get(k), g = furnGroups.get(k);
  if (!f || !g) return;
  if (f.type === 'tv') g.traverse((o) => { if (o.name === 'screen') ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(f.on ? 0x4fb7ff : 0x0b0d12); });
  if (f.type === 'lamp') g.traverse((o) => { if (o.name === 'shade') (((o as THREE.Mesh).material) as THREE.MeshLambertMaterial).emissive.set(f.on ? 0xffd25a : 0x000000); });
}
function addFurn(x: number, y: number, z: number, type: string, rot: number, on = false) {
  const k = key(x, y, z);
  removeFurn(x, y, z);
  furn.set(k, { type, rot, on });
  const g = makeFurn(type);
  g.position.set(x + 0.5, y, z + 0.5); g.rotation.y = (rot * Math.PI) / 2;
  scene.add(g); furnGroups.set(k, g); applyFurnState(k);
}
function removeFurn(x: number, y: number, z: number) {
  const k = key(x, y, z), g = furnGroups.get(k);
  if (g) { scene.remove(g); furnGroups.delete(k); }
  furn.delete(k);
}
function clearFurnMeshes() { for (const g of furnGroups.values()) scene.remove(g); furnGroups.clear(); }

// ───────── 충돌 / 레이캐스트 ─────────
function solidAt(x: number, y: number, z: number) {
  if (y < 0) return true;
  if (!inb(x, y, z)) return x < 0 || x >= W || z < 0 || z >= D;
  const v = vox[idx(x, y, z)]!;
  if (v && v !== WATER) return true;
  const f = furn.get(key(x, y, z));
  return !!f && furnDef(f.type).solid;
}
interface Hit { x: number; y: number; z: number; n: [number, number, number] }
function raycast(o: THREE.Vector3, d: THREE.Vector3, max = 7): Hit | null {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
  const tdx = sx ? Math.abs(1 / d.x) : Infinity, tdy = sy ? Math.abs(1 / d.y) : Infinity, tdz = sz ? Math.abs(1 / d.z) : Infinity;
  let tx = sx ? ((sx > 0 ? x + 1 - o.x : o.x - x) * tdx) : Infinity;
  let ty = sy ? ((sy > 0 ? y + 1 - o.y : o.y - y) * tdy) : Infinity;
  let tz = sz ? ((sz > 0 ? z + 1 - o.z : o.z - z) * tdz) : Infinity;
  let n: [number, number, number] = [0, 0, 0], t = 0;
  while (t <= max) {
    const v = getV(x, y, z);
    if ((v && v !== WATER) || furn.has(key(x, y, z))) return { x, y, z, n };
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; n = [-sx, 0, 0]; }
    else if (ty < tz) { y += sy; t = ty; ty += tdy; n = [0, -sy, 0]; }
    else { z += sz; t = tz; tz += tdz; n = [0, 0, -sz]; }
  }
  return null;
}

// ───────── 상태 / 도구 ─────────
type Tool = 'block' | 'raise' | 'lower' | 'flatten' | 'pool';
let tool: Tool = 'block';
type Sel = { kind: 'block'; id: number } | { kind: 'furn'; id: string };
let sel: Sel = { kind: 'block', id: 5 };
let rot = 0, brush = 2, live = false, seedNum = 1234, preset: Preset = 'hills';
const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, ground: false, sit: false };
const keys = new Set<string>();

function terrainHeight(x: number, z: number, target: number) {
  if (x < 0 || x >= W || z < 0 || z >= D) return;
  let top = topY(x, z);
  while (top > target && top > 1) { setV(x, top, z, 0); top--; }
  while (top < target && top < H - 2) {
    const m = getV(x, top, z), mat = m === WATER ? 3 : m === 1 ? 1 : m || 2;
    if (m === 1) setV(x, top, z, 2);
    setV(x, top + 1, z, mat === 0 ? 1 : mat); top++;
  }
  const t = getV(x, top, z);
  if (t === 2) setV(x, top, z, 1);
}
function brushCells(cx: number, cz: number) {
  const out: [number, number][] = [];
  for (let dz = -brush; dz <= brush; dz++) for (let dx = -brush; dx <= brush; dx++) if (dx * dx + dz * dz <= brush * brush + 1) out.push([cx + dx, cz + dz]);
  return out;
}
function terrainApply(h: Hit) {
  const cells = brushCells(h.x, h.z);
  if (tool === 'raise') cells.forEach(([x, z]) => x >= 0 && x < W && z >= 0 && z < D && terrainHeight(x, z, topY(x, z) + 1));
  else if (tool === 'lower') cells.forEach(([x, z]) => x >= 0 && x < W && z >= 0 && z < D && terrainHeight(x, z, topY(x, z) - 1));
  else { const t = topY(h.x, h.z); cells.forEach(([x, z]) => terrainHeight(x, z, t)); }
}
function buildPool(h: Hit) {
  const w = rot % 2 ? 4 : 7, d = rot % 2 ? 7 : 4, top = topY(h.x, h.z);
  const x0 = h.x - (w >> 1), z0 = h.z - (d >> 1);
  if (top < 5) return toast('여기엔 수영장을 만들 수 없어요');
  for (let z = z0 - 1; z <= z0 + d; z++) for (let x = x0 - 1; x <= x0 + w; x++) {
    const edge = x < x0 || x >= x0 + w || z < z0 || z >= z0 + d;
    for (let y = top + 1; y < top + 4; y++) { if (getV(x, y, z)) setV(x, y, z, 0); }
    if (edge) { for (let y = top - 3; y <= top; y++) setV(x, y, z, y === top ? 12 : 4); continue; }
    for (let y = top - 2; y <= top; y++) setV(x, y, z, y === top ? 0 : WATER);
    setV(x, top, z, 0); setV(x, top - 1, z, WATER); setV(x, top - 2, z, WATER); setV(x, top - 3, z, 12);
  }
  toast('수영장을 만들었어요! 생활 모드에서 헤엄쳐 보세요 🏊 (R: 방향 바꾸기)');
}

function doPrimary(h: Hit) {
  if (tool === 'raise' || tool === 'lower' || tool === 'flatten') return terrainApply(h);
  if (tool === 'pool') return buildPool(h);
  const k = key(h.x, h.y, h.z);
  if (furn.has(k)) return removeFurn(h.x, h.y, h.z);
  if (getV(h.x, h.y, h.z) && h.y > 0) setV(h.x, h.y, h.z, 0);
}
function doSecondary(h: Hit) {
  if (tool !== 'block') return;
  const x = h.x + h.n[0], y = h.y + h.n[1], z = h.z + h.n[2];
  if (!inb(x, y, z) || (getV(x, y, z) && getV(x, y, z) !== WATER) || furn.has(key(x, y, z))) return;
  if (live && playerOverlaps(x, y, z)) return;
  if (sel.kind === 'block') setV(x, y, z, sel.id); else addFurn(x, y, z, sel.id, rot);
}
function playerOverlaps(x: number, y: number, z: number) {
  const p = player.pos;
  return p.x + 0.3 > x && p.x - 0.3 < x + 1 && p.z + 0.3 > z && p.z - 0.3 < z + 1 && p.y + 1.8 > y && p.y < y + 1;
}
function interact() {
  const h = raycast(camera.position, camDir(), 6);
  if (!h) return;
  const k = key(h.x, h.y, h.z), f = furn.get(k);
  if (!f) return;
  const def = furnDef(f.type);
  if (f.type === 'tv' || f.type === 'lamp') { f.on = !f.on; applyFurnState(k); toast(f.on ? '켰어요' : '껐어요'); }
  else if (def.sit) {
    player.sit = true; player.vel.set(0, 0, 0);
    player.pos.set(h.x + 0.5, h.y + (f.type === 'bed' ? 0.55 : 0.45) - 0.9 + 0.05, h.z + 0.5);
    player.yaw = -f.rot * (Math.PI / 2); toast(`${def.name}에 앉았어요 (움직이면 일어나요)`);
  }
}
const camDir = () => new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));

function setMode(l: boolean) {
  live = l; player.sit = false; player.vel.set(0, 0, 0);
  if (l && tool !== 'block') setTool('block');
  toast(l ? '🏠 생활 모드: 걷고, 앉고, 헤엄쳐요 (건축은 계속 가능)' : '🛠️ 건축 모드: 날아다니며 지어요');
  refreshUI();
}

// ───────── 이동 ─────────
function collides(p: THREE.Vector3) {
  const r = 0.3;
  for (let y = Math.floor(p.y); y <= Math.floor(p.y + 1.79); y++)
    for (let z = Math.floor(p.z - r); z <= Math.floor(p.z + r); z++)
      for (let x = Math.floor(p.x - r); x <= Math.floor(p.x + r); x++) if (solidAt(x, y, z)) return true;
  return false;
}
function update(dt: number) {
  const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  if (player.sit && (f || s)) player.sit = false;
  const up = keys.has('Space'), down = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  let mx = (s * cos - f * sin), mz = (-s * sin - f * cos);
  const len = Math.hypot(mx, mz); if (len > 0) { mx /= len; mz /= len; }
  const p = player.pos;
  if (player.sit) return;
  if (!live) {
    const sp = down ? 0 : 0; void sp;
    const speed = keys.has('ControlLeft') ? 20 : 10;
    p.x += mx * speed * dt; p.z += mz * speed * dt; p.y += ((up ? 1 : 0) - (down ? 1 : 0)) * speed * dt;
    p.x = Math.min(W - 0.5, Math.max(0.5, p.x)); p.z = Math.min(D - 0.5, Math.max(0.5, p.z)); p.y = Math.min(H + 20, Math.max(1, p.y));
    return;
  }
  const inWater = getV(Math.floor(p.x), Math.floor(p.y + 0.9), Math.floor(p.z)) === WATER;
  const onLadder = furn.get(key(Math.floor(p.x), Math.floor(p.y + 0.5), Math.floor(p.z)))?.type === 'ladder';
  const speed = inWater ? 2.6 : keys.has('ControlLeft') ? 8 : 4.6;
  player.vel.x = mx * speed; player.vel.z = mz * speed;
  if (onLadder) player.vel.y = f > 0 || up ? 3.5 : down ? -3.5 : 0;
  else if (inWater) { player.vel.y = Math.max(player.vel.y - 6 * dt, -2.5); if (up) player.vel.y = 3; if (down) player.vel.y = -3; }
  else { player.vel.y -= 26 * dt; if (up && player.ground) player.vel.y = 8.2; }
  if (player.vel.y < -40) player.vel.y = -40;
  // 축별 이동 + 한 칸 오르기(계단)
  for (const ax of ['x', 'z'] as const) {
    const old = p[ax]; p[ax] += player.vel[ax] * dt;
    if (collides(p)) {
      if (player.ground) { p.y += 1; if (collides(p)) { p.y -= 1; p[ax] = old; } }
      else p[ax] = old;
    }
  }
  player.ground = false;
  p.y += player.vel.y * dt;
  if (collides(p)) {
    if (player.vel.y < 0) { p.y = Math.floor(p.y) + 1; player.ground = true; } else p.y = Math.ceil(p.y + 1.8) - 1.8 - 0.001;
    if (collides(p)) p.y = Math.floor(p.y) + 1;
    player.vel.y = 0;
  }
  if (p.y < -10) respawn();
}
function respawn() {
  player.pos.set(W / 2 + 0.5, topY(W / 2, D / 2) + 1.2, D / 2 + 0.5); player.vel.set(0, 0, 0);
}

// ───────── 저장 / 불러오기 ─────────
function save() {
  const rle: number[] = []; let prev = vox[0]!, n = 0;
  for (let i = 0; i < vox.length; i++) { if (vox[i] === prev && n < 65535) n++; else { rle.push(prev, n); prev = vox[i]!; n = 1; } }
  rle.push(prev, n);
  const data = { v: 1, rle, furn: [...furn.entries()], seedNum, preset, pos: [player.pos.x, player.pos.y, player.pos.z] };
  try { localStorage.setItem('raumlife-builder', JSON.stringify(data)); toast('💾 저장했어요'); } catch { toast('저장 실패'); }
}
function load(silent = false) {
  try {
    const raw = localStorage.getItem('raumlife-builder'); if (!raw) { if (!silent) toast('저장된 월드가 없어요'); return false; }
    const d = JSON.parse(raw); let i = 0;
    for (let r = 0; r < d.rle.length; r += 2) for (let k = 0; k < d.rle[r + 1]; k++) vox[i++] = d.rle[r];
    clearFurnMeshes(); furn.clear();
    for (const [k, f] of d.furn as [number, Furn][]) { const x = k % W, z = ((k / W) | 0) % D, y = (k / (W * D)) | 0; addFurn(x, y, z, f.type, f.rot, f.on); }
    seedNum = d.seedNum; preset = d.preset; player.pos.set(d.pos[0], d.pos[1], d.pos[2]);
    dirtyAll(); if (!silent) toast('📂 불러왔어요'); return true;
  } catch { if (!silent) toast('불러오기 실패'); return false; }
}
function newWorld() {
  clearFurnMeshes(); generate(preset, seedNum); respawn(); player.pos.y += 3; toast(`새 땅: ${PRESETS.find((p) => p[0] === preset)![1]} (시드 ${seedNum})`);
}

// ───────── UI ─────────
const $ = (id: string) => document.getElementById(id)!;
let toastT = 0;
function toast(msg: string) { const t = $('toast'); t.textContent = msg; t.style.opacity = '1'; clearTimeout(toastT); toastT = window.setTimeout(() => (t.style.opacity = '0'), 2600); }
function setTool(t: Tool) { tool = t; refreshUI(); }
const TOOLS: [Tool, string][] = [['block', '🧱 블록·가구'], ['raise', '⛰️ 땅 올리기'], ['lower', '🕳️ 땅 내리기'], ['flatten', '➖ 평탄화'], ['pool', '🏊 수영장']];
function refreshUI() {
  const top = $('top'); top.innerHTML = '';
  const mk = (label: string, on: boolean, fn: () => void) => { const b = document.createElement('button'); b.textContent = label; if (on) b.className = 'on'; b.onclick = (e) => { e.stopPropagation(); fn(); }; top.appendChild(b); return b; };
  mk(live ? '🏠 생활 모드' : '🛠️ 건축 모드', true, () => setMode(!live));
  if (!live) TOOLS.forEach(([t, l]) => mk(l, tool === t, () => setTool(t)));
  mk('브러시 ' + brush, false, () => { brush = (brush % 5) + 1; refreshUI(); });
  mk('💾 저장', false, save); mk('📂 불러오기', false, () => load());
  const sel1 = document.createElement('select');
  PRESETS.forEach(([id, n]) => { const o = document.createElement('option'); o.value = id; o.textContent = n; if (id === preset) o.selected = true; sel1.appendChild(o); });
  sel1.onchange = () => { preset = sel1.value as Preset; };
  const inp = document.createElement('input'); inp.value = String(seedNum); inp.title = '시드';
  inp.onchange = () => { seedNum = parseInt(inp.value) || 1; };
  top.append(sel1, inp);
  mk('🌍 새 땅', false, newWorld);
  const side = $('side'); side.innerHTML = '<h4>블록</h4>';
  const addItem = (name: string, color: string, s: Sel) => {
    const b = document.createElement('button'); b.className = 'item' + (sel.kind === s.kind && sel.id === s.id ? ' on' : '');
    b.innerHTML = `<span class="sw" style="background:${color}"></span>${name}`;
    b.onclick = (e) => { e.stopPropagation(); sel = s; if (tool !== 'block') setTool('block'); refreshUI(); }; side.appendChild(b);
  };
  BLOCKS.filter((b) => b.id !== WATER || true).forEach((b) => addItem(b.name, '#' + b.color.toString(16).padStart(6, '0'), { kind: 'block', id: b.id }));
  side.insertAdjacentHTML('beforeend', '<h4>가구</h4>');
  FURN.forEach((f) => addItem(f.name, '#c89a5a', { kind: 'furn', id: f.id }));
}
function hud() {
  const y = Math.floor(player.pos.y);
  $('hud').innerHTML = `높이 ${y}칸 · <b>${Math.floor(y / 4) + 1}층</b><br>위치 ${Math.floor(player.pos.x)}, ${Math.floor(player.pos.z)}<br>${live ? '생활' : '건축'} · 회전 ${rot * 90}°`;
}

// ───────── 입력 ─────────
const canvas = renderer.domElement;
canvas.addEventListener('click', () => { if (!document.pointerLockElement) canvas.requestPointerLock(); });
addEventListener('mousemove', (e) => {
  if (!document.pointerLockElement) return;
  player.yaw -= e.movementX * 0.0023; player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - e.movementY * 0.0023));
});
let hold = -1, holdT = 0;
addEventListener('mousedown', (e) => {
  if (!document.pointerLockElement) return;
  const h = raycast(camera.position, camDir());
  if (!h) return;
  if (e.button === 0) { doPrimary(h); hold = 0; holdT = 0; }
  else if (e.button === 2) doSecondary(h);
});
addEventListener('mouseup', () => (hold = -1));
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyR') { rot = (rot + 1) % 4; }
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyF') setMode(!live);
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'Tab') { e.preventDefault(); }
  const n = parseInt(e.key); if (n >= 1 && n <= BLOCKS.length) { sel = { kind: 'block', id: BLOCKS[n - 1]!.id }; if (tool !== 'block') tool = 'block'; refreshUI(); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
addEventListener('wheel', (e) => {
  const all: Sel[] = [...BLOCKS.map((b) => ({ kind: 'block', id: b.id }) as Sel), ...FURN.map((f) => ({ kind: 'furn', id: f.id }) as Sel)];
  let i = all.findIndex((s) => s.kind === sel.kind && s.id === sel.id);
  i = (i + (e.deltaY > 0 ? 1 : -1) + all.length) % all.length; sel = all[i]!; refreshUI();
});

// ───────── 루프 ─────────
const hl = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x111111 }));
scene.add(hl);
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  update(dt);
  camera.position.set(player.pos.x, player.pos.y + 1.62, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  let n = 0; for (const id of dirty) { rebuildChunk(id); dirty.delete(id); if (++n >= 6) break; }
  const h = document.pointerLockElement || true ? raycast(camera.position, camDir()) : null;
  hl.visible = !!h; if (h) hl.position.set(h.x + 0.5, h.y + 0.5, h.z + 0.5);
  if (hold === 0 && h && tool !== 'block' && tool !== 'pool') { holdT += dt; if (holdT > 0.12) { holdT = 0; doPrimary(h); } }
  const wl = getV(Math.floor(camera.position.x), Math.floor(camera.position.y), Math.floor(camera.position.z)) === WATER;
  (scene.fog as THREE.Fog).color.set(wl ? 0x2a5fa8 : 0x87ceeb); (scene.fog as THREE.Fog).far = wl ? 18 : 130; scene.background = new THREE.Color(wl ? 0x2a5fa8 : 0x87ceeb);
  hud(); renderer.render(scene, camera); requestAnimationFrame(frame);
}

if (!load(true)) { generate(preset, seedNum); respawn(); player.pos.y += 3; }
refreshUI(); requestAnimationFrame(frame);
(window as any).__rl = { vox, furn, player, setMode, addFurn, setV, generate, raycast, buildPool, getV, topY, setTool, interact, camera, rebuildAll: () => { dirtyAll(); } };

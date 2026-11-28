import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ───────── 월드 ─────────
const W = 64, D = 64, H = 64, CS = 16;
const vox = new Uint8Array(W * H * D);
const idx = (x: number, y: number, z: number) => x + W * (z + D * y);
const inb = (x: number, y: number, z: number) => x >= 0 && x < W && y >= 0 && y < H && z >= 0 && z < D;
const getV = (x: number, y: number, z: number) => (inb(x, y, z) ? vox[idx(x, y, z)]! : 0);
const key = (x: number, y: number, z: number) => idx(x, y, z);

interface BlockDef { id: number; name: string; color: number; clear?: boolean }
const BLOCKS: BlockDef[] = [
  { id: 1, name: '잔디', color: 0x86b868 }, { id: 2, name: '흙', color: 0x9b7655 },
  { id: 3, name: '모래', color: 0xe8dcb4 }, { id: 4, name: '돌', color: 0x9a9ea6 },
  { id: 5, name: '나무판자', color: 0xc9a06a }, { id: 6, name: '벽돌', color: 0xc0675a },
  { id: 7, name: '유리', color: 0xcfe9f7, clear: true }, { id: 8, name: '하얀 벽', color: 0xf3f1ec },
  { id: 9, name: '지붕', color: 0x55708f }, { id: 10, name: '눈', color: 0xf4f8ff },
  { id: 11, name: '물', color: 0x4d8fd9, clear: true }, { id: 12, name: '수영장 타일', color: 0xa8dce8 },
  { id: 13, name: '카펫', color: 0xb8707f },
];
const BCOLOR: Record<number, THREE.Color> = {};
BLOCKS.forEach((b) => (BCOLOR[b.id] = new THREE.Color(b.color)));
const isClear = (v: number) => v === 7 || v === 11;
const WATER = 11;

// 가구 카탈로그 (칸 단위 크기 w×d×h, 색·스타일별 변형)
interface FurnDef { id: string; name: string; cat: string; kind: string; w: number; d: number; h: number; solid: boolean; sit: boolean; color: number; color2: number; opt: string }
const FURN: FurnDef[] = [];
const CATS = ['소파', 'TV', '침대', '테이블·수납', '소품'];
function F(cat: string, id: string, name: string, kind: string, w: number, d: number, color: number, o: Partial<FurnDef> = {}) {
  FURN.push({ id, name, cat, kind, w, d, h: 1, solid: true, sit: false, color, color2: 0x7a5a3a, opt: '', ...o });
}
F('소파', 'sofa_beige', '베이지 소파 (2인)', 'sofa', 2, 1, 0xd9c4a1, { sit: true });
F('소파', 'sofa_gray', '회색 소파 (2인)', 'sofa', 2, 1, 0x8b8e95, { sit: true });
F('소파', 'sofa_black', '검은색 소파 (2인)', 'sofa', 2, 1, 0x2c2c32, { sit: true });
F('소파', 'sofa_white', '하얀색 소파 (2인)', 'sofa', 2, 1, 0xf2f0ea, { sit: true });
F('소파', 'sofa_soft', '부드러운 소파 (2인)', 'sofa', 2, 1, 0xecd8d0, { sit: true, opt: 'soft' });
F('소파', 'sofa_plush', '푹신한 소파 (3인)', 'sofa', 3, 1, 0xc9b59a, { sit: true, opt: 'plush' });
F('소파', 'sofa_leather', '갈색 가죽 소파 (3인)', 'sofa', 3, 1, 0x7b4b2f, { sit: true, opt: 'leather' });
F('소파', 'sofa_single', '1인용 소파', 'sofa', 1, 1, 0x7c91b3, { sit: true });
F('TV', 'tv_small', '작은 TV', 'tv', 1, 1, 0x7a5636);
F('TV', 'tv_mid', '중간 TV', 'tv', 1, 1, 0x7a5636);
F('TV', 'tv_big', '큰 TV', 'tv', 2, 1, 0x7a5636, { h: 2 });
F('TV', 'tv_huge', '초대형 TV', 'tv', 3, 1, 0x3b3d44, { h: 2 });
F('침대', 'bed_small', '작은 침대', 'bed', 1, 2, 0x8fb4d9, { sit: true });
F('침대', 'bed_plush', '푹신한 침대', 'bed', 2, 2, 0xe7c9d0, { sit: true, opt: 'plush' });
F('침대', 'bed_queen', '퀸사이즈 침대', 'bed', 2, 2, 0x9aa8c7, { sit: true });
F('침대', 'bed_king', '킹사이즈 침대', 'bed', 3, 2, 0x6f8f7d, { sit: true });
F('침대', 'bed_massage', '안마 침대', 'bed', 2, 2, 0x4a4f63, { sit: true, opt: 'massage' });
F('침대', 'bed_bunk', '2층 침대', 'bed', 1, 2, 0xd8a15a, { sit: true, opt: 'bunk', h: 2 });
F('테이블·수납', 'table_dining', '식탁 (큰)', 'table', 2, 1, 0xb98a5a);
F('테이블·수납', 'table_coffee', '커피 테이블', 'table', 1, 1, 0xd1b58a, { opt: 'low' });
F('테이블·수납', 'desk', '책상', 'table', 2, 1, 0xe3dccb, { opt: 'desk' });
F('테이블·수납', 'chair', '의자', 'chair', 1, 1, 0xc89a5a, { sit: true });
F('테이블·수납', 'shelf', '책장', 'shelf', 1, 1, 0x8a5a34);
F('테이블·수납', 'shelf_wide', '큰 책장', 'shelf', 2, 1, 0x6e4a2c);
F('테이블·수납', 'wardrobe', '옷장', 'wardrobe', 2, 1, 0xefe9de, { h: 2 });
F('테이블·수납', 'fridge', '냉장고', 'fridge', 1, 1, 0xdfe4ea);
F('소품', 'lamp', '스탠드 조명', 'lamp', 1, 1, 0xf6e6a8, { solid: false });
F('소품', 'plant', '화분', 'plant', 1, 1, 0x3f9a4a, { solid: false });
F('소품', 'plant_big', '큰 화분', 'plant', 1, 1, 0x2f8a46, { solid: false, opt: 'big' });
F('소품', 'rug', '러그 (큰)', 'rug', 2, 2, 0xc4796b, { solid: false });
F('소품', 'tub', '욕조', 'tub', 2, 1, 0xf6f8fa);
F('소품', 'ladder', '사다리', 'ladder', 1, 1, 0x8a5a34, { solid: false });
interface Furn { type: string; rot: number; on?: boolean; color?: number }
const furn = new Map<number, Furn>(); // 기준 칸(최소 좌표) → 가구
const owner = new Map<number, number>(); // 점유 칸 → 기준 칸
const furnGroups = new Map<number, THREE.Object3D>();
const furnDef = (t: string) => FURN.find((f) => f.id === t);
const dimsOf = (d: FurnDef, rot: number): [number, number] => (rot % 2 ? [d.d, d.w] : [d.w, d.d]);
function cellsOf(d: FurnDef, rot: number, x: number, y: number, z: number) {
  const [fw, fd] = dimsOf(d, rot), out: [number, number, number][] = [];
  for (let yy = 0; yy < d.h; yy++) for (let zz = 0; zz < fd; zz++) for (let xx = 0; xx < fw; xx++) out.push([x + xx, y + yy, z + zz]);
  return out;
}
const unkey = (k: number): [number, number, number] => [k % W, (k / (W * D)) | 0, ((k / W) | 0) % D];
const furnAt = (k: number) => { const a = owner.get(k); return a === undefined ? undefined : furn.get(a); };

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
  vox.fill(0); clearFurnMeshes();
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
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const skyC = document.createElement('canvas'); skyC.width = 2; skyC.height = 256;
const sky = new THREE.CanvasTexture(skyC); sky.colorSpace = THREE.SRGBColorSpace;
scene.background = sky;
scene.fog = new THREE.Fog(0xd3e7f5, 50, 140);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 300);
const hemi = new THREE.HemisphereLight(0xdcecff, 0x8a8576, 1.25); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d6, 2.2);
sun.position.set(W / 2 + 38, 70, D / 2 + 24); sun.target.position.set(W / 2, 0, D / 2);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 52, bottom: -52, near: 1, far: 180 });
scene.add(sun, sun.target);

// ───────── 낮과 밤 ─────────
let hour = 10, autoTime = false, nightW = 0, dayW = 1, skyHour = -1;
const lampLights = Array.from({ length: 6 }, () => { const l = new THREE.PointLight(0xffd58a, 0, 10, 1.6); scene.add(l); return l; });
const starGeo = new THREE.BufferGeometry();
{ const pts: number[] = []; for (let i = 0; i < 450; i++) { const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u); pts.push(r * Math.cos(t) * 200, Math.abs(u) * 200 * 0.95 + 8, r * Math.sin(t) * 200); } starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); }
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
const stars = new THREE.Points(starGeo, starMat); stars.frustumCulled = false; scene.add(stars);
const hex = (c: number[]) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const SKY = { day: [[111, 176, 230], [191, 220, 242], [238, 245, 250]], dusk: [[70, 80, 150], [240, 150, 110], [255, 205, 150]], night: [[6, 10, 28], [16, 24, 58], [30, 40, 80]] };
function updateTime() {
  const a = ((hour - 6) / 12) * Math.PI, el = Math.sin(a);            // 6시 일출, 12시 정오, 18시 일몰
  const sm = (x: number) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  dayW = sm(el * 4); nightW = sm(-el * 4 + 0.15); const duskW = Math.max(0, 1 - Math.abs(el) * 4);
  const tot = dayW + nightW + duskW || 1, wd = dayW / tot, wn = nightW / tot, wu = duskW / tot;
  const sunUp = el > 0, ang = sunUp ? a : a + Math.PI;
  sun.position.set(W / 2 + Math.cos(ang) * -60, Math.max(10, Math.abs(Math.sin(ang)) * 70 + 6), D / 2 + 26);
  sun.color.setRGB(1, 0.94 - 0.3 * wu, 0.84 - 0.45 * wu);
  if (!sunUp) sun.color.set(0x9db4ff);
  sun.intensity = sunUp ? 2.2 * sm(el * 3) + 0.15 : 0.8 * sm(-el * 3 + 0.2);
  hemi.intensity = 0.5 + 0.8 * dayW + 0.25 * duskW; hemi.color.setRGB(0.86 * wd + 0.55 * wn + 0.9 * wu, 0.93 * wd + 0.62 * wn + 0.75 * wu, 1 * wd + 0.95 * wn + 0.7 * wu);
  hemi.groundColor.setRGB(0.54 * dayW + 0.12, 0.52 * dayW + 0.13, 0.46 * dayW + 0.2);
  renderer.toneMappingExposure = 0.9 + 0.2 * dayW;
  starMat.opacity = Math.max(0, nightW - 0.2) * 1.25;
  if (Math.abs(skyHour - hour) > 0.02) {
    skyHour = hour; const cols = [0, 1, 2].map((i) => [0, 1, 2].map((k) => SKY.day[i]![k]! * wd + SKY.dusk[i]![k]! * wu + SKY.night[i]![k]! * wn));
    const c = skyC.getContext('2d')!, g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, hex(cols[0]!)); g.addColorStop(0.65, hex(cols[1]!)); g.addColorStop(1, hex(cols[2]!)); c.fillStyle = g; c.fillRect(0, 0, 2, 256); sky.needsUpdate = true;
    fogDay.set(hex(cols[1]!));
  }
}
const fogDay = new THREE.Color(0xd3e7f5);
const clock12 = (h: number) => { const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60); return `${hh < 12 ? '오전' : '오후'} ${hh % 12 || 12}:${String(mm).padStart(2, '0')}`; };
function updateLamps() {
  const lamps: { x: number; y: number; z: number; d: number; tv: boolean }[] = [];
  if (nightW > 0.03) for (const [a, f] of furn) if (f.on && (f.type === 'lamp' || f.type.startsWith('tv'))) {
    const D_ = furnDef(f.type)!, [ax, ay, az] = unkey(a), [fw, fd] = dimsOf(D_, f.rot), x = ax + fw / 2, z = az + fd / 2, y = ay + (f.type === 'lamp' ? 1 : 0.8);
    lamps.push({ x, y, z, d: Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z), tv: f.type !== 'lamp' });
  }
  lamps.sort((p, q) => p.d - q.d);
  lampLights.forEach((l, i) => {
    const m = lamps[i];
    if (!m) { l.intensity = 0; return; }
    l.position.set(m.x, m.y, m.z); l.color.set(m.tv ? 0x6fb0ff : 0xffd58a); l.intensity = (m.tv ? 4 : 9) * Math.min(1, nightW * 1.5); l.distance = m.tv ? 8 : 11;
  });
}
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
    const col = BCOLOR[v]!;
    for (const f of FACES) {
      const nv = getV(x + f.d[0], y + f.d[1], z + f.d[2]);
      if (!(nv === 0 || (isClear(nv) && nv !== v))) continue;
      const ai = f.d[0] ? 0 : f.d[1] ? 1 : 2, t1 = (ai + 1) % 3, t2 = (ai + 2) % 3;
      const bx = x + f.d[0], by = y + f.d[1], bz = z + f.d[2], ao: number[] = [];
      for (const c of f.c) {
        const o1 = [0, 0, 0], o2 = [0, 0, 0]; o1[t1] = c[t1] * 2 - 1; o2[t2] = c[t2] * 2 - 1;
        const so = (o: number[]) => { const q = getV(bx + o[0]!, by + o[1]!, bz + o[2]!); return q && !isClear(q) ? 1 : 0; };
        const a = so(o1), b = so(o2), cc = so([o1[0]! + o2[0]!, o1[1]! + o2[1]!, o1[2]! + o2[2]!]);
        ao.push(a && b ? 0 : 3 - (a + b + cc));
      }
      const base = l.p.length / 3;
      f.c.forEach((c, i) => {
        l.p.push(x + c[0], y + c[1], z + c[2]); l.n.push(...f.d);
        const br = clear ? 1 : [0.5, 0.68, 0.84, 1][ao[i]!]!;
        l.c.push(col.r * br, col.g * br, col.b * br);
      });
      if (ao[0]! + ao[2]! >= ao[1]! + ao[3]!) l.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else l.i.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    }
  }
  const old = chunks.get(id) ?? {};
  for (const m of [old.op, old.cl]) if (m) { scene.remove(m); m.geometry.dispose(); }
  const ch: Chunk = {};
  if (L[0]!.i.length) { ch.op = new THREE.Mesh(buildGeo(L[0]!), matOpaque); ch.op.castShadow = ch.op.receiveShadow = true; scene.add(ch.op); }
  if (L[1]!.i.length) { ch.cl = new THREE.Mesh(buildGeo(L[1]!), matClear); ch.cl.renderOrder = 1; ch.cl.receiveShadow = true; scene.add(ch.cl); }
  chunks.set(id, ch);
}

// ───────── 가구 모델 (둥근 모서리, 부드러운 재질) ─────────
const stdm = (c: number, r = 0.85, e = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, emissive: e });
const shade = (c: number, f: number) => new THREE.Color(c).multiplyScalar(f).getHex();
function rb(g: THREE.Group, w: number, h: number, d: number, r: number, x: number, y: number, z: number, m: THREE.Material) {
  const rr = Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  const o = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, rr), m); o.position.set(x, y, z); g.add(o); return o;
}
function mSofa(g: THREE.Group, D_: FurnDef) {
  const w = D_.w, soft = D_.opt === 'soft', plush = D_.opt === 'plush', leather = D_.opt === 'leather';
  const rough = leather ? 0.4 : soft || plush ? 1 : 0.85;
  const m = stdm(D_.color, rough), m2 = stdm(shade(D_.color, 1.08), rough), md = stdm(shade(D_.color, 0.86), rough);
  const W_ = w * 0.96, sh = plush ? 0.4 : 0.3, r = soft || plush ? 0.13 : 0.05, ad = plush ? 0.26 : 0.17, off = 0.04;
  rb(g, W_, sh, 0.9, r, 0, sh / 2 + off, 0, md);
  const cw = (W_ - ad * 2) / w;
  for (let i = 0; i < w; i++) rb(g, cw - 0.02, plush ? 0.22 : 0.15, 0.62, r, -(W_ - 2 * ad) / 2 + cw * (i + 0.5), sh + off + (plush ? 0.08 : 0.05), 0.1, m2);
  rb(g, W_, plush ? 0.7 : 0.55, plush ? 0.3 : 0.2, r, 0, sh + off + (plush ? 0.3 : 0.22), -0.36, m);
  for (const s of [-1, 1]) { const ah = sh + (plush ? 0.28 : 0.2); rb(g, ad, ah, 0.9, r, s * (W_ / 2 - ad / 2), ah / 2 + off, 0, md); }
  if (!plush) for (const x of [-1, 1]) for (const z of [-1, 1]) rb(g, 0.06, 0.05, 0.06, 0.01, x * (W_ / 2 - 0.08), 0.02, z * 0.36, stdm(0x222222));
}
const TVW: Record<string, number> = { tv_small: 0.5, tv_mid: 0.82, tv_big: 1.6, tv_huge: 2.5 };
function mTV(g: THREE.Group, D_: FurnDef) {
  const sw = TVW[D_.id] ?? 0.82, sh = sw * 0.5625, dk = stdm(0x15161a, 0.4);
  rb(g, D_.w * 0.96, 0.3, 0.42, 0.03, 0, 0.17, 0, stdm(D_.color, 0.7));
  const y = 0.32 + sh / 2 + 0.05;
  rb(g, 0.26, 0.08, 0.16, 0.02, 0, 0.35, 0, dk);
  rb(g, sw + 0.05, sh + 0.05, 0.05, 0.015, 0, y, 0, dk);
  const s = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ color: 0x0b0d12 }));
  s.position.set(0, y, 0.027); s.name = 'screen'; g.add(s);
}
function mBed(g: THREE.Group, D_: FurnDef) {
  const w = D_.w, d = D_.d, plush = D_.opt === 'plush', massage = D_.opt === 'massage', bunk = D_.opt === 'bunk';
  const frame = stdm(massage ? 0x2d3040 : D_.color2, 0.7), bed = stdm(0xf3f0ea, 0.95), blk = stdm(D_.color, 0.95), pil = stdm(0xffffff, 0.95);
  const layer = (y0: number) => {
    rb(g, w * 0.98, 0.26, d * 0.98, 0.04, 0, y0 + 0.17, 0, frame);
    const mh = plush ? 0.38 : 0.22, mr = plush ? 0.13 : 0.05, top = y0 + 0.3 + mh;
    rb(g, w * 0.92, mh, d * 0.92, mr, 0, y0 + 0.3 + mh / 2, 0, bed);
    const n = w >= 3 ? 3 : w >= 2 ? 2 : 1;
    for (let i = 0; i < n; i++) rb(g, (w * 0.9) / n - 0.12, plush ? 0.18 : 0.13, 0.3, 0.06, ((i + 0.5) / n - 0.5) * w * 0.9, top + 0.05, -d / 2 + 0.36, pil);
    rb(g, w * 0.94, plush ? 0.2 : 0.11, d * 0.55, plush ? 0.1 : 0.05, 0, top + 0.03, d * 0.17, blk);
    if (!bunk) rb(g, w * 0.98, w >= 3 ? 1.0 : 0.8, 0.08, 0.03, 0, 0.26 + (w >= 3 ? 0.5 : 0.4), -d / 2 + 0.04, frame);
    return top;
  };
  const top = layer(0);
  if (bunk) {
    layer(1.0);
    for (const x of [-1, 1]) for (const z of [-1, 1]) rb(g, 0.07, 1.9, 0.07, 0.02, x * (w / 2 - 0.05), 0.95, z * (d / 2 - 0.05), frame);
    for (let i = 0; i < 5; i++) rb(g, 0.04, 0.04, 0.3, 0.01, -w / 2 + 0.02, 0.25 + i * 0.35, d / 2 - 0.3, frame);
  }
  if (massage) {
    const glow = stdm(0x2a8cff, 0.3, 0x2a8cff);
    rb(g, w * 0.9, 0.04, 0.04, 0.01, 0, 0.05, d / 2 - 0.02, glow);
    for (let i = 0; i < 3; i++) rb(g, w * 0.7, 0.012, 0.05, 0.005, 0, top + 0.115, -d * 0.1 + i * 0.35, stdm(0x7fe6ff, 0.3, 0x39c6e8));
    rb(g, 0.2, 0.12, 0.04, 0.02, w / 2 - 0.25, 0.62, -d / 2 + 0.1, stdm(0x5cff9a, 0.3, 0x2bc26a));
  }
}
function mTable(g: THREE.Group, D_: FurnDef) {
  const wood = stdm(D_.color, 0.7), low = D_.opt === 'low', h = low ? 0.42 : 0.78, tw = D_.w * 0.96, td = D_.d * 0.9;
  rb(g, tw, 0.08, td, 0.02, 0, h, 0, wood);
  for (const x of [-1, 1]) for (const z of [-1, 1]) rb(g, 0.08, h, 0.08, 0.02, x * (tw / 2 - 0.07), h / 2, z * (td / 2 - 0.07), wood);
  if (D_.opt === 'desk') rb(g, 0.5, 0.5, td - 0.1, 0.03, -(tw / 2 - 0.3), 0.5, 0, stdm(shade(D_.color, 0.92)));
}
function mChair(g: THREE.Group, D_: FurnDef) {
  const m = stdm(D_.color, 0.7);
  rb(g, 0.6, 0.1, 0.6, 0.04, 0, 0.45, 0, m); rb(g, 0.6, 0.55, 0.09, 0.04, 0, 0.77, -0.25, m);
  for (const x of [-1, 1]) for (const z of [-1, 1]) rb(g, 0.07, 0.42, 0.07, 0.02, x * 0.24, 0.21, z * 0.24, m);
}
function mShelf(g: THREE.Group, D_: FurnDef) {
  const wood = stdm(D_.color, 0.7), w = D_.w;
  rb(g, w * 0.96, 0.98, 0.4, 0.02, 0, 0.49, -0.28, wood);
  const cols = [0xd25a4a, 0x4a8ad2, 0x5ab06a, 0xe0b040];
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4 * w; i++) rb(g, 0.16, 0.22, 0.3, 0.02, (-w * 0.48) + 0.2 + i * (0.92 * w / (4 * w) + 0.0), 0.2 + r * 0.3, -0.05, stdm(cols[(i + r) % 4]!));
}
function mWardrobe(g: THREE.Group, D_: FurnDef) {
  const m = stdm(D_.color, 0.7);
  rb(g, D_.w * 0.96, 1.96, 0.6, 0.03, 0, 0.98, -0.18, m);
  for (const s of [-1, 1]) { rb(g, 0.04, 0.3, 0.03, 0.01, s * 0.06, 1.0, 0.13, stdm(0xb59a6a)); }
  rb(g, 0.01, 1.8, 0.01, 0, 0, 0.98, 0.125, stdm(0x9c927f));
}
function mFridge(g: THREE.Group) {
  rb(g, 0.8, 0.98, 0.7, 0.05, 0, 0.49, 0, stdm(0xdfe4ea, 0.4)); rb(g, 0.05, 0.3, 0.05, 0.02, 0.3, 0.7, 0.38, stdm(0x777b82)); rb(g, 0.78, 0.02, 0.02, 0, 0, 0.55, 0.36, stdm(0x555a60));
}
function mLamp(g: THREE.Group) {
  const dk = stdm(0x2a2a2e); rb(g, 0.3, 0.04, 0.3, 0.02, 0, 0.02, 0, dk); rb(g, 0.05, 0.8, 0.05, 0.02, 0, 0.42, 0, dk);
  rb(g, 0.38, 0.3, 0.38, 0.12, 0, 0.95, 0, stdm(0xf6e6a8, 0.9, 0x000000)).name = 'shade';
}
function mPlant(g: THREE.Group, D_: FurnDef) {
  const big = D_.opt === 'big', s = big ? 1.5 : 1;
  rb(g, 0.36 * s, 0.3 * s, 0.36 * s, 0.06, 0, 0.15 * s, 0, stdm(0xc0694a));
  for (const [dx, dy, dz, r] of [[0, 0.62, 0, 0.3], [0.14, 0.5, 0.1, 0.2], [-0.12, 0.52, -0.1, 0.2]] as const) {
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), stdm(D_.color, 0.9)); l.position.set(dx * s, dy * s + (big ? 0.2 : 0), dz * s); g.add(l);
  }
}
function mRug(g: THREE.Group, D_: FurnDef) {
  rb(g, D_.w * 0.96, 0.03, D_.d * 0.96, 0.012, 0, 0.016, 0, stdm(D_.color, 1));
  rb(g, D_.w * 0.7, 0.036, D_.d * 0.7, 0.012, 0, 0.018, 0, stdm(shade(D_.color, 1.2), 1));
}
function mTub(g: THREE.Group, D_: FurnDef) {
  rb(g, D_.w * 0.96, 0.55, 0.9, 0.14, 0, 0.28, 0, stdm(D_.color, 0.3));
  rb(g, D_.w * 0.96 - 0.22, 0.04, 0.68, 0.1, 0, 0.5, 0, stdm(0x8fd0ee, 0.2));
}
function mLadder(g: THREE.Group, D_: FurnDef) {
  const m = stdm(D_.color, 0.8);
  rb(g, 0.06, 1, 0.06, 0.02, -0.3, 0.5, -0.45, m); rb(g, 0.06, 1, 0.06, 0.02, 0.3, 0.5, -0.45, m);
  for (let i = 0; i < 4; i++) rb(g, 0.6, 0.05, 0.05, 0.01, 0, 0.12 + i * 0.25, -0.45, m);
}
function makeFurn(D_: FurnDef): THREE.Group {
  const g = new THREE.Group();
  switch (D_.kind) {
    case 'sofa': mSofa(g, D_); break; case 'tv': mTV(g, D_); break; case 'bed': mBed(g, D_); break;
    case 'table': mTable(g, D_); break; case 'chair': mChair(g, D_); break; case 'shelf': mShelf(g, D_); break;
    case 'wardrobe': mWardrobe(g, D_); break; case 'fridge': mFridge(g); break; case 'lamp': mLamp(g); break;
    case 'plant': mPlant(g, D_); break; case 'rug': mRug(g, D_); break; case 'tub': mTub(g, D_); break; case 'ladder': mLadder(g, D_); break;
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = D_.kind !== 'rug'; o.receiveShadow = true; } });
  return g;
}
function applyFurnState(a: number) {
  const f = furn.get(a), g = furnGroups.get(a);
  if (!f || !g) return;
  if (f.type.startsWith('tv')) { const s = g.getObjectByName('screen') as THREE.Mesh; (s.material as THREE.MeshBasicMaterial).color.set(f.on ? 0x2f7fe0 : 0x0b0d12); }
  if (f.type === 'lamp') { const s = g.getObjectByName('shade') as THREE.Mesh; (s.material as THREE.MeshStandardMaterial).emissive.set(f.on ? 0xffd25a : 0x000000); }
}
function addFurn(x: number, y: number, z: number, type: string, rot: number, on = false, color?: number) {
  const D_ = furnDef(type); if (!D_) return;
  const a = key(x, y, z);
  for (const [cx, cy, cz] of cellsOf(D_, rot, x, y, z)) removeFurnAt(key(cx, cy, cz));
  for (const [cx, cy, cz] of cellsOf(D_, rot, x, y, z)) owner.set(key(cx, cy, cz), a);
  furn.set(a, { type, rot, on, ...(color === undefined ? {} : { color }) });
  const [fw, fd] = dimsOf(D_, rot), g = makeFurn(color === undefined ? D_ : { ...D_, color });
  g.position.set(x + fw / 2, y, z + fd / 2); g.rotation.y = (rot * Math.PI) / 2;
  scene.add(g); furnGroups.set(a, g); applyFurnState(a);
}
function removeFurnAt(cell: number) {
  const a = owner.get(cell); if (a === undefined) return;
  const f = furn.get(a)!, D_ = furnDef(f.type)!, [ax, ay, az] = unkey(a);
  for (const [cx, cy, cz] of cellsOf(D_, f.rot, ax, ay, az)) owner.delete(key(cx, cy, cz));
  furn.delete(a);
  const g = furnGroups.get(a); if (g) { scene.remove(g); furnGroups.delete(a); }
}
function clearFurnMeshes() { for (const g of furnGroups.values()) scene.remove(g); furnGroups.clear(); furn.clear(); owner.clear(); }

// ───────── 충돌 / 레이캐스트 ─────────
function solidAt(x: number, y: number, z: number) {
  if (y < 0) return true;
  if (!inb(x, y, z)) return x < 0 || x >= W || z < 0 || z >= D;
  const v = vox[idx(x, y, z)]!;
  if (v && v !== WATER) return true;
  const f = furnAt(key(x, y, z));
  return !!f && furnDef(f.type)!.solid;
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
    if ((v && v !== WATER) || owner.has(key(x, y, z))) return { x, y, z, n };
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; n = [-sx, 0, 0]; }
    else if (ty < tz) { y += sy; t = ty; ty += tdy; n = [0, -sy, 0]; }
    else { z += sz; t = tz; tz += tdz; n = [0, 0, -sz]; }
  }
  return null;
}

// ───────── 상태 / 도구 ─────────
type Tool = 'block' | 'raise' | 'lower' | 'flatten' | 'pool' | 'paint' | 'erase';
let furnColor: number | null = null;
const SWATCHES = [0xf2f0ea, 0xd9c4a1, 0x8b8e95, 0x2c2c32, 0x7b4b2f, 0xc4796b, 0xe7c9d0, 0xd8a15a, 0x6f8f7d, 0x7c91b3, 0x5a6fa8, 0x8a6fb0];
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

function eraseAt(h: Hit) {
  const k = key(h.x, h.y, h.z);
  if (owner.has(k)) { const f = furnAt(k)!; removeFurnAt(k); toast(`${furnDef(f.type)!.name} 지웠어요`); }
  else if (getV(h.x, h.y, h.z) && h.y > 0) setV(h.x, h.y, h.z, 0);
}
function doPrimary(h: Hit) {
  if (tool === 'raise' || tool === 'lower' || tool === 'flatten') return terrainApply(h);
  if (tool === 'pool') return buildPool(h);
  if (tool === 'erase') return eraseAt(h);
  if (tool === 'paint') {
    const a = owner.get(key(h.x, h.y, h.z)), f = a === undefined ? undefined : furn.get(a);
    if (!f || a === undefined) return toast('색을 바꿀 가구를 가리켜 주세요');
    const [ax, ay, az] = unkey(a); addFurn(ax, ay, az, f.type, f.rot, f.on, furnColor ?? undefined);
    return;
  }
  const k = key(h.x, h.y, h.z);
  if (owner.has(k)) return removeFurnAt(k);
  if (getV(h.x, h.y, h.z) && h.y > 0) setV(h.x, h.y, h.z, 0);
}
function placeTarget(h: Hit): [number, number, number] { return [h.x + h.n[0], h.y + h.n[1], h.z + h.n[2]]; }
function canPlaceFurn(D_: FurnDef, r: number, x: number, y: number, z: number) {
  for (const [cx, cy, cz] of cellsOf(D_, r, x, y, z)) {
    if (!inb(cx, cy, cz)) return false;
    const v = getV(cx, cy, cz);
    if ((v && v !== WATER) || owner.has(key(cx, cy, cz))) return false;
    if (live && playerOverlaps(cx, cy, cz)) return false;
  }
  return true;
}
function doSecondary(h: Hit) {
  if (tool !== 'block') return;
  const [x, y, z] = placeTarget(h);
  if (sel.kind === 'block') {
    if (!inb(x, y, z) || (getV(x, y, z) && getV(x, y, z) !== WATER) || owner.has(key(x, y, z))) return;
    if (live && playerOverlaps(x, y, z)) return;
    setV(x, y, z, sel.id);
  } else {
    const D_ = furnDef(sel.id)!;
    if (!canPlaceFurn(D_, rot, x, y, z)) return toast('여기엔 놓을 수 없어요 (자리가 부족해요)');
    addFurn(x, y, z, sel.id, rot, D_.kind === 'lamp', furnColor ?? undefined);
  }
}
function playerOverlaps(x: number, y: number, z: number) {
  const p = player.pos;
  return p.x + 0.3 > x && p.x - 0.3 < x + 1 && p.z + 0.3 > z && p.z - 0.3 < z + 1 && p.y + 1.8 > y && p.y < y + 1;
}
function interact() {
  const h = raycast(camera.position, camDir(), 6);
  if (!h) return;
  const k = key(h.x, h.y, h.z), a = owner.get(k), f = a === undefined ? undefined : furn.get(a);
  if (!f || a === undefined) return;
  const def = furnDef(f.type)!;
  if (f.type.startsWith('tv') || f.type === 'lamp') { f.on = !f.on; applyFurnState(a); toast(f.on ? '켰어요' : '껐어요'); }
  else if (def.sit) {
    player.sit = true; player.vel.set(0, 0, 0);
    const bed = def.kind === 'bed';
    player.pos.set(h.x + 0.5, h.y + (bed ? 0.62 : 0.5) - 1.62 + 0.9, h.z + 0.5);
    player.yaw = Math.PI + f.rot * (Math.PI / 2); player.pitch = 0;
    toast(`${def.name}에 ${bed ? '누웠' : '앉았'}어요 (움직이면 일어나요)`);
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
  const onLadder = furnAt(key(Math.floor(p.x), Math.floor(p.y + 0.5), Math.floor(p.z)))?.type === 'ladder';
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
  const data = { v: 1, hour, rle, furn: [...furn.entries()], seedNum, preset, pos: [player.pos.x, player.pos.y, player.pos.z] };
  try { localStorage.setItem('raumlife-builder', JSON.stringify(data)); toast('💾 저장했어요'); } catch { toast('저장 실패'); }
}
function load(silent = false) {
  try {
    const raw = localStorage.getItem('raumlife-builder'); if (!raw) { if (!silent) toast('저장된 월드가 없어요'); return false; }
    const d = JSON.parse(raw); let i = 0;
    for (let r = 0; r < d.rle.length; r += 2) for (let k = 0; k < d.rle[r + 1]; k++) vox[i++] = d.rle[r];
    clearFurnMeshes();
    for (const [k, f] of d.furn as [number, Furn][]) { const [x, y, z] = unkey(k); addFurn(x, y, z, f.type, f.rot, f.on, f.color); }
    if (typeof d.hour === 'number') hour = d.hour; seedNum = d.seedNum; preset = d.preset; player.pos.set(d.pos[0], d.pos[1], d.pos[2]);
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
const TOOLS: [Tool, string][] = [['block', '🧱 블록·가구'], ['raise', '⛰️ 땅 올리기'], ['lower', '🕳️ 땅 내리기'], ['flatten', '➖ 평탄화'], ['pool', '🏊 수영장'], ['paint', '🎨 가구 색칠'], ['erase', '🗑️ 지우기']];
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
  const ts = document.createElement('input'); ts.type = 'range'; ts.min = '0'; ts.max = '24'; ts.step = '0.1'; ts.value = String(hour); ts.id = 'tslider'; ts.title = '시간';
  ts.style.cssText = 'width:120px;padding:0;vertical-align:middle'; ts.onclick = (e) => e.stopPropagation(); ts.oninput = () => { hour = parseFloat(ts.value); };
  const lab = document.createElement('span'); lab.id = 'tlabel'; lab.style.cssText = 'align-self:center;min-width:66px';
  top.append(document.createTextNode('🕒'), ts, lab);
  mk(autoTime ? '⏸ 시간 흐름' : '▶ 시간 흐름', autoTime, () => { autoTime = !autoTime; refreshUI(); });
  mk('☀️ 낮', false, () => { hour = 12; }); mk('🌙 밤', false, () => { hour = 22; });
  const side = $('side'); side.innerHTML = '<h4>가구 색 (🎨 도구로 칠하기)</h4>';
  const row = document.createElement('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px';
  const sw = (c: number | null) => {
    const b = document.createElement('button'); b.title = c === null ? '기본 색' : '#' + c.toString(16);
    b.style.cssText = `width:24px;height:24px;padding:0;border:2px solid ${furnColor === c ? '#e8a33d' : '#0006'};` + (c === null ? 'background:linear-gradient(135deg,#fff 50%,#444 50%)' : `background:#${c.toString(16).padStart(6, '0')}`);
    b.onclick = (e) => { e.stopPropagation(); furnColor = c; refreshUI(); }; row.appendChild(b);
  };
  sw(null); SWATCHES.forEach(sw);
  const pick = document.createElement('input'); pick.type = 'color'; pick.style.cssText = 'width:24px;height:24px;padding:0;border:0;background:none';
  pick.value = '#' + (furnColor ?? 0xffffff).toString(16).padStart(6, '0'); pick.title = '직접 고르기';
  pick.onclick = (e) => e.stopPropagation(); pick.oninput = () => { furnColor = parseInt(pick.value.slice(1), 16); };
  pick.onchange = () => refreshUI(); row.appendChild(pick); side.appendChild(row);
  side.insertAdjacentHTML('beforeend', '<h4>블록</h4>');
  const addItem = (name: string, color: string, s: Sel) => {
    const b = document.createElement('button'); b.className = 'item' + (sel.kind === s.kind && sel.id === s.id ? ' on' : '');
    b.innerHTML = `<span class="sw" style="background:${color}"></span>${name}`;
    b.onclick = (e) => { e.stopPropagation(); sel = s; if (tool !== 'block') setTool('block'); refreshUI(); }; side.appendChild(b);
  };
  BLOCKS.filter((b) => b.id !== WATER || true).forEach((b) => addItem(b.name, '#' + b.color.toString(16).padStart(6, '0'), { kind: 'block', id: b.id }));
  for (const c of CATS) {
    side.insertAdjacentHTML('beforeend', `<h4>${c}</h4>`);
    FURN.filter((f) => f.cat === c).forEach((f) => addItem(f.name, '#' + f.color.toString(16).padStart(6, '0'), { kind: 'furn', id: f.id }));
  }
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
  if (e.code === 'KeyT') hour = (hour + 3) % 24;
  if ((e.code === 'KeyX' || e.code === 'Delete') && !live) { const h = raycast(camera.position, camDir()); if (h) eraseAt(h); }
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
  hl.visible = !!h;
  if (h) {
    if (tool === 'block' && sel.kind === 'furn') {
      const D_ = furnDef(sel.id)!, [fw, fd] = dimsOf(D_, rot), [tx, ty, tz] = placeTarget(h);
      hl.scale.set(fw, D_.h, fd); hl.position.set(tx + fw / 2, ty + D_.h / 2, tz + fd / 2);
      (hl.material as THREE.LineBasicMaterial).color.set(canPlaceFurn(D_, rot, tx, ty, tz) ? 0x1f9d55 : 0xd23b3b);
    } else { hl.scale.set(1, 1, 1); hl.position.set(h.x + 0.5, h.y + 0.5, h.z + 0.5); (hl.material as THREE.LineBasicMaterial).color.set(0x111111); }
  }
  for (const [a, f] of furn) if (f.on && f.type.startsWith('tv')) { const sc = furnGroups.get(a)?.getObjectByName('screen') as THREE.Mesh | undefined; if (sc) (sc.material as THREE.MeshBasicMaterial).color.setHSL(0.55 + 0.12 * Math.sin(now / 1500), 0.85, 0.42); }
  if (hold === 0 && h && tool !== 'block' && tool !== 'pool' && tool !== 'paint' && tool !== 'erase') { holdT += dt; if (holdT > 0.12) { holdT = 0; doPrimary(h); } }
  if (autoTime) hour = (hour + dt * 0.25) % 24;
  updateTime(); updateLamps(); stars.position.copy(camera.position);
  { const sl = document.getElementById('tslider') as HTMLInputElement | null, lb = document.getElementById('tlabel'); if (sl && autoTime) sl.value = String(hour); if (lb) lb.textContent = clock12(hour); }
  const wl = getV(Math.floor(camera.position.x), Math.floor(camera.position.y), Math.floor(camera.position.z)) === WATER;
  (scene.fog as THREE.Fog).color.copy(wl ? new THREE.Color(0x2a5fa8).multiplyScalar(0.2 + 0.8 * dayW) : fogDay); (scene.fog as THREE.Fog).far = wl ? 18 : 140; scene.background = wl ? new THREE.Color(0x2a5fa8).multiplyScalar(0.2 + 0.8 * dayW) : sky;
  hud(); renderer.render(scene, camera); requestAnimationFrame(frame);
}

if (!load(true)) { generate(preset, seedNum); respawn(); player.pos.y += 3; }
refreshUI(); requestAnimationFrame(frame);
(window as any).__rl = { setHour: (h: number) => { hour = h; }, owner, doPrimary, setFurnColor: (c: number | null) => { furnColor = c; }, vox, furn, player, setMode, addFurn, setV, generate, raycast, buildPool, getV, topY, setTool, interact, camera, rebuildAll: () => { dirtyAll(); } };

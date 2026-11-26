import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Tile, TileType } from '../engine';
import { ZONES } from '../engine';
import { TOKENS, type PlayerView } from '../shared/protocol';
import { TILE_ICON } from './board';

const ZONE_H = 6; // 구간 하나가 올라가는 높이
const R_BASE = 30; // 산자락 반지름
const SHORT_OUT = 3.2; // 지름길(구름다리)이 산 바깥으로 떠 있는 거리
const SHORT_LIFT = 1.4; // 지름길이 떠 있는 높이
const LEDGE = 1.8; // 길이 산 표면보다 바깥에 놓이는 거리

const ZONE_COLORS = [0xf2b8d6, 0x8fcf7a, 0x6cc3d5, 0xb9a98a, 0xe4c46a, 0xa9cf6a, 0xdfe8f2, 0xa7adb9, 0xc9cff0, 0xf6c98a];
const TILE_COLORS: Record<TileType, number> = {
  journey: 0x6faa5a,
  camp: 0xe58a3c,
  path: 0x9b6fd1,
  lodge: 0xd86a6a,
  fork: 0x4a90d9,
  weather: 0x7fb3d5,
  milestone: 0xe6c000,
  summit: 0xffd23f,
};

export interface Board3D {
  update(players: PlayerView[], current: number, me: number): void;
  animateMove(player: number, path: number[]): void;
  floatText(tileId: number, text: string): void;
  focus(tileId: number): void;
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

function textSprite(text: string, color = '#222'): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.font = '700 44px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(255,255,255,.95)';
  g.strokeText(text, 256, 48);
  g.fillStyle = color;
  g.fillText(text, 256, 48);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  s.scale.set(10, 1.9, 1);
  s.renderOrder = 10;
  return s;
}

/** 구간을 한 바퀴씩 감아 올라가는 나선 위의 칸 좌표 */
export function layout3d(tiles: Tile[], startZone: number, endZone: number) {
  const n = endZone - startZone + 1;
  const totalH = n * ZONE_H;
  const radiusAt = (y: number) => R_BASE * (1 - 0.72 * (y / (totalH + ZONE_H)));
  const pos: THREE.Vector3[] = new Array(tiles.length);
  const point = (turn: number, out: number, lift = 0) => {
    const y = turn * ZONE_H;
    const ang = turn * Math.PI * 2;
    const r = radiusAt(y) + out;
    return new THREE.Vector3(Math.cos(ang) * r, y + lift, Math.sin(ang) * r);
  };
  for (let z = startZone; z <= endZone; z++) {
    const idx = z - startZone;
    const zt = tiles.filter((t) => t.zone === z);
    const fork = zt.find((t) => t.type === 'fork')!;
    const longs = zt.filter((t) => t.route === 'long');
    const shorts = zt.filter((t) => t.route === 'short');
    const leadCount = zt.filter((t) => t.id < fork.id).length;
    const cols = zt.length - shorts.length;
    let c = 0;
    for (const t of zt) {
      if (t.route === 'short') continue;
      pos[t.id] = point(idx + c / cols, 0);
      c++;
    }
    const firstLong = leadCount + 1;
    shorts.forEach((t, j) => {
      const f = firstLong - 1 + ((j + 1) * (longs.length + 1)) / (shorts.length + 1);
      pos[t.id] = point(idx + f / cols, SHORT_OUT, SHORT_LIFT);
    });
  }
  return { pos, totalH, radiusAt };
}

export function createBoard3D(container: HTMLElement, tiles: Tile[], startZone: number, endZone: number): Board3D {
  const { pos, totalH, radiusAt } = layout3d(tiles, startZone, endZone);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0xbfe0f5);
  container.append(renderer.domElement);
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfe0f5, 90, 220);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 400);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9a7a, 1.55));
  const sun = new THREE.DirectionalLight(0xfff2d6, 1.5);
  sun.position.set(30, 60, 20);
  scene.add(sun);

  // ── 산: 구간마다 색이 다른 원뿔대를 쌓는다
  const mountain = new THREE.Group();
  const n = endZone - startZone + 1;
  for (let i = 0; i < n; i++) {
    const y0 = i * ZONE_H - ZONE_H * 0.5;
    const y1 = y0 + ZONE_H;
    const geo = new THREE.CylinderGeometry(radiusAt(Math.max(0, y1)) - LEDGE, radiusAt(Math.max(0, y0)) - LEDGE, ZONE_H, 40, 1, false);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: ZONE_COLORS[startZone - 1 + i]!, flatShading: true }));
    mesh.position.y = y0 + ZONE_H / 2;
    mountain.add(mesh);
    const label = textSprite(ZONES[startZone - 1 + i]!.name);
    const ang = (i + 0.0) * Math.PI * 2 + Math.PI * 0.0;
    const r = radiusAt(i * ZONE_H) + 9;
    label.position.set(Math.cos(ang) * r, i * ZONE_H + 3.2, Math.sin(ang) * r);
    mountain.add(label);
  }
  // 정상 봉우리
  const peak = new THREE.Mesh(
    new THREE.ConeGeometry(radiusAt(totalH) - LEDGE + 0.3, ZONE_H * 1.6, 40),
    new THREE.MeshLambertMaterial({ color: 0xf8f8fb, flatShading: true }),
  );
  peak.position.y = totalH - ZONE_H * 0.5 + ZONE_H * 0.8;
  mountain.add(peak);
  scene.add(mountain);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 48), new THREE.MeshLambertMaterial({ color: 0x9cc77d }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -ZONE_H * 0.5 - 0.05;
  scene.add(ground);

  // ── 길
  const roadMat = new THREE.MeshLambertMaterial({ color: 0xd9c9a3 });
  const shortMat = new THREE.MeshLambertMaterial({ color: 0xe0953a });
  const up = new THREE.Vector3(0, 1, 0);
  for (const t of tiles) {
    for (const nx of t.next) {
      const a = pos[t.id]!;
      const b = pos[nx]!;
      const short = tiles[nx]!.route === 'short' || t.route === 'short';
      const len = a.distanceTo(b);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(short ? 0.22 : 0.45, short ? 0.22 : 0.45, len, 6), short ? shortMat : roadMat);
      seg.position.copy(a).add(b).multiplyScalar(0.5);
      seg.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
      scene.add(seg);
    }
  }

  // ── 칸
  const tileTex = new Map<TileType, THREE.CanvasTexture>();
  for (const t of tiles) {
    const p = pos[t.id]!;
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.3, 0.5, 14),
      new THREE.MeshLambertMaterial({ color: t.risky ? 0xe08a2e : TILE_COLORS[t.type] }),
    );
    disc.position.copy(p);
    scene.add(disc);
    if (!tileTex.has(t.type)) tileTex.set(t.type, emojiTexture(TILE_ICON[t.type]));
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tileTex.get(t.type)!, transparent: true }));
    icon.scale.setScalar(t.type === 'summit' ? 2.8 : 1.5);
    icon.position.set(p.x, p.y + (t.type === 'summit' ? 2.4 : 1.35), p.z);
    scene.add(icon);
  }

  // ── 말
  interface Tok {
    group: THREE.Group;
    sprite: THREE.Sprite;
    ring: THREE.Mesh;
    anim: { pts: THREE.Vector3[]; t0: number } | null;
    cur: THREE.Vector3;
  }
  const toks = new Map<number, Tok>();
  const tokTex = new Map<string, THREE.CanvasTexture>();
  let lastPlayers: PlayerView[] = [];
  let current = -1;
  let me = -1;

  function ensureTok(p: PlayerView): Tok {
    let t = toks.get(p.id);
    if (t) return t;
    const emoji = TOKENS.find((x) => x.id === p.token)!.emoji;
    if (!tokTex.has(emoji)) tokTex.set(emoji, emojiTexture(emoji));
    const group = new THREE.Group();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tokTex.get(emoji)!, transparent: true, depthTest: false }));
    sprite.scale.setScalar(p.id === me ? 2.7 : 2.4);
    sprite.position.y = 1.9;
    sprite.renderOrder = 5;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.14, 8, 28), new THREE.MeshBasicMaterial({ color: 0x2f80ed }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.45;
    ring.visible = false;
    group.add(sprite, ring);
    scene.add(group);
    t = { group, sprite, ring, anim: null, cur: pos[p.pos]!.clone() };
    toks.set(p.id, t);
    return t;
  }

  function slotOffset(p: PlayerView): THREE.Vector3 {
    const mates = lastPlayers.filter((o) => o.pos === p.pos);
    if (mates.length < 2) return new THREE.Vector3();
    const k = mates.findIndex((o) => o.id === p.id);
    const ang = (k / mates.length) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(ang) * 1.3, 0, Math.sin(ang) * 1.3);
  }

  // ── 카메라
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 12;
  controls.maxDistance = 120;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.enablePan = false;
  const target = new THREE.Vector3(pos[0]!.x, pos[0]!.y, pos[0]!.z);
  controls.target.copy(target);
  camera.position.set(target.x + 24, target.y + 15, target.z + 12);
  let lastUserMove = -1e9;
  const camDist = 25;
  controls.addEventListener('start', () => (lastUserMove = performance.now()));

  // ── 떠오르는 글자
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
  (window as unknown as { __lh3d?: unknown }).__lh3d = { camera, controls, toks };
  let raf = 0;
  let lastNow = performance.now();
  /** 프레임 속도와 무관한 보간 계수 (tau: 따라잡는 데 걸리는 시간 상수, 초) */
  const ease = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.5, Math.max(0.001, (now - lastNow) / 1000));
    lastNow = now;
    for (const p of lastPlayers) {
      const t = ensureTok(p);
      const base = pos[p.pos]!;
      if (t.anim) {
        const STEP = 300;
        const k = (now - t.anim.t0) / STEP;
        const pts = t.anim.pts;
        if (k >= pts.length - 1) {
          t.anim = null;
        } else {
          const i = Math.max(0, Math.floor(k));
          const f = Math.max(0, k - i);
          t.cur.lerpVectors(pts[i]!, pts[i + 1]!, f);
          t.cur.y += Math.sin(f * Math.PI) * 1.6;
        }
      }
      if (!t.anim) t.cur.lerp(base.clone().add(slotOffset(p)), ease(dt, 0.08));
      t.group.position.copy(t.cur);
      t.ring.visible = p.id === current;
      if (p.id === current) t.ring.scale.setScalar(1 + Math.sin(now / 220) * 0.08);
      (t.sprite.material as THREE.SpriteMaterial).opacity = p.connected ? 1 : 0.6;
    }
    // 카메라: 현재 차례의 말을 따라가며, 항상 산 바깥쪽에서 바라본다 (직접 돌리는 중에는 잠시 멈춤)
    const f = toks.get(current >= 0 ? current : me);
    if (f) {
      controls.target.lerp(f.cur, ease(dt, 0.25));
      if (now - lastUserMove > 5000) {
        // 산의 축을 기준으로 각도·반지름·높이를 따로 보간해서, 항상 산 바깥쪽 궤도를 돈다
        const dAng = Math.atan2(f.cur.z, f.cur.x) + 0.45;
        const dRad = Math.hypot(f.cur.x, f.cur.z) + camDist;
        const dY = f.cur.y + camDist * 0.5;
        const k = ease(dt, 0.7);
        let cAng = Math.atan2(camera.position.z, camera.position.x);
        const diff = Math.atan2(Math.sin(dAng - cAng), Math.cos(dAng - cAng));
        cAng += diff * k;
        const cRad = Math.hypot(camera.position.x, camera.position.z);
        const nr = cRad + (dRad - cRad) * k;
        camera.position.set(Math.cos(cAng) * nr, camera.position.y + (dY - camera.position.y) * k, Math.sin(cAng) * nr);
      }
    }
    // 카메라가 산 안으로 파고들지 않게 밀어낸다
    const cr = Math.hypot(camera.position.x, camera.position.z);
    const minR = radiusAt(Math.max(0, camera.position.y - 6)) + SHORT_OUT + 6;
    if (cr < minR && cr > 1e-3) {
      camera.position.x *= minR / cr;
      camera.position.z *= minR / cr;
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const fl = floats[i]!;
      const t = (now - fl.t0) / 1800;
      if (t >= 1) {
        scene.remove(fl.s);
        floats.splice(i, 1);
        continue;
      }
      fl.s.position.y = fl.y0 + 2.2 + t * 3;
      (fl.s.material as THREE.SpriteMaterial).opacity = 1 - t * t;
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
      const p = lastPlayers.find((x) => x.id === player);
      if (!t || !p || !path.length) return;
      t.anim = { pts: [t.cur.clone(), ...path.map((id) => pos[id]!.clone())], t0: performance.now() };
    },
    floatText(tileId, text) {
      const s = textSprite(text, '#111');
      s.scale.set(7, 1.3, 1);
      const p = pos[tileId]!;
      s.position.set(p.x, p.y + 2.5, p.z);
      scene.add(s);
      floats.push({ s, t0: performance.now(), y0: p.y });
    },
    focus() {
      lastUserMove = -1e9; // 자동 추적으로 복귀
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

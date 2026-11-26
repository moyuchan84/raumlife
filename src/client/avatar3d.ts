import * as THREE from 'three';
import { ACCESSORIES, BOTTOM_COLORS, HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES, type Avatar } from '../shared/avatar';

/** 3단계 명암의 만화풍(toon) 그라디언트 */
let gradient: THREE.DataTexture | null = null;
function toonGradient(): THREE.DataTexture {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}

const matCache = new Map<string, THREE.MeshToonMaterial>();
function toon(color: string): THREE.MeshToonMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
    matCache.set(color, m);
  }
  return m;
}
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x2a1d17, side: THREE.BackSide });
const BLACK = new THREE.MeshBasicMaterial({ color: 0x2a1d17 });
const WHITE = new THREE.MeshBasicMaterial({ color: 0xffffff });
const PINK = new THREE.MeshBasicMaterial({ color: 0xff9aa8, transparent: true, opacity: 0.6 });

// 공유 지오메트리
const G = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
  low: new THREE.SphereGeometry(1, 12, 8),
  cone: new THREE.ConeGeometry(1, 1, 10),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  box: new THREE.BoxGeometry(1, 1, 1),
  capsule: new THREE.CapsuleGeometry(1, 1, 6, 12),
  torus: new THREE.TorusGeometry(1, 0.16, 8, 20),
  disc: new THREE.CircleGeometry(1, 14),
};

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, sx = 1, sy = sx, sz = sx): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  return m;
}
function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}
/** 머리(반지름 1)의 표면 z 좌표 */
const surfZ = (x: number, y: number, r = 1) => Math.sqrt(Math.max(0.0001, r * r - x * x - y * y));

export interface Char3D {
  group: THREE.Group;
  head: THREE.Group;
  body: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
}

function buildFace(a: Avatar, head: THREE.Group) {
  const ey = 0.08;
  const ex = 0.36;
  const eye = (x: number, r = 0.12) => {
    const g = new THREE.Group();
    g.add(mesh(G.low, BLACK, r * 0.9, r * 1.3, r * 0.5));
    g.add(at(mesh(G.low, WHITE, r * 0.32), -r * 0.25, r * 0.4, r * 0.35));
    g.position.set(x, ey, surfZ(x, ey) - 0.03);
    g.lookAt(x * 2, ey * 2, 3);
    return g;
  };
  const arc = (x: number, y: number, r: number, up: boolean) => {
    const t = mesh(G.torus, BLACK, r, r, r * 0.6);
    t.geometry = new THREE.TorusGeometry(1, 0.14, 6, 14, Math.PI);
    t.rotation.z = up ? 0 : Math.PI;
    t.position.set(x, y, surfZ(x, y) + 0.01);
    return t;
  };
  for (const sx of [-1, 1]) {
    const c = new THREE.Mesh(G.disc, PINK);
    c.scale.setScalar(0.17);
    c.scale.y = 0.11;
    const x = sx * 0.58;
    const y = -0.2;
    c.position.set(x, y, surfZ(x, y) + 0.01);
    c.lookAt(x * 2, y * 2, 3);
    head.add(c);
  }
  switch (a.face) {
    case 1: // 윙크
      head.add(eye(-ex), arc(ex, ey + 0.02, 0.13, true), arc(0, -0.28, 0.16, false));
      break;
    case 2: // 쿨
      for (const sx of [-1, 1]) {
        const lid = mesh(G.box, BLACK, 0.26, 0.05, 0.05);
        lid.position.set(sx * ex, ey + 0.07, surfZ(sx * ex, ey) + 0.01);
        head.add(lid, at(mesh(G.low, BLACK, 0.1, 0.07, 0.04), sx * ex, ey - 0.02, surfZ(sx * ex, ey) + 0.01));
      }
      head.add(at(mesh(G.box, BLACK, 0.2, 0.035, 0.04), 0.03, -0.3, surfZ(0, -0.3) + 0.01));
      break;
    case 3: // 깜짝
      head.add(eye(-ex, 0.16), eye(ex, 0.16), at(mesh(G.low, BLACK, 0.09, 0.12, 0.04), 0, -0.34, surfZ(0, -0.34) + 0.01));
      break;
    default: // 방긋
      head.add(eye(-ex), eye(ex), arc(0, -0.27, 0.17, false));
  }
}

function buildHair(a: Avatar, head: THREE.Group) {
  const m = toon(HAIR_COLORS[a.hairColor]!);
  const cap = (r: number, theta: number, rotX = -0.3) => {
    const geo = new THREE.SphereGeometry(r, 24, 14, 0, Math.PI * 2, 0, theta);
    const mm = new THREE.Mesh(geo, m);
    mm.rotation.x = rotX;
    const ol = new THREE.Mesh(geo, OUTLINE);
    ol.scale.setScalar(1.035);
    ol.rotation.x = rotX;
    head.add(mm, ol);
  };
  switch (a.hairStyle) {
    case 1: { // 단발
      cap(1.07, Math.PI * 0.5);
      const back = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.05, 1.15, 22, 1, true, Math.PI * 0.55, Math.PI * 0.9), new THREE.MeshToonMaterial({ color: HAIR_COLORS[a.hairColor]!, gradientMap: toonGradient(), side: THREE.DoubleSide }));
      back.position.set(0, -0.3, 0);
      head.add(back);
      break;
    }
    case 2: // 포니테일
      cap(1.07, Math.PI * 0.5);
      head.add(at(mesh(G.sphere, m, 0.36), 0, 0.55, -0.98), at(mesh(G.capsule, m, 0.22, 0.55, 0.22), 0, -0.1, -1.2));
      break;
    case 3: // 양갈래
      cap(1.07, Math.PI * 0.5);
      for (const sx of [-1, 1]) head.add(at(mesh(G.sphere, m, 0.36), sx * 1.0, 0.2, -0.25), at(mesh(G.capsule, m, 0.2, 0.4, 0.2), sx * 1.08, -0.45, -0.25));
      break;
    case 4: { // 뾰족
      cap(1.07, Math.PI * 0.5);
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * Math.PI * 2;
        const dir = new THREE.Vector3(Math.sin(ang) * 0.6, 0.85, Math.cos(ang) * 0.6 - 0.15).normalize();
        const c = mesh(G.cone, m, 0.22, 0.6, 0.22);
        c.position.copy(dir.clone().multiplyScalar(1.02));
        c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        head.add(c);
      }
      break;
    }
    case 5: // 곱슬
      cap(1.05, Math.PI * 0.46);
      for (let i = 0; i < 11; i++) {
        const ang = (i / 11) * Math.PI * 2;
        const y = 0.45 + (i % 2) * 0.28;
        head.add(at(mesh(G.sphere, m, 0.33), Math.sin(ang) * 0.92, y, Math.cos(ang) * 0.82 - 0.2));
      }
      head.add(at(mesh(G.sphere, m, 0.4), 0, 0.95, -0.1));
      break;
    default: // 짧은 머리
      cap(1.07, Math.PI * 0.5);
  }
}

function buildAccessory(a: Avatar, head: THREE.Group, body: THREE.Group) {
  const name = ACCESSORIES[a.accessory];
  const ey = 0.08;
  const ex = 0.36;
  if (name === '안경') {
    const frame = toon('#2a2a33');
    for (const sx of [-1, 1]) {
      const t = mesh(G.torus, frame, 0.25, 0.25, 0.5);
      t.position.set(sx * ex, ey, surfZ(sx * ex, ey) + 0.04);
      head.add(t);
    }
    head.add(at(mesh(G.box, frame, 0.18, 0.03, 0.03), 0, ey, surfZ(0, ey) + 0.05));
  } else if (name === '선글라스') {
    const dark = new THREE.MeshToonMaterial({ color: 0x15151b, gradientMap: toonGradient() });
    for (const sx of [-1, 1]) head.add(at(mesh(G.low, dark, 0.27, 0.19, 0.08), sx * ex, ey, surfZ(sx * ex, ey) + 0.06));
    head.add(at(mesh(G.box, dark, 0.2, 0.04, 0.04), 0, ey + 0.03, surfZ(0, ey) + 0.07));
  } else if (name === '밀짚모자') {
    const straw = toon('#e8c36a');
    const hat = new THREE.Group();
    hat.add(mesh(G.cyl, straw, 1.55, 0.07, 1.55), at(mesh(G.sphere, straw, 0.88, 0.65, 0.88), 0, 0.02, 0), at(mesh(G.torus, toon('#d9534f'), 0.86, 0.86, 1.2), 0, 0.2, 0));
    hat.children[2]!.rotation.x = Math.PI / 2;
    hat.position.set(0, 0.7, 0);
    hat.rotation.x = -0.12;
    head.add(hat);
  } else if (name === '머리띠') {
    const band = mesh(G.torus, toon('#f06292'), 1.02, 1.02, 1.02);
    band.rotation.x = Math.PI / 2 - 0.35;
    band.position.y = 0.4;
    band.scale.z = 0.6;
    head.add(band, at(mesh(G.sphere, toon('#f06292'), 0.2), 0.62, 0.78, 0.2), at(mesh(G.sphere, toon('#f06292'), 0.2), 0.85, 0.7, 0.05));
  } else if (name === '배낭') {
    const pack = mesh(G.box, toon('#8d5a2b'), 0.95, 1.05, 0.42);
    pack.position.set(0, 0.05, -0.62);
    body.add(pack);
    for (const sx of [-1, 1]) body.add(at(mesh(G.box, toon('#6b4220'), 0.1, 0.8, 0.1), sx * 0.3, 0.15, 0.42));
  }
}

/** 사람 캐릭터(머리가 큰 치비 스타일)를 도형으로 조립한다. 발바닥이 y=0, 키는 약 3.6 */
export function createCharacter(a: Avatar): Char3D {
  const group = new THREE.Group();
  const skin = SKIN_TONES[a.skin]!;
  const topCol = OUTFIT_COLORS[a.topColor]!;
  const botCol = BOTTOM_COLORS[a.bottomColor]!;

  // ── 다리
  const dress = a.top === 2;
  const mkLeg = (sx: number) => {
    const leg = new THREE.Group();
    leg.position.set(sx * 0.28, 0.72, 0);
    const legMesh = mesh(G.capsule, toon(dress ? skin : botCol), 0.2, 0.3, 0.2);
    legMesh.position.y = -0.3;
    const shoe = mesh(G.sphere, toon('#fdfdfd'), 0.25, 0.15, 0.34);
    shoe.position.set(0, -0.6, 0.07);
    leg.add(legMesh, shoe);
    group.add(leg);
    return leg;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  // ── 몸통
  const body = new THREE.Group();
  body.position.y = 1.2;
  const torso = mesh(G.capsule, toon(topCol), 0.5, 0.42, 0.42);
  const torsoLine = mesh(G.capsule, OUTLINE, 0.53, 0.45, 0.45);
  body.add(torso, torsoLine);
  switch (a.top) {
    case 1: // 후드
      body.add(at(mesh(G.torus, toon(topCol), 0.45, 0.45, 0.8), 0, 0.68, -0.15), at(mesh(G.box, toon(topCol), 0.52, 0.24, 0.1), 0, -0.1, 0.42));
      break;
    case 2: // 원피스
      body.add(at(mesh(G.cyl, toon(topCol), 0.62, 0.34, 0.62), 0, -0.52, 0));
      body.children[body.children.length - 1]!.scale.set(0.62, 0.34, 0.62);
      break;
    case 3: // 멜빵바지
      body.add(at(mesh(G.capsule, toon(botCol), 0.52, 0.2, 0.44), 0, -0.3, 0));
      for (const sx of [-1, 1]) body.add(at(mesh(G.box, toon(botCol), 0.1, 0.62, 0.1), sx * 0.28, 0.12, 0.38));
      break;
    case 4: // 재킷
      body.add(at(mesh(G.box, toon('#ffffff'), 0.09, 0.8, 0.06), 0, 0, 0.44), at(mesh(G.torus, toon(topCol), 0.32, 0.32, 0.6), 0, 0.5, 0.04));
      break;
  }
  group.add(body);

  // ── 팔
  const mkArm = (sx: number) => {
    const arm = new THREE.Group();
    arm.position.set(sx * 0.68, 0.42, 0);
    const a1 = mesh(G.capsule, toon(topCol), 0.16, 0.2, 0.16);
    a1.position.y = -0.28;
    const hand = mesh(G.sphere, toon(skin), 0.17);
    hand.position.y = -0.62;
    arm.add(a1, hand);
    body.add(arm);
    return arm;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  // ── 머리
  const head = new THREE.Group();
  head.position.y = 2.55;
  const skull = mesh(G.sphere, toon(skin), 1);
  const skullLine = mesh(G.sphere, OUTLINE, 1.04);
  head.add(skull, skullLine);
  for (const sx of [-1, 1]) head.add(at(mesh(G.sphere, toon(skin), 0.17), sx * 0.98, 0.0, 0.05));
  buildFace(a, head);
  buildHair(a, head);
  buildAccessory(a, head, body);
  group.add(head);

  return { group, head, body, armL, armR, legL, legR };
}

export type CharMode = 'idle' | 'walk' | 'cheer';

/** 매 프레임 호출: 숨쉬기/걷기/만세 동작 */
export function animateCharacter(c: Char3D, t: number, mode: CharMode) {
  const sw = mode === 'walk' ? Math.sin(t * 14) : 0;
  c.armL.rotation.set(mode === 'cheer' ? 0 : sw * 0.9, 0, mode === 'cheer' ? 2.7 + Math.sin(t * 10) * 0.15 : 0.12 + Math.sin(t * 1.7) * 0.03);
  c.armR.rotation.set(mode === 'cheer' ? 0 : -sw * 0.9, 0, mode === 'cheer' ? -2.7 - Math.sin(t * 10) * 0.15 : -0.12 - Math.sin(t * 1.7 + 1) * 0.03);
  c.legL.rotation.x = -sw * 0.8;
  c.legR.rotation.x = sw * 0.8;
  c.body.scale.y = 1 + Math.sin(t * 2.2) * 0.02;
  c.head.rotation.z = Math.sin(t * 1.4) * 0.05;
  c.head.rotation.x = mode === 'walk' ? 0.08 : 0;
}

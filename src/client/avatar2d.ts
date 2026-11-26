import { ACCESSORIES, BOTTOM_COLORS, HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES, ageLook, grayHair, type AgeLook, type Avatar } from '../shared/avatar';

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** 얼굴 표정 (눈·볼터치·입). cx,cy = 머리 중심, r = 머리 반지름 */
export function drawFace(ctx: CanvasRenderingContext2D, face: number, cx: number, cy: number, r: number, eyeScale = 1) {
  ctx.save();
  ctx.fillStyle = '#ff9aa8';
  ctx.globalAlpha = 0.55;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + sx * r * 0.55, cy + r * 0.22, r * 0.17, r * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#2a1d17';
  ctx.strokeStyle = '#2a1d17';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, r * 0.07);
  const ey = cy + r * 0.02;
  const ex = r * 0.36;
  const eyeR = r * 0.1 * eyeScale;
  const dot = (x: number, y: number, rr = eyeR) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rr, rr * 1.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x - rr * 0.3, y - rr * 0.45, rr * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a1d17';
  };
  const arcEye = (x: number) => {
    ctx.beginPath();
    ctx.arc(x, ey + eyeR * 0.5, eyeR * 1.2, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  };
  const mouthSmile = () => {
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.3, r * 0.17, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  };
  switch (face) {
    case 1: // 윙크
      dot(cx - ex, ey);
      arcEye(cx + ex);
      mouthSmile();
      break;
    case 2: // 쿨
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + sx * ex - eyeR * 1.3, ey + eyeR * 0.3);
        ctx.lineTo(cx + sx * ex + eyeR * 1.3, ey + eyeR * 0.3);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + sx * ex, ey + eyeR * 0.5, eyeR * 0.75, 0, Math.PI);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.13, cy + r * 0.34);
      ctx.lineTo(cx + r * 0.16, cy + r * 0.3);
      ctx.stroke();
      break;
    case 3: // 깜짝
      dot(cx - ex, ey, eyeR * 1.3);
      dot(cx + ex, ey, eyeR * 1.3);
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.36, r * 0.09, r * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    default: // 방긋
      dot(cx - ex, ey);
      dot(cx + ex, ey);
      mouthSmile();
  }
  ctx.restore();
}

function hairBack(ctx: CanvasRenderingContext2D, a: Avatar, cx: number, cy: number, r: number, look: AgeLook) {
  const c = grayHair(HAIR_COLORS[a.hairColor]!, look.gray);
  ctx.fillStyle = c;
  const circle = (x: number, y: number, rr: number) => {
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();
  };
  switch (a.hairStyle) {
    case 1: // 단발
      ctx.beginPath();
      ctx.roundRect(cx - r * 1.12, cy - r * 0.6, r * 2.24, r * 1.7, r * 0.7);
      ctx.fill();
      break;
    case 2: // 포니테일
      circle(cx + r * 0.92, cy - r * 0.35, r * 0.4);
      ctx.beginPath();
      ctx.ellipse(cx + r * 1.12, cy + r * 0.2, r * 0.26, r * 0.62, -0.25, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 3: // 양갈래
      for (const sx of [-1, 1]) {
        circle(cx + sx * r * 1.0, cy + r * 0.05, r * 0.4);
        ctx.beginPath();
        ctx.ellipse(cx + sx * r * 1.05, cy + r * 0.55, r * 0.24, r * 0.5, sx * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 5: // 곱슬
      for (let i = 0; i < 9; i++) {
        const ang = Math.PI * (1 + i / 8);
        circle(cx + Math.cos(ang) * r * 1.0, cy + Math.sin(ang) * r * 0.95 + r * 0.1, r * 0.34);
      }
      break;
  }
}

function hairFront(ctx: CanvasRenderingContext2D, a: Avatar, cx: number, cy: number, r: number, look: AgeLook) {
  const c = grayHair(HAIR_COLORS[a.hairColor]!, look.gray);
  ctx.fillStyle = c;
  // 윗머리
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.03, Math.PI * 1.02, Math.PI * 1.98);
  ctx.closePath();
  ctx.fill();
  if (a.hairStyle === 4) {
    for (let i = 0; i < 6; i++) {
      const ang = Math.PI * (1.1 + (0.8 * i) / 5);
      const bx = cx + Math.cos(ang) * r * 0.9;
      const by = cy + Math.sin(ang) * r * 0.9;
      ctx.beginPath();
      ctx.moveTo(bx - r * 0.17, by);
      ctx.lineTo(cx + Math.cos(ang) * r * 1.42, cy + Math.sin(ang) * r * 1.42);
      ctx.lineTo(bx + r * 0.17, by);
      ctx.fill();
    }
  }
  // 앞머리
  ctx.beginPath();
  ctx.moveTo(cx - r * 1.0, cy - r * 0.15);
  ctx.quadraticCurveTo(cx - r * 0.55, cy - r * 0.55, cx - r * 0.1, cy - r * 0.18);
  ctx.quadraticCurveTo(cx + r * 0.3, cy - r * 0.55, cx + r * 1.0, cy - r * 0.15);
  ctx.lineTo(cx + r * 1.0, cy - r * 0.6);
  ctx.lineTo(cx - r * 1.0, cy - r * 0.6);
  ctx.closePath();
  ctx.fill();
}

function body(ctx: CanvasRenderingContext2D, a: Avatar, cx: number, cy: number, r: number, look: AgeLook) {
  const col = OUTFIT_COLORS[a.topColor]!;
  const bot = BOTTOM_COLORS[a.bottomColor]!;
  const top = cy + r * 0.88;
  const w = r * 1.55 * Math.min(1, 0.7 + look.scale * 0.35);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, top, w, r * 1.3, r * 0.45);
  ctx.fill();
  ctx.fillStyle = shade(col, 0.82);
  switch (a.top) {
    case 1: // 후드
      ctx.beginPath();
      ctx.arc(cx, top + r * 0.05, r * 0.62, 0, Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(cx - r * 0.45, top + r * 0.65, r * 0.9, r * 0.4, r * 0.15);
      ctx.fill();
      break;
    case 2: // 원피스
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.5, top + r * 0.7);
      ctx.lineTo(cx + w * 0.5, top + r * 0.7);
      ctx.lineTo(cx + w * 0.7, top + r * 1.3);
      ctx.lineTo(cx - w * 0.7, top + r * 1.3);
      ctx.fill();
      break;
    case 3: // 멜빵바지
      ctx.fillStyle = bot;
      ctx.beginPath();
      ctx.roundRect(cx - w * 0.5, top + r * 0.55, w, r * 0.75, r * 0.3);
      ctx.fill();
      ctx.fillRect(cx - w * 0.32, top, r * 0.16, r * 0.7);
      ctx.fillRect(cx + w * 0.32 - r * 0.16, top, r * 0.16, r * 0.7);
      break;
    case 4: // 재킷
      ctx.fillStyle = '#ffffffcc';
      ctx.fillRect(cx - r * 0.05, top + r * 0.1, r * 0.1, r * 1.1);
      break;
  }
  // 목
  ctx.fillStyle = SKIN_TONES[a.skin]!;
  ctx.beginPath();
  ctx.ellipse(cx, top + r * 0.02, r * 0.25, r * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
}

function accessory(ctx: CanvasRenderingContext2D, a: Avatar, cx: number, cy: number, r: number) {
  const name = ACCESSORIES[a.accessory];
  ctx.save();
  ctx.lineCap = 'round';
  if (name === '안경') {
    ctx.strokeStyle = '#2a2a33';
    ctx.lineWidth = Math.max(1.5, r * 0.07);
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + sx * r * 0.36, cy + r * 0.04, r * 0.24, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.12, cy + r * 0.02);
    ctx.lineTo(cx + r * 0.12, cy + r * 0.02);
    ctx.stroke();
  } else if (name === '선글라스') {
    ctx.fillStyle = '#17171d';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(cx + sx * r * 0.36 - r * 0.26, cy - r * 0.12, r * 0.52, r * 0.34, r * 0.12);
      ctx.fill();
    }
    ctx.fillRect(cx - r * 0.1, cy - r * 0.04, r * 0.2, r * 0.06);
  } else if (name === '밀짚모자') {
    ctx.fillStyle = '#e8c36a';
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.5, r * 1.5, r * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.55, r * 0.78, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#d9534f';
    ctx.fillRect(cx - r * 0.78, cy - r * 0.62, r * 1.56, r * 0.14);
  } else if (name === '머리띠') {
    ctx.strokeStyle = '#f06292';
    ctx.lineWidth = r * 0.17;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.98, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
    ctx.fillStyle = '#f06292';
    ctx.beginPath();
    ctx.arc(cx + r * 0.62, cy - r * 0.72, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (name === '배낭') {
    ctx.strokeStyle = '#8d5a2b';
    ctx.lineWidth = r * 0.14;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + sx * r * 0.45, cy + r * 0.95);
      ctx.lineTo(cx + sx * r * 0.45, cy + r * 1.9);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 주름: 이마, 눈가, 입가 */
function wrinkles(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, level: number) {
  if (!level) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(90,60,40,.45)';
  ctx.lineWidth = Math.max(1, r * 0.035);
  ctx.lineCap = 'round';
  // 이마 주름
  for (let i = 0; i < level + 1; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy - r * (0.5 - i * 0.1) + r * 0.55, r * 0.5, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  }
  // 눈가 잔주름
  for (const sx of [-1, 1]) {
    for (let k = 0; k < level; k++) {
      ctx.beginPath();
      ctx.moveTo(cx + sx * r * 0.62, cy + r * (0.0 + k * 0.09));
      ctx.lineTo(cx + sx * r * 0.8, cy + r * (-0.02 + k * 0.12));
      ctx.stroke();
    }
    if (level > 1) {
      ctx.beginPath();
      ctx.arc(cx + sx * r * 0.34, cy + r * 0.38, r * 0.2, sx > 0 ? Math.PI * 0.1 : Math.PI * 0.6, sx > 0 ? Math.PI * 0.4 : Math.PI * 0.9);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 상반신 캐릭터를 그린다. (cx, cy) = 머리 중심, r = 머리 반지름, stage = 나이 단계(1~10) */
export function drawAvatar(ctx: CanvasRenderingContext2D, a: Avatar, cx: number, cy: number, r: number, stage = 5) {
  const look = ageLook(stage);
  ctx.save();
  // 어릴수록 머리가 크고 몸이 작아 보이게, 노년은 약간 앞으로 숙인다
  const hr = r;
  const cyy = cy + look.hunch * r * 0.9;
  hairBack(ctx, a, cx, cyy, hr, look);
  body(ctx, a, cx, cy + r * (look.head - 1) * 0.2, hr, look);
  ctx.fillStyle = SKIN_TONES[a.skin]!;
  ctx.strokeStyle = shade(SKIN_TONES[a.skin]!, 0.8);
  ctx.lineWidth = Math.max(1, hr * 0.04);
  ctx.beginPath();
  ctx.arc(cx, cyy, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  for (const sx of [-1, 1]) {
    ctx.fillStyle = SKIN_TONES[a.skin]!;
    ctx.beginPath();
    ctx.arc(cx + sx * hr * 0.98, cyy + hr * 0.12, hr * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }
  drawFace(ctx, a.face, cx, cyy, hr, look.eye);
  wrinkles(ctx, cx, cyy, hr, look.wrinkles);
  hairFront(ctx, a, cx, cyy, hr, look);
  accessory(ctx, a, cx, cyy, hr);
  ctx.restore();
}

const cache = new Map<string, string>();
/** 아바타 이미지(data URL). 목록·로비 등 DOM 에서 <img> 로 쓴다 */
export function avatarImage(a: Avatar, size = 64, stage = 5): string {
  const key = `${size}:${stage}:${JSON.stringify(a)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const dpr = 2;
  const c = document.createElement('canvas');
  c.width = c.height = size * dpr;
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const r = size * 0.3;
  // 어릴수록 머리가 크게, 노년은 조금 작게 보이도록 반지름을 조절한다
  drawAvatar(ctx, a, size / 2, size * 0.4, r * ageLook(stage).head, stage);
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

const imgCache = new Map<string, HTMLImageElement>();
/** 캔버스에 그릴 수 있는 이미지 요소 (로드가 끝나면 complete) */
export function avatarImageEl(a: Avatar, size = 64, stage = 5): HTMLImageElement {
  const key = `${size}:${stage}:${JSON.stringify(a)}`;
  let img = imgCache.get(key);
  if (!img) {
    img = new Image();
    img.src = avatarImage(a, size, stage);
    imgCache.set(key, img);
  }
  return img;
}

import type { Mood, Scene, SceneBg } from '../engine';
import { ageLook, type Avatar } from '../shared/avatar';
import { drawAvatar } from './avatar2d';

/** 카드 장면 그림: 배경 + 소품(이모지) + 그 나이의 내 캐릭터(상황에 맞는 표정) + 주변 사람 */

type Painter = (c: CanvasRenderingContext2D, W: number, H: number) => void;

const grad = (c: CanvasRenderingContext2D, W: number, H: number, top: string, bottom: string, y0 = 0, y1 = H) => {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  c.fillStyle = g;
  c.fillRect(0, y0, W, y1 - y0);
};
const rect = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) => {
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
};
const circ = (c: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) => {
  c.fillStyle = col;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
};
const tree = (c: CanvasRenderingContext2D, x: number, y: number, s: number, col = '#4fae5a') => {
  rect(c, x - s * 0.08, y - s * 0.35, s * 0.16, s * 0.45, '#8a5a33');
  circ(c, x, y - s * 0.55, s * 0.36, col);
  circ(c, x - s * 0.2, y - s * 0.4, s * 0.26, col);
  circ(c, x + s * 0.2, y - s * 0.4, s * 0.26, col);
};
const sun = (c: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  circ(c, x, y, r * 1.5, 'rgba(255,230,120,.35)');
  circ(c, x, y, r, '#ffd84a');
};
const window_ = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, sky = '#bfe6f7') => {
  rect(c, x - 4, y - 4, w + 8, h + 8, '#fff');
  rect(c, x, y, w, h, sky);
  rect(c, x + w / 2 - 1.5, y, 3, h, '#fff');
  rect(c, x, y + h / 2 - 1.5, w, 3, '#fff');
};

const BG: Record<SceneBg, Painter> = {
  home: (c, W, H) => {
    rect(c, 0, 0, W, H, '#f6e7cf');
    rect(c, 0, H * 0.72, W, H * 0.28, '#cfa879');
    window_(c, W * 0.06, H * 0.12, W * 0.2, H * 0.3);
    rect(c, W * 0.52, H * 0.14, W * 0.16, H * 0.2, '#e9c89b');
    rect(c, W * 0.535, H * 0.16, W * 0.13, H * 0.16, '#8fc7a7');
    rect(c, W * 0.72, H * 0.5, W * 0.26, H * 0.24, '#b9825a');
  },
  night: (c, W, H) => {
    rect(c, 0, 0, W, H, '#1f2a4d');
    rect(c, 0, H * 0.74, W, H * 0.26, '#35406b');
    window_(c, W * 0.06, H * 0.12, W * 0.22, H * 0.32, '#0f1738');
    circ(c, W * 0.2, H * 0.24, H * 0.07, '#fff3b0');
    for (let i = 0; i < 14; i++) circ(c, ((i * 53) % 97) / 100 * W, ((i * 31) % 60) / 100 * H, 1.6, '#ffffffaa');
    rect(c, W * 0.62, H * 0.52, W * 0.34, H * 0.24, '#5560a0');
    rect(c, W * 0.62, H * 0.46, W * 0.1, H * 0.08, '#e6e9ff');
  },
  school: (c, W, H) => {
    rect(c, 0, 0, W, H, '#e8efe0');
    rect(c, 0, H * 0.74, W, H * 0.26, '#d3b88c');
    rect(c, W * 0.1, H * 0.1, W * 0.62, H * 0.38, '#2f6b4f');
    rect(c, W * 0.1, H * 0.48, W * 0.62, 5, '#c9a35a');
    c.fillStyle = '#ffffffcc';
    c.font = `${H * 0.09}px sans-serif`;
    c.fillText('1 + 1 = ?', W * 0.16, H * 0.3);
    rect(c, W * 0.76, H * 0.56, W * 0.2, H * 0.1, '#b98a5a');
    rect(c, W * 0.8, H * 0.66, 4, H * 0.12, '#8a6a40');
  },
  playground: (c, W, H) => {
    grad(c, W, H, '#bfe6f7', '#e8f6ff', 0, H * 0.7);
    rect(c, 0, H * 0.7, W, H * 0.3, '#8ccf6a');
    sun(c, W * 0.86, H * 0.18, H * 0.07);
    tree(c, W * 0.9, H * 0.78, H * 0.5);
    c.fillStyle = '#ff7a59';
    c.beginPath();
    c.moveTo(W * 0.55, H * 0.72);
    c.lineTo(W * 0.74, H * 0.34);
    c.lineTo(W * 0.78, H * 0.38);
    c.lineTo(W * 0.64, H * 0.72);
    c.fill();
  },
  street: (c, W, H) => {
    grad(c, W, H, '#cfe8f7', '#f3f9fd', 0, H * 0.7);
    const cols = ['#c9d6e8', '#e8cfc0', '#d4e0c8', '#e0d1ea'];
    for (let i = 0; i < 6; i++) {
      const bw = W * 0.18;
      const bh = H * (0.3 + ((i * 37) % 30) / 100);
      rect(c, i * W * 0.17, H * 0.72 - bh, bw, bh, cols[i % 4]!);
      for (let j = 0; j < 3; j++) rect(c, i * W * 0.17 + 6, H * 0.72 - bh + 8 + j * 16, 9, 9, '#fff9c4');
    }
    rect(c, 0, H * 0.72, W, H * 0.28, '#6b7380');
    for (let i = 0; i < 6; i++) rect(c, i * W * 0.18 + 8, H * 0.86, W * 0.08, 4, '#f3f3f3');
  },
  office: (c, W, H) => {
    rect(c, 0, 0, W, H, '#e6ebf2');
    rect(c, 0, H * 0.74, W, H * 0.26, '#9aa7b8');
    window_(c, W * 0.06, H * 0.1, W * 0.26, H * 0.34);
    rect(c, W * 0.5, H * 0.52, W * 0.46, H * 0.08, '#b9825a');
    rect(c, W * 0.56, H * 0.3, W * 0.14, H * 0.2, '#37474f');
    rect(c, W * 0.58, H * 0.32, W * 0.1, H * 0.15, '#7fd0ff');
    rect(c, W * 0.6, H * 0.5, W * 0.06, H * 0.04, '#37474f');
  },
  hospital: (c, W, H) => {
    rect(c, 0, 0, W, H, '#f4fbff');
    rect(c, 0, H * 0.74, W, H * 0.26, '#dfe9ee');
    rect(c, W * 0.07, H * 0.12, H * 0.2, H * 0.2, '#fff');
    rect(c, W * 0.07 + H * 0.07, H * 0.14, H * 0.06, H * 0.16, '#e8483f');
    rect(c, W * 0.07 + H * 0.02, H * 0.19, H * 0.16, H * 0.06, '#e8483f');
    rect(c, W * 0.56, H * 0.5, W * 0.4, H * 0.12, '#cfe0ea');
    rect(c, W * 0.56, H * 0.44, W * 0.1, H * 0.08, '#fff');
  },
  beach: (c, W, H) => {
    grad(c, W, H, '#bfe6f7', '#9ad3ee', 0, H * 0.5);
    rect(c, 0, H * 0.5, W, H * 0.22, '#3fa9d6');
    c.fillStyle = '#ffffff88';
    for (let i = 0; i < 5; i++) c.fillRect(((i * 61) % 90) / 100 * W, H * (0.54 + (i % 3) * 0.05), W * 0.1, 3);
    rect(c, 0, H * 0.72, W, H * 0.28, '#f1dca4');
    sun(c, W * 0.84, H * 0.2, H * 0.08);
  },
  park: (c, W, H) => {
    grad(c, W, H, '#bfe6f7', '#e8f6ff', 0, H * 0.66);
    rect(c, 0, H * 0.66, W, H * 0.34, '#8ccf6a');
    tree(c, W * 0.1, H * 0.74, H * 0.6);
    tree(c, W * 0.92, H * 0.72, H * 0.5, '#3f9b4a');
    rect(c, W * 0.38, H * 0.8, W * 0.26, H * 0.2, '#e9d6a8');
    sun(c, W * 0.7, H * 0.16, H * 0.06);
  },
  kitchen: (c, W, H) => {
    rect(c, 0, 0, W, H, '#fff1d6');
    rect(c, 0, H * 0.74, W, H * 0.26, '#d9b98a');
    rect(c, W * 0.5, H * 0.48, W * 0.48, H * 0.28, '#e7d7bd');
    rect(c, W * 0.5, H * 0.44, W * 0.48, H * 0.05, '#fff');
    window_(c, W * 0.07, H * 0.12, W * 0.2, H * 0.28);
    circ(c, W * 0.64, H * 0.3, H * 0.07, '#c0c5cc');
  },
  market: (c, W, H) => {
    rect(c, 0, 0, W, H, '#fdf3e0');
    for (let i = 0; i < 8; i++) rect(c, i * W * 0.125, H * 0.08, W * 0.0625, H * 0.18, i % 2 ? '#ffffff' : '#e8483f');
    rect(c, 0, H * 0.72, W, H * 0.28, '#d8c9a8');
    rect(c, W * 0.55, H * 0.5, W * 0.4, H * 0.24, '#c9955a');
  },
  stage: (c, W, H) => {
    rect(c, 0, 0, W, H, '#3a1220');
    rect(c, 0, H * 0.76, W, H * 0.24, '#b9824a');
    rect(c, 0, 0, W * 0.16, H * 0.8, '#b3202f');
    rect(c, W * 0.84, 0, W * 0.16, H * 0.8, '#b3202f');
    c.fillStyle = 'rgba(255,240,170,.28)';
    c.beginPath();
    c.moveTo(W * 0.45, 0);
    c.lineTo(W * 0.2, H * 0.78);
    c.lineTo(W * 0.7, H * 0.78);
    c.lineTo(W * 0.55, 0);
    c.fill();
  },
  campus: (c, W, H) => {
    grad(c, W, H, '#bfe6f7', '#e8f6ff', 0, H * 0.7);
    rect(c, W * 0.3, H * 0.18, W * 0.5, H * 0.52, '#d8c8b0');
    rect(c, W * 0.26, H * 0.14, W * 0.58, H * 0.06, '#8a6a5a');
    for (let i = 0; i < 4; i++) rect(c, W * 0.33 + i * W * 0.12, H * 0.28, W * 0.05, H * 0.42, '#f3eadb');
    rect(c, 0, H * 0.7, W, H * 0.3, '#8ccf6a');
    tree(c, W * 0.1, H * 0.76, H * 0.5);
  },
  bank: (c, W, H) => {
    rect(c, 0, 0, W, H, '#eef0f3');
    rect(c, 0, H * 0.74, W, H * 0.26, '#c9cfd8');
    for (let i = 0; i < 4; i++) rect(c, W * 0.06 + i * W * 0.1, H * 0.12, W * 0.04, H * 0.62, '#fff');
    rect(c, W * 0.5, H * 0.5, W * 0.46, H * 0.24, '#a07a4a');
    rect(c, W * 0.56, H * 0.34, W * 0.12, H * 0.14, '#37474f');
  },
  mountain: (c, W, H) => {
    grad(c, W, H, '#bfe6f7', '#e8f6ff', 0, H * 0.7);
    c.fillStyle = '#8fa6b8';
    c.beginPath();
    c.moveTo(0, H * 0.72);
    c.lineTo(W * 0.28, H * 0.22);
    c.lineTo(W * 0.52, H * 0.72);
    c.fill();
    c.fillStyle = '#a9bdcc';
    c.beginPath();
    c.moveTo(W * 0.38, H * 0.72);
    c.lineTo(W * 0.68, H * 0.3);
    c.lineTo(W, H * 0.72);
    c.fill();
    rect(c, 0, H * 0.72, W, H * 0.28, '#6fb36a');
    tree(c, W * 0.9, H * 0.82, H * 0.5, '#3f9b4a');
  },
  farm: (c, W, H) => {
    grad(c, W, H, '#bfe6f7', '#f3f9fd', 0, H * 0.55);
    rect(c, 0, H * 0.55, W, H * 0.45, '#9ad06a');
    for (let i = 0; i < 6; i++) rect(c, 0, H * 0.6 + i * H * 0.07, W, H * 0.03, '#7fb85a');
    rect(c, W * 0.66, H * 0.3, W * 0.26, H * 0.3, '#c0392b');
    c.fillStyle = '#8a2a20';
    c.beginPath();
    c.moveTo(W * 0.64, H * 0.3);
    c.lineTo(W * 0.79, H * 0.16);
    c.lineTo(W * 0.94, H * 0.3);
    c.fill();
    sun(c, W * 0.14, H * 0.18, H * 0.06);
  },
};

function graphemes(s: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return [...new Seg('ko', { granularity: 'grapheme' }).segment(s)].map((x) => x.segment);
  return Array.from(s);
}

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

export interface SceneOptions {
  /** 캐릭터 표정을 장면의 기분 대신 바꾼다 (결과 화면용) */
  mood?: Mood;
  width?: number;
  height?: number;
}

/** 카드 장면을 캔버스에 그린다 */
export function drawScene(canvas: HTMLCanvasElement, scene: Scene, avatar: Avatar, stage: number, opts: SceneOptions = {}) {
  const W = opts.width ?? 340;
  const H = opts.height ?? 190;
  const dpr = 2;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const c = canvas.getContext('2d')!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  (BG[scene.bg] ?? BG.home)(c, W, H);

  // 소품: 이모지를 장면에 흩어 놓는다
  const spots = [
    [0.66, 0.4, 0.3],
    [0.84, 0.64, 0.2],
    [0.52, 0.8, 0.17],
    [0.13, 0.28, 0.17],
  ] as const;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  graphemes(scene.props).slice(0, 4).forEach((e, i) => {
    const [x, y, s] = spots[i]!;
    c.font = `${H * s}px ${EMOJI_FONT}`;
    c.fillText(e, W * x, H * y);
  });
  // 주변 사람
  graphemes(scene.others ?? '').slice(0, 3).forEach((e, i, arr) => {
    c.font = `${H * 0.3}px ${EMOJI_FONT}`;
    c.fillText(e, W * (0.8 - (arr.length - 1 - i) * 0.1), H * 0.78);
  });
  // 내 캐릭터 (그 나이의 모습, 상황에 맞는 표정)
  const look = ageLook(stage);
  const r = H * 0.19 * look.head;
  const cx = W * 0.3;
  const cy = H * 0.5;
  c.fillStyle = 'rgba(0,0,0,.12)';
  c.beginPath();
  c.ellipse(cx, H * 0.95, r * 1.5, r * 0.22, 0, 0, Math.PI * 2);
  c.fill();
  drawAvatar(c, avatar, cx, cy, r, stage, opts.mood ?? scene.mood);
  // 아프거나 슬프면 말풍선 이모지
  const bubble = { sick: '🤒', sad: '💧', tired: '💤', surprised: '❗', happy: '✨', neutral: '' }[opts.mood ?? scene.mood];
  if (bubble) {
    c.font = `${H * 0.17}px ${EMOJI_FONT}`;
    c.fillText(bubble, cx + r * 1.2, cy - r * 1.2);
  }
}

/** 장면 그림 요소 (DOM 에 넣을 때) */
export function sceneCanvas(scene: Scene, avatar: Avatar, stage: number, opts: SceneOptions = {}): HTMLCanvasElement {
  const el = document.createElement('canvas');
  el.className = 'scene';
  drawScene(el, scene, avatar, stage, opts);
  return el;
}

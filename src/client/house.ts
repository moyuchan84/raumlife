import {
  BUILD_EXTRAS,
  BUILD_SIZES,
  HOUSE_COLORS,
  HOUSE_STYLES,
  quote,
  type HouseAnswer,
  type HouseOffer,
} from '../engine';
import { fmtEffect, h } from './dom';

/** 집 그림 (미리보기). style/color/size/extras 로 모양이 정해진다 */
export interface HouseLook {
  style: number;
  color: number;
  size: 1 | 2 | 3;
  extras: string[];
  villa?: boolean;
}

const WALLS = ['#b07a45', '#f3f1ec', '#dcc29a', '#b9553d', '#cfae72', '#fbfbfb'];

export function drawHouse(canvas: HTMLCanvasElement, look: HouseLook) {
  const dpr = 2;
  const W = 220;
  const H = 150;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  // 하늘과 땅
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#bfe6f7');
  sky.addColorStop(1, '#eaf7ee');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = look.extras.includes('pool') ? '#8cd18a' : '#9fd46b';
  ctx.fillRect(0, 112, W, H - 112);

  const roofCol = HOUSE_COLORS[look.color] ?? '#d86a6a';
  const wall = WALLS[look.style] ?? '#eee';
  const scale = { 1: 0.8, 2: 1.05, 3: 1.35 }[look.size];
  const w = 78 * scale;
  const hh = 46 * scale;
  const cx = look.extras.includes('pool') ? 92 : 110;
  const x0 = cx - w / 2;
  const y1 = 112;
  const y0 = y1 - hh;

  // 벽
  ctx.fillStyle = wall;
  ctx.fillRect(x0, y0, w, hh);
  ctx.strokeStyle = 'rgba(0,0,0,.25)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0, y0, w, hh);
  if (look.style === 0) {
    ctx.strokeStyle = 'rgba(70,40,15,.45)';
    for (let y = y0 + 8; y < y1; y += 8) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + w, y);
      ctx.stroke();
    }
  } else if (look.style === 3) {
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    for (let y = y0 + 7; y < y1; y += 7) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + w, y);
      ctx.stroke();
    }
  }
  // 지붕
  ctx.fillStyle = roofCol;
  ctx.beginPath();
  if (look.style === 1) {
    ctx.fillStyle = '#4a4f57';
    ctx.fillRect(x0 - 6, y0 - 8, w + 12, 9);
  } else if (look.style === 5) {
    ctx.fillStyle = roofCol;
    ctx.ellipse(cx, y0, w * 0.46, hh * 0.62, 0, Math.PI, 0);
    ctx.fill();
  } else if (look.style === 2) {
    ctx.moveTo(x0 - 14, y0 + 2);
    ctx.quadraticCurveTo(x0 + 4, y0 - 6, cx, y0 - 30 * scale);
    ctx.quadraticCurveTo(x0 + w - 4, y0 - 6, x0 + w + 14, y0 + 2);
    ctx.closePath();
    ctx.fillStyle = '#4b4f58';
    ctx.fill();
  } else {
    ctx.moveTo(x0 - 8, y0 + 1);
    ctx.lineTo(cx, y0 - (look.style === 4 ? 40 : 34) * scale);
    ctx.lineTo(x0 + w + 8, y0 + 1);
    ctx.closePath();
    ctx.fillStyle = look.style === 4 ? '#e8c35a' : look.style === 3 ? '#6b7078' : roofCol;
    ctx.fill();
  }
  // 문과 창
  ctx.fillStyle = roofCol;
  ctx.fillRect(cx - 7, y1 - 24 * scale, 14, 24 * scale);
  ctx.fillStyle = '#bfe6f7';
  for (const sx of [-1, 1]) ctx.fillRect(cx + sx * w * 0.3 - 7, y0 + hh * 0.25, 14, 14 * scale);
  // 옵션
  if (look.extras.includes('attic')) {
    ctx.fillStyle = wall;
    ctx.fillRect(cx - 9, y0 - 22 * scale, 18, 12);
    ctx.fillStyle = '#bfe6f7';
    ctx.fillRect(cx - 5, y0 - 19 * scale, 10, 7);
  }
  if (look.extras.includes('solar')) {
    ctx.fillStyle = '#26365a';
    ctx.fillRect(cx + 6, y0 - 22 * scale, 20, 12);
    ctx.strokeStyle = '#6a86c9';
    ctx.strokeRect(cx + 6, y0 - 22 * scale, 20, 12);
  }
  if (look.extras.includes('garden')) {
    for (let i = 0; i < 6; i++) {
      const gx = x0 - 8 + i * ((w + 16) / 5);
      ctx.fillStyle = '#3f9b4a';
      ctx.beginPath();
      ctx.arc(gx, y1 + 3, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ['#ff7a90', '#ffd24a', '#ffffff'][i % 3]!;
      ctx.beginPath();
      ctx.arc(gx, y1 - 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (look.extras.includes('pool')) {
    ctx.fillStyle = '#5ec0e8';
    ctx.fillRect(cx + w / 2 + 8, y1 - 2, 50, 20);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx + w / 2 + 8, y1 - 2, 50, 20);
  }
  if (look.villa) {
    ctx.font = '22px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
    ctx.fillText('🌴', 10, 118);
    ctx.fillText('🌴', W - 34, 118);
  }
}

function preview(look: HouseLook): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.className = 'hpreview';
  drawHouse(c, look);
  return c;
}

type Tab = 'ready' | 'build' | 'villa';

/** 부동산 화면: 원래 있는 집 사기 / 직접 짓기 / 별장. onAnswer(null) 은 사지 않음 */
export function buildHouseAsk(offer: HouseOffer, onlyHome: boolean, onAnswer: (a: HouseAnswer | null) => void): HTMLElement {
  const tabs: Tab[] = [];
  if (offer.canBuyHome) tabs.push('ready', 'build');
  if (offer.canBuyVilla) tabs.push('villa');
  let tab: Tab = tabs[0] ?? 'ready';
  // 직접 짓기 상태
  const b = { size: 2 as 1 | 2 | 3, style: 0, color: 3, extras: [] as string[] };

  const root = h('div', { class: 'house' });
  const draw = () => {
    const sub = offer.hasHome
      ? `이미 사는 집이 있어요${offer.hasVilla ? '. 별장도 있어요' : ''}.${offer.canBuyVilla ? ' 돈이 많아서 별장을 살 수 있어요 (사는 집은 그대로예요).' : ''}`
      : onlyHome
        ? '집을 마련해요. 원래 있는 집을 사거나, 직접 지을 수 있어요.'
        : '집을 사거나 직접 지어요. 돈이 많으면 별장도 살 수 있어요.';
    root.replaceChildren(
      h('h4', null, '🏘️ 부동산'),
      h('div', { class: 'sub' }, `${sub} 가진 돈 💰${offer.asset}`),
      h('div', { class: 'chips', style: { marginBottom: '8px' } },
        ...tabs.map((t) => h('button', { class: `chip small ${tab === t ? 'on' : ''}`, onclick: () => { tab = t; draw(); } }, { ready: '원래 있는 집 사기', build: '✏️ 직접 짓기', villa: '🏝️ 별장 사기' }[t])),
        h('button', { class: 'chip small', onclick: () => onAnswer(null) }, '사지 않는다')),
      tab === 'ready' ? readyPanel() : tab === 'build' ? buildPanel() : villaPanel(),
    );
  };

  const card = (look: HouseLook, title: string, price: number, desc: string, effect: string, affordable: boolean, action: () => void) =>
    h('div', { class: 'hcard' },
      preview(look),
      h('div', { class: 'hname' }, title),
      h('div', { class: 'muted', style: { fontSize: '12.5px' } }, desc),
      h('div', { style: { fontSize: '13px' } }, effect),
      h('button', { class: 'primary small', disabled: !affordable, onclick: action }, affordable ? `💰${price}에 사기` : `💰${price} 필요`));

  const readyPanel = () =>
    h('div', { class: 'hgrid' }, offer.ready.map((r) =>
      card({ style: r.style, color: r.color, size: r.size, extras: [] }, r.name, r.price, r.desc, fmtEffect({ asset: -r.price, happy: r.happy, stamina: 1 }) + ' · 이정표마다 💰+1', r.affordable, () => onAnswer({ kind: 'ready', id: r.id }))));

  const villaPanel = () =>
    h('div', { class: 'hgrid' }, offer.villas.map((v) =>
      card({ style: v.style, color: v.color, size: 3, extras: [], villa: true }, v.name, v.price, v.desc, fmtEffect({ asset: -v.price, happy: v.happy, stamina: 2 }) + ' · 이정표마다 ❤️+1 💪+1', v.affordable, () => onAnswer({ kind: 'villa', id: v.id }))));

  const buildPanel = () => {
    const ans: HouseAnswer = { kind: 'custom', size: b.size, style: b.style, color: b.color, extras: b.extras };
    const q = quote(ans)!;
    const total = q.spec.price;
    const ok = offer.asset >= total;
    return h('div', { class: 'hbuild' },
      h('div', { class: 'hleft' }, preview({ style: b.style, color: b.color, size: b.size, extras: b.extras }),
        h('div', { class: 'hname' }, q.spec.name),
        h('div', { style: { fontSize: '13px' } }, fmtEffect({ ...q.effect, asset: -total })),
        h('button', { class: 'primary', disabled: !ok, onclick: () => onAnswer(ans) }, ok ? `💰${total}에 짓는다` : `💰${total} 필요 (부족해요)`)),
      h('div', { class: 'hright' },
        h('div', { class: 'crow' }, h('span', { class: 'clabel' }, '규모'),
          h('div', { class: 'chips' }, BUILD_SIZES.map((s) => h('button', { class: `chip small ${b.size === s.size ? 'on' : ''}`, onclick: () => { b.size = s.size; draw(); } }, `${s.name} 💰${s.price}`)))),
        h('div', { class: 'crow' }, h('span', { class: 'clabel' }, '스타일'),
          h('div', { class: 'chips' }, HOUSE_STYLES.map((n, i) => h('button', { class: `chip small ${b.style === i ? 'on' : ''}`, onclick: () => { b.style = i; draw(); } }, n)))),
        h('div', { class: 'crow' }, h('span', { class: 'clabel' }, '색'),
          h('div', { class: 'swatches' }, HOUSE_COLORS.map((c, i) => h('button', { class: `sw ${b.color === i ? 'on' : ''}`, style: { background: c }, onclick: () => { b.color = i; draw(); } })))),
        h('div', { class: 'crow' }, h('span', { class: 'clabel' }, '옵션'),
          h('div', { class: 'chips' }, BUILD_EXTRAS.map((e) => {
            const on = b.extras.includes(e.id);
            return h('button', { class: `chip small ${on ? 'on' : ''}`, title: e.desc, onclick: () => { b.extras = on ? b.extras.filter((x) => x !== e.id) : [...b.extras, e.id]; draw(); } }, `${e.name} 💰${e.price}`);
          }))),
        h('div', { class: 'muted', style: { fontSize: '12.5px' } }, BUILD_EXTRAS.map((e) => `${e.name}: ${e.desc}`).join(' · '))),
    );
  };

  draw();
  return root;
}

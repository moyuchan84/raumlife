import type { Effect } from '../engine';

type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown>;

/** 아주 작은 DOM 헬퍼. 문자열은 항상 텍스트로 들어가므로 이름 등 사용자 입력이 안전하다. */
export function h(tag: string, attrs: Attrs | null = null, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'disabled' || k === 'checked' || k === 'selected') (el as unknown as Record<string, unknown>)[k] = !!v;
      else if (k === 'value') (el as HTMLInputElement).value = String(v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const STAT_ICON = { asset: '💰', happy: '❤️', network: '🤝', growth: '🌱' } as const;

/** 효과를 "💰+1 ❤️+2 💪-1 ✨+1" 형태로 */
export function fmtEffect(e: Effect): string {
  const parts: string[] = [];
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  for (const k of ['asset', 'happy', 'network', 'growth'] as const) if (e[k]) parts.push(`${STAT_ICON[k]}${sign(e[k]!)}`);
  if (e.stamina) parts.push(`💪${sign(e.stamina)}`);
  if (e.cp) parts.push(`✨${sign(e.cp)}`);
  return parts.length ? parts.join(' ') : '변화 없음';
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function clear(el: HTMLElement) {
  el.replaceChildren();
}

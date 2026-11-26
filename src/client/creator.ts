import {
  ACCESSORIES,
  BOTTOM_COLORS,
  FACES,
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFIT_COLORS,
  SKIN_TONES,
  TOPS,
  randomAvatar,
  type Avatar,
} from '../shared/avatar';
import { avatarImage } from './avatar2d';
import { h } from './dom';

/**
 * 캐릭터 만들기 패널. 바꿀 때마다 onChange 로 새 아바타를 알린다.
 * 패널 자신이 미리보기까지 다시 그린다 (바깥 화면을 다시 만들지 않는다).
 */
export function createCreator(initial: Avatar, onChange: (a: Avatar) => void): HTMLElement {
  let a: Avatar = { ...initial };
  const root = h('div', { class: 'creator' });

  const set = (patch: Partial<Avatar>) => {
    a = { ...a, ...patch };
    onChange(a);
    draw();
  };

  const swatches = (label: string, colors: readonly string[], key: keyof Avatar) =>
    h('div', { class: 'crow' },
      h('span', { class: 'clabel' }, label),
      h('div', { class: 'swatches' }, colors.map((c, i) =>
        h('button', { class: `sw ${a[key] === i ? 'on' : ''}`, style: { background: c }, title: `${label} ${i + 1}`, onclick: () => set({ [key]: i } as Partial<Avatar>) }))));

  const chips = (label: string, names: readonly string[], key: keyof Avatar) =>
    h('div', { class: 'crow' },
      h('span', { class: 'clabel' }, label),
      h('div', { class: 'chips' }, names.map((n, i) =>
        h('button', { class: `chip small ${a[key] === i ? 'on' : ''}`, onclick: () => set({ [key]: i } as Partial<Avatar>) }, n))));

  function draw() {
    root.replaceChildren(
      h('div', { class: 'cpreview' },
        h('img', { src: avatarImage(a, 180), width: 180, height: 180, alt: '내 캐릭터' }),
        h('button', { onclick: () => set(randomAvatar(Math.random)) }, '🎲 랜덤')),
      h('div', { class: 'cparts' },
        swatches('피부', SKIN_TONES, 'skin'),
        chips('머리 모양', HAIR_STYLES, 'hairStyle'),
        swatches('머리 색', HAIR_COLORS, 'hairColor'),
        chips('옷', TOPS, 'top'),
        swatches('옷 색', OUTFIT_COLORS, 'topColor'),
        swatches('바지 색', BOTTOM_COLORS, 'bottomColor'),
        chips('액세서리', ACCESSORIES, 'accessory'),
        chips('표정', FACES, 'face')),
    );
  }
  draw();
  return root;
}

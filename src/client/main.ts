import type { GameEvent, GameResult, StatKey } from '../engine';
import { ZONES } from '../engine';
import {
  BOT_KINDS,
  type Ask,
  type ClientMsg,
  type LobbyState,
  type RoomSettings,
  type ServerMsg,
  type StartedInfo,
  type StateView,
} from '../shared/protocol';
import { clear, fmtEffect, h, lifeText, pct } from './dom';
import { draw, layoutBoard, tileIcon, TILE_NAME, type Layout, type Pt } from './board';
import { Net } from './net';
import { LocalNet } from './local';
import { DEFAULT_AVATAR, SEAT_COLORS, sanitizeAvatar, type Avatar } from '../shared/avatar';
import { avatarImage } from './avatar2d';
import { createCreator } from './creator';
import { createBoard3D, type Board3D } from './board3d';
import { buildHouseAsk } from './house';

// ───────── 앱 상태 ─────────
const store = {
  get(k: string): string {
    try {
      return localStorage.getItem(k) ?? '';
    } catch {
      return '';
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* 저장소를 못 쓰는 환경 */
    }
  },
};

function loadAvatar(): Avatar {
  try {
    return sanitizeAvatar(JSON.parse(store.get('lh.avatar') || 'null'));
  } catch {
    return { ...DEFAULT_AVATAR };
  }
}

const S = {
  name: store.get('lh.name'),
  avatar: loadAvatar(),
  session: store.get('lh.session'),
  lobby: null as LobbyState | null,
  info: null as StartedInfo | null,
  state: null as StateView | null,
  ask: null as { id: number; ask: Ask; deadline: number } | null,
  result: null as GameResult | null,
  screen: 'home' as 'home' | 'lobby' | 'game' | 'result',
  error: '',
  log: [] as { text: string; hi: boolean }[],
};

const app = document.getElementById('app')!;
const connEl = document.getElementById('conn')!;

/** 단독 실행판(서버 없음)에서는 브라우저 안에서 게임을 돌린다 */
const LOCAL = !!(window as unknown as { __LH_LOCAL__?: boolean }).__LH_LOCAL__;
const hello = (): ClientMsg => ({ t: 'hello', name: S.name || '손님', avatar: S.avatar, ...(S.session ? { session: S.session } : {}) });
const net: Net | LocalNet = LOCAL ? new LocalNet(hello) : new Net(hello);
net.onStatus = (on) => connEl.classList.toggle('hidden', on);
net.onMsg = onMsg;

function avatarEl(a: Avatar, size = 40, ring?: string, stage = 5): HTMLElement {
  return h('img', {
    class: 'avatar-img',
    src: avatarImage(a, size, stage),
    width: size,
    height: size,
    alt: '',
    style: ring ? { border: `3px solid ${ring}` } : undefined,
  });
}
function who(id: number): string {
  const p = S.state?.players[id];
  return p ? p.name : `P${id + 1}`;
}
function onAvatar(a: Avatar) {
  S.avatar = a;
  store.set('lh.avatar', JSON.stringify(a));
  net.send({ t: 'avatar', avatar: a });
}

// ───────── 메시지 처리 ─────────
function onMsg(m: ServerMsg) {
  switch (m.t) {
    case 'welcome':
      S.session = m.session;
      store.set('lh.session', m.session);
      break;
    case 'lobby':
      S.lobby = m.room;
      if (!m.room) {
        S.screen = 'home';
        S.info = null;
        S.state = null;
        S.result = null;
        stopGame();
        const code = LOCAL ? '' : location.hash.replace('#', '').trim();
        if (code.length === 4 && !S.error) net.send({ t: 'joinRoom', code });
      } else if (S.screen === 'home') {
        S.screen = m.room.inGame && S.info ? 'game' : 'lobby';
      } else if (S.screen === 'game' && !m.room.inGame && !S.result) {
        // 게임이 끝났는데 결과를 못 받았다면 대기실로
        S.screen = 'lobby';
      }
      try {
        if (m.room && !LOCAL) history.replaceState(null, '', `#${m.room.code}`);
        else if (!LOCAL) history.replaceState(null, '', location.pathname);
      } catch {
        /* 주소 갱신을 못 하는 환경 */
      }
      render();
      break;
    case 'started':
      S.info = m.info;
      S.result = null;
      S.log = [];
      S.screen = 'game';
      buildGame();
      render();
      break;
    case 'state':
      S.state = m.state;
      if (S.screen === 'game') updateGame();
      break;
    case 'event':
      onEvent(m.event);
      break;
    case 'ask':
      S.ask = { id: m.id, ask: m.ask, deadline: m.deadline };
      renderAsk();
      break;
    case 'askDone':
      if (S.ask?.id === m.id) {
        S.ask = null;
        renderAsk();
      }
      break;
    case 'ended':
      S.result = m.result;
      setTimeout(() => {
        if (S.result === m.result) {
          S.screen = 'result';
          stopGame();
          render();
        }
      }, 2500);
      break;
    case 'error':
      S.error = m.message;
      flashError(m.message);
      break;
  }
}

function flashError(msg: string) {
  const el = document.getElementById('err');
  if (el) el.textContent = msg;
  setTimeout(() => {
    S.error = '';
    const e2 = document.getElementById('err');
    if (e2 && e2.textContent === msg) e2.textContent = '';
  }, 4000);
}

// ───────── 화면 전환 ─────────
function render() {
  if (S.screen === 'game') {
    if (!G) buildGame();
    return;
  }
  stopGame();
  clear(app);
  if (S.screen === 'home') app.append(viewHome());
  else if (S.screen === 'lobby' && S.lobby) app.append(viewLobby(S.lobby));
  else if (S.screen === 'result' && S.result) app.append(viewResult(S.result));
}

// ───────── 홈 ─────────
function viewHome(): HTMLElement {
  const nameIn = h('input', { type: 'text', maxlength: 12, placeholder: '이름 (최대 12자)', value: S.name, class: 'grow' }) as HTMLInputElement;
  const codeIn = h('input', { type: 'text', maxlength: 4, placeholder: '방 코드 4글자', style: { textTransform: 'uppercase', width: '150px' } }) as HTMLInputElement;
  const saveName = () => {
    S.name = nameIn.value.trim().slice(0, 12) || '손님';
    store.set('lh.name', S.name);
    net.send({ t: 'hello', name: S.name, session: S.session });
  };
  return h('div', { class: 'center' },
    h('div', { class: 'hero' }, h('h1', null, '🏝️ 인생 섬 여행'), h('p', null, '모두가 같은 목표를 품고 인생의 섬들을 건너는 여행. 목표에 가장 가까이 닿은 사람이 이긴다.')),
    h('div', { class: 'card' },
      h('h2', null, '이름'),
      h('div', { class: 'row' }, nameIn),
    ),
    h('div', { class: 'card' },
      h('h2', null, '내 캐릭터'),
      createCreator(S.avatar, onAvatar),
    ),
    LOCAL
      ? h('div', { class: 'card' },
          h('h2', null, '여행 떠나기'),
          h('div', { class: 'muted', style: { marginBottom: '10px' } }, '이 버전은 컴퓨터 플레이어와 함께 혼자 즐기는 단독 실행판이에요. (여러 사람이 함께 하려면 서버판을 실행하세요)'),
          h('button', {
            class: 'primary',
            style: { fontSize: '17px', padding: '12px 28px' },
            onclick: () => {
              saveName();
              net.send({ t: 'createRoom' });
              for (const k of ['greedy', 'brawler', 'builder']) net.send({ t: 'addBot', kind: k });
            },
          }, '🏝️ 컴퓨터와 여행 준비하기'),
          h('div', { id: 'err', class: 'err' }, S.error),
        )
      : h('div', { class: 'card' },
      h('h2', null, '방 만들기 / 입장'),
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: () => { saveName(); net.send({ t: 'createRoom' }); } }, '새 방 만들기'),
        h('span', { class: 'muted' }, '또는'),
        codeIn,
        h('button', { onclick: () => { saveName(); net.send({ t: 'joinRoom', code: codeIn.value }); } }, '입장'),
      ),
      h('div', { id: 'err', class: 'err' }, S.error),
    ),
    h('div', { class: 'card muted' },
      h('b', null, '규칙 한눈에'),
      h('ul', { style: { margin: '6px 0 0', paddingLeft: '18px' } },
        h('li', null, '주사위 2개 중 하나로 이동하고, 안 쓴 눈이 4 이상이면 ✨기회 포인트를 얻어요.'),
        h('li', null, '성인이 되면 🏘️부동산 칸에서 원래 있는 집을 사거나 직접 지을 수 있고, 돈이 많으면 별장도 살 수 있어요. 지은 집은 섬에 실제로 세워져요.'),
        h('li', null, '칸마다 카드를 뽑아 안전하게 갈지 도전할지 고릅니다. 🏄 액티비티는 보상이 크고, ⚠️ 트러블은 맞서야 피할 수 있어요.'),
        h('li', null, '섬마다 해안길(안전하지만 길다)과 지름길(섬을 가로지르지만 도전만 가능)이 갈라집니다.'),
        h('li', null, '모두에게 공개된 목표(자산·행복·인맥·성장 등)의 달성률이 가장 높은 사람이 승리!'),
        h('li', null, '누군가 종착지(등대)에 닿으면 마감 카운트다운이 시작됩니다.'),
      ),
    ),
  );
}

// ───────── 로비 ─────────
const PRESETS = [
  { label: '🌱 꼬마 코스', sub: '갓난아기~중학생', s: 1, e: 3 },
  { label: '🎒 청춘 코스', sub: '중학생~성인 초반', s: 3, e: 5 },
  { label: '🏢 어른 코스', sub: '성인 초반~말기', s: 5, e: 7 },
  { label: '🍂 노년 코스', sub: '노년 초반~끝', s: 8, e: 10 },
  { label: '🌏 전 생애', sub: '갓난아기~노년 끝', s: 1, e: 10 },
];
/** 여행 길이: 섬 하나의 칸 수(해안길)가 늘어난다 */
const LENGTHS: { id: 1 | 2 | 3; label: string; tiles: (zones: number) => string }[] = [
  { id: 1, label: '보통', tiles: (z) => `약 ${approxTiles(z, 1)}칸` },
  { id: 2, label: '길게', tiles: (z) => `약 ${approxTiles(z, 1.5)}칸` },
  { id: 3, label: '아주 길게', tiles: (z) => `약 ${approxTiles(z, 2)}칸` },
];
function approxTiles(zones: number, factor: number): number {
  return Math.round(zones * 14.8 * factor);
}
const DIFFS: { id: RoomSettings['difficulty']; label: string }[] = [
  { id: 'easy', label: '쉬움 (목표 1개)' },
  { id: 'normal', label: '보통 (목표 2개)' },
  { id: 'hard', label: '어려움 (목표 3개)' },
  { id: 'extreme', label: '극한 (목표 5개)' },
];

let creatorOpen = false;

function viewLobby(l: LobbyState): HTMLElement {
  const me = l.you;
  const amHost = l.seats[me]?.isHost ?? false;
  const st = l.settings;
  const set = (patch: Partial<RoomSettings>) => net.send({ t: 'settings', settings: patch });
  const zones = st.endZone - st.startZone + 1;
  const lenFactor = [1, 1.4, 1.8][st.length - 1] ?? 1;
  const estMin = Math.round((2.7 * zones * lenFactor * l.seats.length * 20) / 60);

  const zoneSel = (value: number, onchange: (v: number) => void) =>
    h('select', { disabled: !amHost, onchange: (e: Event) => onchange(Number((e.target as HTMLSelectElement).value)) },
      ZONES.map((z) => h('option', { value: z.id, selected: z.id === value }, `${z.id}. ${z.name} (${z.ages})`)));

  return h('div', { class: 'center' },
    h('div', { class: 'hero' },
      h('h1', null, '대기실'),
      h('p', null, LOCAL ? '컴퓨터와 함께 떠나는 여행 — 코스와 난이도를 고르고 시작하세요' : '친구에게 코드를 알려 주세요'),
      LOCAL ? null : h('div', { class: 'code' }, l.code),
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '6px' } },
        LOCAL ? null : h('button', { class: 'small', onclick: () => navigator.clipboard?.writeText(location.href) }, '링크 복사'),
        h('button', { class: 'small danger', onclick: () => { net.send({ t: 'leaveRoom' }); } }, '나가기'),
      ),
    ),
    h('div', { class: 'card' },
      h('h2', null, `플레이어 (${l.seats.length}/6)`),
      ...l.seats.map((s, i) =>
        h('div', { class: 'seat' },
          h('button', {
            class: `tok ${i === me ? 'mine' : ''}`,
            title: i === me ? '눌러서 내 캐릭터 꾸미기' : '',
            onclick: () => { if (i === me) { creatorOpen = !creatorOpen; render(); } },
          }, avatarEl(s.avatar, 48, SEAT_COLORS[i])),
          h('div', { class: 'grow' },
            h('div', null, s.name, ' ', i === me ? h('span', { class: 'muted' }, '(나)') : null, ' ', s.isHost ? h('span', { class: 'badge host' }, '방장') : null, ' ', !s.connected ? h('span', { class: 'badge' }, '연결 끊김') : null),
            h('div', { class: 'muted', style: { fontSize: '12px' } }, s.kind === 'bot' ? '컴퓨터' : '사람'),
          ),
          st.teams
            ? h('button', {
                class: `small badge team${s.team}`,
                disabled: !(amHost || i === me),
                onclick: () => net.send({ t: 'setTeam', seat: i, team: s.team === 0 ? 1 : 0 }),
                title: '눌러서 팀 바꾸기',
              }, s.team === 0 ? '🔵 파랑팀' : '🔴 빨강팀')
            : null,
          amHost && i !== me ? h('button', { class: 'small danger', onclick: () => net.send({ t: 'removeSeat', seat: i }) }, '내보내기') : null,
        )),
      creatorOpen ? h('div', { style: { marginTop: '10px' } }, createCreator(S.avatar, onAvatar)) : null,
      amHost && l.seats.length < 6
        ? h('div', { class: 'row', style: { marginTop: '10px' } },
            h('span', { class: 'muted' }, '컴퓨터 추가:'),
            ...BOT_KINDS.map((b) => h('button', { class: 'small', onclick: () => net.send({ t: 'addBot', kind: b.id }) }, `+ ${b.label}`)))
        : null,
    ),
    h('div', { class: 'card' },
      h('h2', null, '코스 (건너갈 인생의 섬)'),
      h('div', { class: 'chips' }, PRESETS.map((p) =>
        h('button', { class: `chip ${st.startZone === p.s && st.endZone === p.e ? 'on' : ''}`, disabled: !amHost, onclick: () => set({ startZone: p.s, endZone: p.e }) }, p.label, h('small', null, p.sub)))),
      h('div', { class: 'row', style: { marginTop: '10px' } },
        h('span', { class: 'muted' }, '시작'), zoneSel(st.startZone, (v) => set({ startZone: v })),
        h('span', { class: 'muted' }, '끝'), zoneSel(st.endZone, (v) => set({ endZone: v })),
      ),
      h('div', { class: 'row', style: { marginTop: '10px' } },
        h('span', { class: 'muted' }, '여행 길이'),
        ...LENGTHS.map((o) => h('button', { class: `chip small ${st.length === o.id ? 'on' : ''}`, disabled: !amHost, onclick: () => set({ length: o.id }) }, `${o.label} ${o.tiles(zones)}`))),
      h('div', { class: 'muted', style: { marginTop: '8px' } }, `${zones}개 구간 · 예상 ${estMin}분 (한 번 결정에 20초 가정)`),
    ),
    h('div', { class: 'card' },
      h('h2', null, '규칙'),
      h('div', { class: 'row' },
        h('label', null, '난이도 ', h('select', { disabled: !amHost, onchange: (e: Event) => set({ difficulty: (e.target as HTMLSelectElement).value as RoomSettings['difficulty'] }) },
          DIFFS.map((d) => h('option', { value: d.id, selected: d.id === st.difficulty }, d.label)))),
        h('label', null, h('input', { type: 'checkbox', checked: st.teams, disabled: !amHost, onchange: (e: Event) => set({ teams: (e.target as HTMLInputElement).checked }) }), ' 팀전 (팀 점수 = 팀원 평균)'),
        h('label', null, '결정 시간 ', h('select', { disabled: !amHost, onchange: (e: Event) => set({ decisionSeconds: Number((e.target as HTMLSelectElement).value) }) },
          [20, 30, 40, 60, 90].map((n) => h('option', { value: n, selected: n === st.decisionSeconds }, `${n}초`)))),
      ),
    ),
    h('div', { class: 'row between', style: { marginTop: '16px' } },
      h('div', { id: 'err', class: 'err' }, S.error),
      amHost
        ? h('button', { class: 'primary', style: { fontSize: '17px', padding: '12px 28px' }, disabled: l.seats.length < 2, onclick: () => net.send({ t: 'start' }) }, l.seats.length < 2 ? '2명 이상 필요' : '🏝️ 여행 시작')
        : h('span', { class: 'muted' }, '방장이 시작하기를 기다리는 중…'),
    ),
  );
}

// ───────── 게임 ─────────
interface GameUI {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  layout: Layout;
  scroll: HTMLElement;
  topbar: HTMLElement;
  goalsEl: HTMLElement;
  legendEl: HTMLElement;
  playersEl: HTMLElement;
  logEl: HTMLElement;
  overlay: HTMLElement;
  askbar: HTMLElement;
  anims: Map<number, { pts: Pt[]; t0: number; stepMs: number }>;
  tokenPos: Map<number, Pt>;
  floats: { x: number; y: number; text: string; t0: number }[];
  raf: number;
  diceEl: HTMLElement | null;
  lastTurn: number;
  three: HTMLElement;
  v3: Board3D | null;
  mode: '2d' | '3d';
}
let G: GameUI | null = null;
let overviewOn = false;

function buildGame() {
  if (!S.info) return;
  stopGame();
  const info = S.info;
  const layout = layoutBoard(info.board.tiles, info.startZone, info.endZone);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = h('canvas') as HTMLCanvasElement;
  canvas.width = layout.width * dpr;
  canvas.height = layout.height * dpr;
  const ctx = canvas.getContext('2d')!;
  const scroll = h('div', { class: 'board-scroll' }, canvas);
  const three = h('div', { class: 'three hidden' });
  const topbar = h('div', { class: 'topbar' });
  const overlay = h('div', { class: 'overlay' });
  const askbar = h('div', { class: 'askbar' });
  const goalsEl = h('section');
  const legendEl = h('section');
  const playersEl = h('section');
  const logEl = h('div', { class: 'log' });
  const root = h('div', { class: 'game' },
    h('div', { class: 'stage-wrap' }, topbar, scroll, three, overlay, askbar),
    h('div', { class: 'side' }, goalsEl, legendEl, playersEl, h('section', null, h('h3', null, '진행 기록'), logEl)),
  );
  clear(app);
  app.append(root);
  G = { root, canvas, ctx, layout, scroll, topbar, goalsEl, legendEl, playersEl, logEl, overlay, askbar, anims: new Map(), tokenPos: new Map(), floats: [], raf: 0, diceEl: null, lastTurn: -1, three, v3: null, mode: '2d' };
  // 처음엔 내 말이 있는 곳(맨 아래)으로
  requestAnimationFrame(() => (scroll.scrollTop = scroll.scrollHeight));
  const loop = (now: number) => {
    if (!G) return;
    frame(now, dpr);
    G.raf = requestAnimationFrame(loop);
  };
  G.raf = requestAnimationFrame(loop);
  setMode(store.get('lh.view') === '2d' ? '2d' : '3d');
  updateGame();
  renderAsk();
}

/** 2D / 3D 보드 전환. WebGL 을 못 쓰면 2D 로 되돌린다 */
function setMode(mode: '2d' | '3d') {
  if (!G || !S.info) return;
  if (mode === '3d' && !G.v3) {
    try {
      G.three.classList.remove('hidden');
      G.v3 = createBoard3D(G.three, S.info.board.tiles, S.info.startZone, S.info.endZone);
    } catch (err) {
      console.warn('3D 를 시작할 수 없어 2D 로 표시합니다', err);
      G.three.classList.add('hidden');
      G.v3 = null;
      mode = '2d';
    }
  }
  G.mode = mode;
  G.three.classList.toggle('hidden', mode !== '3d');
  G.scroll.classList.toggle('hidden', mode !== '2d');
  store.set('lh.view', mode);
  if (mode === '3d') G.v3?.resize();
  if (S.state) updateGame();
}

function stopGame() {
  if (G) {
    cancelAnimationFrame(G.raf);
    G.v3?.destroy();
  }
  G = null;
}

function frame(now: number, dpr: number) {
  if (!G || !S.state || !S.info) return;
  // 결정 타이머
  const bar = document.getElementById('ask-timer');
  if (bar && S.ask) {
    const total = (S.lobby?.settings.decisionSeconds ?? 40) * 1000;
    const left = Math.max(0, S.ask.deadline - Date.now());
    (bar as HTMLElement).style.width = `${Math.min(100, (left / total) * 100)}%`;
  }
  if (G.mode === '3d') return;
  // 이동 애니메이션
  for (const [id, a] of [...G.anims]) {
    const k = (now - a.t0) / a.stepMs;
    if (k >= a.pts.length - 1) {
      G.anims.delete(id);
      G.tokenPos.delete(id);
      continue;
    }
    const i = Math.max(0, Math.floor(k));
    const f = Math.max(0, k - i);
    const p0 = a.pts[i]!;
    const p1 = a.pts[i + 1]!;
    G.tokenPos.set(id, { x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f - Math.sin(f * Math.PI) * 8 });
  }
  draw(G.ctx, {
    tiles: S.info.board.tiles,
    layout: G.layout,
    players: S.state.players,
    current: S.state.current,
    tokenPos: G.tokenPos,
    me: S.state.me,
    dpr,
  });
  // 떠오르는 글자
  G.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  G.floats = G.floats.filter((f) => now - f.t0 < 1800);
  for (const f of G.floats) {
    const t = (now - f.t0) / 1800;
    G.ctx.globalAlpha = 1 - t * t;
    G.ctx.font = '700 15px system-ui, sans-serif';
    G.ctx.textAlign = 'center';
    G.ctx.lineWidth = 4;
    G.ctx.strokeStyle = '#fffdf8';
    G.ctx.strokeText(f.text, f.x, f.y - 24 - t * 26);
    G.ctx.fillStyle = '#222';
    G.ctx.fillText(f.text, f.x, f.y - 24 - t * 26);
    G.ctx.globalAlpha = 1;
  }
}

function focusTile(tileId: number) {
  if (!G) return;
  if (G.mode === '3d') {
    G.v3?.focus(tileId);
    return;
  }
  const p = G.layout.pos[tileId]!;
  const scale = G.canvas.clientWidth / G.layout.width;
  G.scroll.scrollTo({ top: p.y * scale - G.scroll.clientHeight * 0.55, left: p.x * scale - G.scroll.clientWidth / 2, behavior: 'smooth' });
}

function stageOfTile(tileId: number): number {
  return S.info!.board.tiles[tileId]!.zone;
}

function zoneOf(tileId: number): string {
  const t = S.info!.board.tiles[tileId]!;
  return ZONES[t.zone - 1]!.island;
}

function avg(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function updateGame() {
  if (!G || !S.state || !S.info) return;
  const st = S.state;
  const info = S.info;
  const meP = st.players[st.me]!;
  G.v3?.update(st.players, st.current, st.me);
  G.v3?.setHouses(st.players.flatMap((p) => [
    ...(p.life.house ? [{ key: `${p.id}:house`, spec: p.life.house, color: SEAT_COLORS[p.id % SEAT_COLORS.length]!, slot: p.id }] : []),
    ...(p.life.villa ? [{ key: `${p.id}:villa`, spec: p.life.villa, color: SEAT_COLORS[p.id % SEAT_COLORS.length]!, slot: p.id }] : []),
  ]));

  // 상단 바
  clear(G.topbar);
  G.topbar.append(
    h('span', { class: 'pill' }, `${st.round}라운드`),
    h('span', { class: 'pill' }, `${ZONES[info.startZone - 1]!.name} → ${ZONES[info.endZone - 1]!.name}`),
    ...(st.countdownLeft !== null ? [h('span', { class: 'pill alert' }, `⏳ 마감까지 ${st.countdownLeft}라운드`)] : []),
    ...(st.finished ? [] : [h('span', { class: 'pill', style: { marginLeft: 'auto' } }, `${who(st.current)}의 차례`)]),
    ...(G.mode === '3d' ? [h('button', { class: 'small', title: '모든 섬을 한눈에 보기', onclick: () => { overviewOn = !overviewOn; G?.v3?.setOverview(overviewOn); updateGame(); } }, overviewOn ? '🎥 따라가기' : '🗺️ 전체 보기')] : []),
    h('button', { class: 'small', title: '보드 보기 전환', onclick: () => setMode(G?.mode === '3d' ? '2d' : '3d') }, G.mode === '3d' ? '2D로 보기' : '3D로 보기'),
  );

  // 목표
  clear(G.goalsEl);
  G.goalsEl.append(h('h3', null, '공통 인생 목표'));
  info.goals.forEach((g, i) => {
    const c = meP.completion[i] ?? 0;
    const val = g.kind === 'stat' && meP.stats ? ` ${meP.stats[g.stat as StatKey]}/${g.target}` : '';
    G!.goalsEl.append(h('div', { class: 'goal' },
      h('div', { class: 'lbl' }, h('span', null, g.label), h('span', null, `${pct(c)}${val}`)),
      h('div', { class: 'bar' }, h('i', { class: c >= 1 ? 'full' : '', style: { width: `${c * 100}%` } })),
    ));
  });
  const goalAvg = avg(meP.completion);
  G.goalsEl.append(h('div', { class: 'muted', style: { fontSize: '13px' } }, `내 달성률 평균 ${pct(goalAvg)}`));

  // 이 섬의 칸 (종류별 개수와 앞으로 남은 칸)
  renderLegend(meP.pos);

  // 플레이어
  clear(G.playersEl);
  G.playersEl.append(h('h3', null, '플레이어'));
  const list = h('div', { class: 'plist' });
  for (const p of st.players) {
    const a = avg(p.completion);
    const showTeam = info.teams;
    list.append(h('div', { class: `pl ${p.id === st.current && !st.finished ? 'cur' : ''} ${p.id === st.me ? 'me' : ''} ${p.connected ? '' : 'off'}` },
      h('div', { class: 'tk' }, avatarEl(p.avatar, 40, SEAT_COLORS[p.id], stageOfTile(p.pos))),
      h('div', null,
        h('div', { class: 'nm' }, p.name, p.id === st.me ? ' (나)' : '', showTeam ? ` ${p.team === 0 ? '🔵' : '🔴'}` : '', !p.connected ? ' · 오프라인(봇이 대신)' : ''),
        h('div', { class: 'meta' }, `${zoneOf(p.pos)} · ${ZONES[stageOfTile(p.pos) - 1]!.ages}세 · 💪${p.stamina}/${p.staminaCap} ✨${p.cp}${p.arrived ? ` · 🏝️${p.arrivalRank}등 도착` : ''}`),
        h('div', { class: 'meta' }, lifeText(p.life)),
      ),
      h('div', { class: 'sc' }, p.exact ? pct(a) : `~${pct(a)}`),
    ));
  }
  G.playersEl.append(list);
  G.playersEl.append(h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '6px' } }, info.teams ? '팀원과 내 수치만 정확히 보입니다. 상대는 10% 단위.' : '상대의 달성률은 10% 단위로만 보입니다.'));
}

/** 지금 있는 섬에 어떤 칸이 몇 개 있는지 (해안길 기준), 앞으로 남은 칸 수 */
function renderLegend(pos: number) {
  if (!G || !S.info) return;
  const tiles = S.info.board.tiles;
  const zone = tiles[pos]!.zone;
  const z = ZONES[zone - 1]!;
  const mine = tiles.filter((t) => t.zone === zone && t.route !== 'short' && t.type !== 'fork');
  const counts = new Map<string, { icon: string; name: string; total: number; ahead: number }>();
  const order = ['trouble', 'activity', 'journey', 'camp', 'estate', 'lodge', 'weather', 'milestone', 'summit'];
  for (const t of mine) {
    const e = counts.get(t.type) ?? { icon: tileIcon(t.type, zone), name: TILE_NAME[t.type], total: 0, ahead: 0 };
    e.total++;
    if (t.id > pos) e.ahead++;
    counts.set(t.type, e);
  }
  clear(G.legendEl);
  G.legendEl.append(
    h('h3', null, `${z.island}의 칸 (해안길 기준)`),
    h('div', { class: 'legend' }, order.filter((k) => counts.has(k)).map((k) => {
      const e = counts.get(k)!;
      return h('div', { class: 'lg', title: `${e.name}: 전체 ${e.total}칸, 앞으로 ${e.ahead}칸` },
        h('span', { class: 'lgi' }, e.icon), h('span', null, e.name), h('b', null, `${e.ahead}/${e.total}`));
    })),
    h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' } }, '앞으로 남은 칸 / 전체 칸'),
  );
}

function addLog(text: string, hi = false) {
  S.log.push({ text, hi });
  if (S.log.length > 80) S.log.shift();
  if (!G) return;
  clear(G.logEl);
  for (const l of S.log.slice(-40)) G.logEl.append(h('div', { class: l.hi ? 'hi' : '' }, l.text));
  G.logEl.scrollTop = G.logEl.scrollHeight;
}

function toast(children: (Node | string)[], cls = '', ms = 2200): HTMLElement | null {
  if (!G) return null;
  const el = h('div', { class: `toast ${cls}` }, ...children);
  G.overlay.append(el);
  while (G.overlay.children.length > 3) G.overlay.firstElementChild!.remove();
  setTimeout(() => el.remove(), ms);
  return el;
}

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function dieFace(n: number, extra = ''): HTMLElement {
  const on = new Set(PIPS[n] ?? []);
  return h('div', { class: `die ${extra}`, title: String(n) }, Array.from({ length: 9 }, (_, i) => h('i', { class: on.has(i) ? '' : 'off' })));
}

function onEvent(e: GameEvent) {
  if (!G || !S.state || !S.info) return;
  const tiles = S.info.board.tiles;
  switch (e.t) {
    case 'roundStart':
      addLog(`── ${e.round}라운드 ──`);
      break;
    case 'turnStart': {
      G.lastTurn = e.player;
      const p = S.state.players[e.player];
      if (p) focusTile(p.pos);
      addLog(`${who(e.player)}의 차례`, e.player === S.state.me);
      break;
    }
    case 'rest':
      addLog(`${who(e.player)} 탈진 → 한 턴 쉬며 체력 회복`, true);
      toast([h('h4', null, `${who(e.player)} 탈진!`), '이번 턴은 쉬어요 (💪+3)'], 'bad');
      break;
    case 'dice': {
      const dice = h('div', { class: 'dice' }, dieFace(e.dice[0], 'rolling'), dieFace(e.dice[1], 'rolling'));
      G.diceEl = toast([h('h4', null, `${who(e.player)}의 주사위`), dice], '', 4200);
      (G.diceEl as HTMLElement & { _d?: HTMLElement })._d = dice;
      break;
    }
    case 'diceChosen': {
      const d = (G.diceEl as (HTMLElement & { _d?: HTMLElement }) | null)?._d;
      d?.children[e.pick]?.classList.add('picked');
      addLog(`${who(e.player)} ${e.move}칸 이동${e.cpGain ? ` (✨+${e.cpGain})` : ''}`);
      break;
    }
    case 'move': {
      const prev = S.state.players[e.player];
      if (prev && e.path.length) {
        const pts = [G.layout.pos[prev.pos]!, ...e.path.map((id) => G!.layout.pos[id]!)];
        G.anims.set(e.player, { pts, t0: performance.now(), stepMs: 300 });
        G.v3?.animateMove(e.player, e.path);
        focusTile(e.path[e.path.length - 1]!);
      }
      break;
    }
    case 'zoneEnter': {
      const z = ZONES[e.zone - 1]!;
      const label = `🎂 ${z.name} (${z.ages}세)`;
      toast([h('h4', null, `🎂 ${who(e.player)}의 새로운 나이`), h('div', null, `${z.name} (${z.ages}세) · ${z.island}`), h('div', { class: 'fx' }, `체력 한계 💪${S.state.players[e.player]?.staminaCap ?? ''}`)], 'good', 2400);
      addLog(`${who(e.player)} ${z.island} 도착 — ${z.name} (${z.ages}세)`, true);
      G.v3?.celebrate(e.player, label);
      break;
    }
    case 'house': {
      const sp = e.spec;
      toast([h('h4', null, sp.kind === 'villa' ? `🏝️ ${who(e.player)}의 별장` : sp.kind === 'custom' ? `🏠 ${who(e.player)}가 집을 지었어요` : `🏠 ${who(e.player)}가 집을 샀어요`), h('div', null, sp.name), h('div', { class: 'fx' }, fmtEffect(e.effect))], 'good', 3000);
      addLog(`${who(e.player)} ${sp.kind === 'villa' ? '별장' : sp.kind === 'custom' ? '집을 직접 지었어요' : '집을 샀어요'}: ${sp.name} ${fmtEffect(e.effect)}`, true);
      break;
    }
    case 'job': {
      toast([h('h4', null, `💼 ${who(e.player)}의 직업`), h('div', null, e.job), h('div', { class: 'fx' }, `월급 💰${e.salary} (섬을 옮길 때마다)`)], 'good', 2800);
      addLog(`${who(e.player)} 직업을 정했어요: ${e.job} (월급 ${e.salary})`, true);
      break;
    }
    case 'payday': {
      toast([h('h4', null, e.pension ? '🧓 연금 받는 날' : '💰 월급날!'), h('div', null, `${who(e.player)} · ${e.job}`), h('div', { class: 'fx' }, fmtEffect(e.effect))], 'good', 2200);
      addLog(`${who(e.player)} ${e.pension ? '연금' : '월급'} ${fmtEffect(e.effect)}`, e.player === S.state.me);
      break;
    }
    case 'milestone': {
      const verdict = e.success === null ? '' : e.success ? ' (성공!)' : ' (아쉽게 실패…)';
      toast([h('h4', null, `🚩 ${who(e.player)}의 선택`), h('div', null, `${e.option}${verdict}`), h('div', { class: 'fx' }, fmtEffect(e.effect))], e.success === false ? 'bad' : 'good', 3000);
      addLog(`${who(e.player)} 인생의 갈림길: ${e.option}${verdict} → ${fmtEffect(e.effect)}`, true);
      break;
    }
    case 'tile': {
      const t = tiles[e.tile]!;
      const txt = fmtEffect(e.delta);
      if (Object.keys(e.delta).length) {
        const p = G.layout.pos[e.tile]!;
        G.floats.push({ x: p.x, y: p.y, text: txt, t0: performance.now() });
        G.v3?.floatText(e.tile, txt);
        addLog(`${who(e.player)} ${TILE_NAME[t.type]} 칸 → ${txt}`, e.player === S.state.me);
      } else if (t.type !== 'fork') {
        addLog(`${who(e.player)} ${TILE_NAME[t.type]} 칸`);
      }
      break;
    }
    case 'card': {
      const verdict =
        e.choice === 'safe'
          ? DECK_TEXT[e.deck].safe
          : e.success
            ? `도전 성공! (주사위 ${e.roll}${e.boost ? ` +✨${e.boost}` : ''}${e.rerolled ? ', 재굴림' : ''})`
            : `도전 실패… (주사위 ${e.roll}${e.boost ? ` +✨${e.boost}` : ''}${e.rerolled ? ', 재굴림' : ''})`;
      const eff = e.choice === 'safe' ? e.card.safe : e.success ? e.card.challenge.win : e.card.challenge.lose;
      toast([h('h4', null, `${DECK_TEXT[e.deck].icon} ${who(e.player)} · ${e.card.title}`), h('div', null, verdict), h('div', { class: 'fx' }, fmtEffect(eff))], e.choice === 'safe' ? '' : e.success ? 'good' : 'bad', 2600);
      addLog(`${who(e.player)} 「${e.card.title}」 ${verdict}`, e.player === S.state.me);
      break;
    }
    case 'weather':
      toast([h('h4', null, `🌦️ ${e.card.title}`), h('div', { class: 'fx' }, `모두 ${fmtEffect(e.card.effect)}`)], '', 2200);
      addLog(`날씨 「${e.card.title}」: 모두 ${fmtEffect(e.card.effect)}`, true);
      break;
    case 'pathOption':
      addLog(`${who(e.player)} 진로 선택: ${ZONES[e.zone - 1]!.pathNames[e.option]}`);
      break;
    case 'lodge':
      addLog(`${who(e.player)} 보금자리 구입`);
      break;
    case 'sabotage':
      toast([h('h4', null, e.free ? '🍃 등대의 바람' : '💢 방해!'), `${who(e.from)} → ${who(e.to)}`], 'bad', 2000);
      addLog(`${who(e.from)}${e.free ? '의 바람' : '의 방해'} → ${who(e.to)}`, e.to === S.state.me);
      break;
    case 'catchUp':
      addLog(`뒤처진 플레이어에게 ✨+1: ${e.players.map(who).join(', ')}`);
      break;
    case 'arrive':
      toast([h('h4', null, `🏝️ ${who(e.player)} 종착지 도착!`), `${e.rank}등`], 'good', 2400);
      addLog(`${who(e.player)} 종착지 도착 (${e.rank}등)`, true);
      break;
    case 'countdown':
      toast([h('h4', null, '⏳ 마감 카운트다운 시작'), `${e.rounds}라운드 안에 종착지에 닿아야 해요`], 'bad', 2600);
      addLog(`마감 카운트다운: ${e.rounds}라운드`, true);
      break;
    case 'end':
      addLog('게임 종료!', true);
      break;
  }
}

// ───────── 결정 UI ─────────
const DECK_TEXT = {
  journey: { icon: '🃏', sub: '안전하게 갈까, 도전할까?', safe: '안전하게', challenge: '도전' },
  activity: { icon: '🏄', sub: '액티비티! 참가하면 보상이 커요. 구경만 해도 조금 즐거워요.', safe: '구경만 한다', challenge: '참가한다' },
  trouble: { icon: '⚠️', sub: '트러블 발생! 참고 넘기면 피해가 생기고, 맞서면 피할 수 있어요 (실패하면 더 아파요).', safe: '참고 넘긴다', challenge: '맞선다' },
} as const;

function answer(value: unknown) {
  if (!S.ask) return;
  net.send({ t: 'answer', id: S.ask.id, value });
  S.ask = null;
  renderAsk();
}

function successProb(dc: number, boost = 0) {
  return Math.max(0, Math.min(1, (7 - (dc - boost)) / 6));
}

function renderAsk() {
  if (!G) return;
  clear(G.askbar);
  if (!S.ask) return;
  const a = S.ask.ask;
  const box = h('div', { class: 'ask' });
  const opts = h('div', { class: 'opts' });
  const opt = (title: string, sub: string, onclick: () => void, disabled = false, primary = false) =>
    h('button', { class: `opt ${primary ? 'primary' : ''}`, disabled, onclick }, h('b', null, title), h('small', null, sub));

  switch (a.kind) {
    case 'die': {
      box.append(h('h4', null, '🎲 어느 눈으로 이동할까?'), h('div', { class: 'sub' }, `고른 눈 +${a.bonus}칸을 이동하고, 안 쓴 눈이 4 이상이면 ✨+1 (더블이면 ✨+1 더)`));
      const dbl = a.dice[0] === a.dice[1];
      for (const i of [0, 1] as const) {
        const move = a.dice[i] + a.bonus;
        const left = a.dice[1 - i]!;
        const cp = (left >= 4 ? 1 : 0) + (dbl ? 1 : 0);
        opts.append(opt(`${move}칸 이동`, cp ? `✨+${cp} 획득 (남는 눈 ${left})` : `✨ 없음 (남는 눈 ${left})`, () => answer(i), false, true));
      }
      break;
    }
    case 'path': {
      box.append(h('h4', null, '🔀 갈림길'), h('div', { class: 'sub' }, `지름길은 안전 선택지 없이 도전만 가능해요. 현재 체력 💪${a.stamina}`));
      a.options.forEach((o, i) => {
        const short = o.route === 'short';
        opts.append(opt(short ? '🌴 지름길 (섬 가로지르기)' : '🏖️ 해안길', `종착지까지 ${o.distance}칸 · ${short ? '도전 카드만, 체력 소모' : '캠프·보금자리·날씨·액티비티 칸 포함'}`, () => answer(i), false, !short));
      });
      break;
    }
    case 'card': {
      const c = a.card;
      const ch = c.challenge;
      const L = DECK_TEXT[a.deck];
      box.append(h('h4', null, `${L.icon} ${c.title}`), h('div', { class: 'sub' }, a.canSafe ? L.sub : `지름길이라 맞서야만 합니다. ${L.sub}`));
      if (a.canSafe) opts.append(opt(L.safe, fmtEffect(c.safe), () => answer('safe'), false, a.deck !== 'trouble'));
      opts.append(opt(`${L.challenge} (성공 ${pct(successProb(ch.dc))})`, `💪-${ch.staminaCost} · 성공 ${fmtEffect(ch.win)} / 실패 ${fmtEffect(ch.lose)}`, () => answer('challenge'), a.canSafe && a.stamina < ch.staminaCost, a.deck === 'trouble' || !a.canSafe));
      break;
    }
    case 'boost': {
      const ch = a.card.challenge;
      box.append(h('h4', null, '✨ 기회 포인트를 쓸까?'), h('div', { class: 'sub' }, `「${a.card.title}」 도전: 주사위 ${ch.dc} 이상이면 성공. ✨ 1개당 +1 (최대 2개) · 보유 ✨${a.cp}`));
      for (const n of [0, 1, 2]) opts.append(opt(n === 0 ? '쓰지 않음' : `✨ ${n}개 사용`, `성공 확률 ${pct(successProb(ch.dc, n))}`, () => answer(n), n > a.cp, n === 0));
      break;
    }
    case 'reroll':
      box.append(h('h4', null, `🎲 실패… (주사위 ${a.roll})`), h('div', { class: 'sub' }, `✨${a.cost}개를 내고 다시 굴릴까?`));
      opts.append(opt(`✨${a.cost} 내고 다시 굴리기`, `성공 확률 ${pct(successProb(a.card.challenge.dc))}`, () => answer(true), false, true), opt('그대로 받아들이기', fmtEffect(a.card.challenge.lose), () => answer(false)));
      break;
    case 'pathOption': {
      box.append(h('h4', null, `🪧 진로 선택 — ${ZONES[a.zone - 1]!.name}`), h('div', { class: 'sub' }, '자리가 한정되어 있어요. 먼저 고른 사람이 차지합니다.'));
      a.names.forEach((n, i) => opts.append(opt(n, `${fmtEffect(a.effects[i]!)}${a.available[i] ? '' : ' · 마감'}`, () => answer(i), !a.available[i], true)));
      opts.append(opt('선택하지 않음', '', () => answer(-1)));
      break;
    }
    case 'house': {
      box.classList.add('wide');
      box.append(buildHouseAsk(a.offer, a.onlyHome, (ans) => answer(ans)));
      break;
    }
    case 'job': {
      box.append(h('h4', null, '💼 어른이 되었어요! 직업을 정해요'), h('div', { class: 'sub' }, `정해진 직업으로 섬을 옮길 때마다 월급을 받고, 은퇴 후에는 월급의 절반이 연금이에요. 학력이 높을수록(🌱성장, 지금 ${a.growth}) 좋은 직업을 고를 수 있어요.`));
      a.options.forEach((o, i) => {
        opts.append(opt(`${o.icon} ${o.name}`, o.enabled ? `월급 💰${o.salary} · ${o.perkText}${o.minGrowth ? ` (🌱${o.minGrowth} 필요)` : ''}` : `🌱성장 ${o.minGrowth}이 필요해요 (월급 💰${o.salary})`, () => answer(i), !o.enabled, o.enabled));
      });
      break;
    }
    case 'milestone': {
      box.append(h('h4', null, `🚩 ${a.title}`), h('div', { class: 'sub' }, `인생의 갈림길! 하나를 골라요. 지금의 나: ${lifeText(a.life)} · 💰${a.asset}`));
      a.options.forEach((o, i) => {
        const chance = o.dc ? ` · 성공 확률 ${pct(successProb(o.dc))}${o.fail ? ` (실패 시 ${fmtEffect(o.fail)})` : ''}` : '';
        opts.append(opt(o.name, o.enabled ? `${o.desc} → ${fmtEffect(o.effect)}${chance}` : `선택할 수 없어요: ${o.why}`, () => answer(i), !o.enabled, o.enabled));
      });
      break;
    }
    case 'lodge':
      box.append(h('h4', null, '🏠 보금자리'), h('div', { class: 'sub' }, `💰${a.cost}을 내고 ${fmtEffect(a.effect)} (보유 💰${a.asset})`));
      opts.append(opt('구입한다', `💰-${a.cost} → ${fmtEffect(a.effect)}`, () => answer(true), a.asset < a.cost, true), opt('지나간다', '', () => answer(false)));
      break;
    case 'sabotage': {
      box.append(h('h4', null, a.free ? '🍃 등대의 바람' : '💢 방해할까?'), h('div', { class: 'sub' }, a.free ? '종착지에 먼저 닿은 특권! 아직 여행 중인 누군가에게 바람을 불어 💪-1 (비용 없음)' : `✨${a.cost}개를 내고 같은 구간의 상대에게 💪-2 ❤️-1. 보유 ✨${a.cp}`));
      for (const id of a.targets) opts.append(opt(who(id), '', () => answer(id)));
      opts.append(opt('하지 않음', '', () => answer(null), false, true));
      break;
    }
  }
  if (opts.childElementCount) box.append(opts);
  box.append(h('div', { class: 'timer' }, h('i', { id: 'ask-timer' })));
  G.askbar.append(box);
}

// ───────── 결과 ─────────
function viewResult(r: GameResult): HTMLElement {
  const players = S.state?.players ?? [];
  const goals = S.info?.goals ?? [];
  const nm = (id: number) => {
    const p = players[id];
    return p ? p.name : `P${id + 1}`;
  };
  const winner = r.ranking[0]!;
  const rows = r.ranking.map((id, idx) => {
    const sc = r.scores[id]!;
    const p = players[id];
    return h('div', { class: `rank ${idx === 0 ? 'first' : ''}` },
      h('div', { style: { fontSize: '20px', fontWeight: 800 } }, idx === 0 ? '🏆' : `${idx + 1}`),
      h('div', null, p ? avatarEl(p.avatar, 44, SEAT_COLORS[id], stageOfTile(p.pos)) : ''),
      h('div', null,
        h('div', null, p?.name ?? `P${id + 1}`, id === S.state?.me ? ' (나)' : '', info(r, id)),
        h('div', { class: 'muted', style: { fontSize: '12.5px' } }, p ? `인생: ${lifeText(p.life)}` : ''),
        h('div', { class: 'muted', style: { fontSize: '12.5px' } },
          `달성률 ${sc.base.toFixed(1)}`, sc.arrivalBonus ? ` + 도착 ${sc.arrivalBonus}` : '', sc.penalty ? ` − 미도착 ${sc.penalty}` : ''),
        ...goals.map((g, gi) => h('div', { class: 'goal', style: { margin: '4px 0 0' } },
          h('div', { class: 'lbl' }, h('span', null, g.label), h('span', null, pct(sc.completion[gi] ?? 0))),
          h('div', { class: 'bar' }, h('i', { class: (sc.completion[gi] ?? 0) >= 1 ? 'full' : '', style: { width: `${(sc.completion[gi] ?? 0) * 100}%` } })))),
      ),
      h('div', { class: 'big' }, sc.total.toFixed(1)),
    );
  });
  return h('div', { class: 'center result' },
    h('div', { class: 'hero' },
      h('h1', null, `🏝️ ${nm(winner)} 우승!`),
      h('p', null, r.endedBy === 'allArrived' ? '모두 종착지에 도착했어요' : '마감 카운트다운이 끝났어요'),
      r.teamScores ? h('p', null, `팀 점수 — ${r.teamScores.map((t) => `${t.team === 0 ? '🔵' : '🔴'} ${t.score.toFixed(1)}`).join(' : ')} · ${r.winningTeam === 0 ? '🔵 파랑팀' : '🔴 빨강팀'} 승리`) : null,
    ),
    h('div', { class: 'card' }, ...rows),
    h('div', { class: 'row', style: { marginTop: '16px', justifyContent: 'center' } },
      h('button', { class: 'primary', onclick: () => { S.screen = 'lobby'; S.result = null; net.send({ t: 'backToLobby' }); render(); } }, '대기실로 돌아가기'),
      h('button', { onclick: () => net.send({ t: 'leaveRoom' }) }, '방 나가기'),
    ),
  );
}
function info(r: GameResult, id: number): HTMLElement | null {
  const p = S.state?.players[id];
  if (!p?.arrived) return h('span', { class: 'badge', style: { marginLeft: '6px' } }, '미도착');
  return h('span', { class: 'badge', style: { marginLeft: '6px' } }, `🏝️ ${p.arrivalRank}등 도착`);
}

// 시작
net.connect();
render();

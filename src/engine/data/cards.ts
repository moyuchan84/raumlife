import type { CardDeck, Effect, JourneyCard } from '../types';

type E = Effect;
/** 카드 정의 헬퍼: safe 효과, 도전(체력 비용, 난이도 dc, 성공, 실패) */
function c(
  zone: number,
  title: string,
  safe: E,
  cost: number,
  dc: number,
  win: E,
  lose: E,
): JourneyCard {
  return { id: '', zone, title, safe, challenge: { staminaCost: cost, dc, win, lose } };
}

const RAW: JourneyCard[] = [
  // ── 1 갓난아기~유아
  c(1, '첫 걸음마 도전', { happy: 1, growth: 1 }, 1, 4, { growth: 3, happy: 2 }, { happy: -1 }),
  c(1, '놀이터 미끄럼틀', { happy: 1, network: 1 }, 1, 3, { happy: 3, network: 2 }, { stamina: -1 }),
  c(1, '낯선 아이와 인사', { network: 1, happy: 1 }, 1, 4, { network: 4 }, { happy: -1 }),
  // ── 2 초등
  c(2, '방과후 줄다리기 대회', { happy: 1, network: 1 }, 1, 4, { network: 3, happy: 2 }, { happy: -1 }),
  c(2, '용돈으로 뭘 살까', { asset: 2 }, 0, 4, { asset: 3, growth: 1 }, { asset: -1 }),
  c(2, '받아쓰기 시험', { growth: 2 }, 1, 4, { growth: 4, happy: 1 }, { growth: 0, happy: -1 }),
  // ── 3 중등
  c(3, '학원 vs 동아리', { growth: 2 }, 1, 4, { growth: 2, network: 3 }, { network: 0, happy: -1 }),
  c(3, '용돈 모으기 챌린지', { asset: 2 }, 0, 4, { asset: 4 }, { asset: 0 }),
  c(3, '첫 무대 발표', { growth: 1, network: 1 }, 2, 4, { happy: 3, network: 2, growth: 1 }, { happy: -2 }),
  // ── 4 고등
  c(4, '모의고사', { growth: 2 }, 1, 4, { growth: 4, asset: 1 }, { happy: -2 }),
  c(4, '친구와 놀러 갈까', { happy: 1, network: 1 }, 1, 3, { happy: 3, network: 2 }, { growth: -1 }),
  c(4, '주말 아르바이트', { asset: 2 }, 1, 3, { asset: 4, growth: 1 }, { stamina: -1 }),
  // ── 5 성인 초반
  c(5, '해외 여행 제안', { asset: 1 }, 2, 4, { happy: 3, network: 1, growth: 1 }, { asset: -2 }),
  c(5, '자격증에 도전', { growth: 2 }, 1, 4, { growth: 3, asset: 2 }, { asset: -1 }),
  c(5, '첫 월급 어떻게 쓸까', { asset: 2 }, 1, 3, { asset: 3, happy: 2 }, { happy: -1 }),
  // ── 6 성인 중반
  c(6, '투자 제안', { asset: 1 }, 1, 4, { asset: 5 }, { asset: -2 }),
  c(6, '육아와 일의 균형', { happy: 1, network: 1 }, 2, 4, { happy: 3, network: 2, growth: 1 }, { stamina: -1 }),
  c(6, '동네 모임 총무', { network: 2 }, 1, 3, { network: 3, asset: 1, happy: 1 }, { happy: -1 }),
  // ── 7 성인 말기
  c(7, '일과 건강 사이', { happy: 1, stamina: 2 }, 2, 4, { asset: 4, growth: 1 }, { asset: 0, stamina: -2 }),
  c(7, '자녀 독립 준비', { network: 1, happy: 1 }, 1, 4, { network: 3, happy: 2 }, { happy: -1 }),
  c(7, '건강 검진 결과', { stamina: 2, happy: 1 }, 1, 4, { stamina: 2, happy: 2, growth: 1 }, { happy: -1 }),
  // ── 8 노년 초반
  c(8, '마을 잔치', { network: 1, happy: 1 }, 1, 4, { network: 2, happy: 1, asset: 1 }, { happy: 0 }),
  c(8, '손자의 부탁', { happy: 1, network: 1 }, 1, 3, { happy: 3, network: 1 }, { stamina: -1 }),
  c(8, '새 취미 배우기', { growth: 1, happy: 1 }, 1, 4, { growth: 3, happy: 1, asset: 1 }, { happy: -1 }),
  // ── 9 노년 중반
  c(9, '옛 친구의 편지', { network: 1, happy: 1 }, 1, 4, { network: 3, happy: 2 }, { happy: 0 }),
  c(9, '추억 정리', { happy: 1, growth: 1 }, 1, 4, { happy: 3, growth: 2 }, { stamina: -1 }),
  c(9, '마루 위 낮잠', { stamina: 2, happy: 1 }, 0, 4, { stamina: 3, happy: 1, asset: 1 }, { stamina: 0 }),
  // ── 10 끝
  c(10, '마지막 편지 쓰기', { happy: 1, network: 1 }, 1, 4, { happy: 3, network: 2 }, { happy: 0 }),
  c(10, '유산 정하기', { asset: 2 }, 1, 4, { asset: 2, network: 2, happy: 1 }, { happy: -1 }),
  // ── 공통 (zone 0): 어느 구간에서든 나옴
  c(0, '길 위의 낯선 사람', { network: 1 }, 1, 4, { network: 3, happy: 1 }, { happy: -1 }),
  c(0, '예상 밖의 소나기', { stamina: 1 }, 1, 4, { happy: 2, growth: 1 }, { stamina: -1 }),
  c(0, '배움의 기회', { growth: 1, asset: 1 }, 1, 4, { growth: 3, asset: 1 }, { asset: -1 }),
  c(0, '횡재?', { asset: 2 }, 1, 4, { asset: 4 }, { asset: -1 }),
  c(0, '풍경 감상', { happy: 1, stamina: 1 }, 0, 4, { happy: 2, growth: 1 }, { happy: 0 }),
  c(0, '산새와의 만남', { happy: 1, stamina: 1 }, 1, 4, { happy: 3, growth: 1 }, { happy: 0 }),
  c(0, '도움이 필요한 이웃', { network: 1 }, 1, 3, { network: 3, happy: 1 }, { stamina: -1 }),
  c(0, '갈림길의 안내판', { growth: 1 }, 1, 4, { growth: 2, asset: 2 }, { asset: -1 }),
];

export const CARDS: JourneyCard[] = RAW.map((card, i) => ({ ...card, id: `j-${i + 1}` }));

// ───────── 액티비티 카드: 참가하면 보상이 크다 (구경만 해도 조금 즐겁다) ─────────
const ACT_RAW: JourneyCard[] = [
  c(1, '모래성 쌓기', { happy: 1 }, 1, 3, { happy: 2, growth: 2, network: 1 }, { happy: 1 }),
  c(2, '정글 탐험 대회', { happy: 1 }, 2, 3, { growth: 2, network: 2, happy: 1 }, { happy: 1 }),
  c(3, '물놀이 챌린지', { happy: 1 }, 2, 3, { happy: 3, network: 2 }, { happy: 1 }),
  c(4, '절벽 다이빙', { happy: 1 }, 2, 4, { happy: 3, growth: 2 }, { stamina: -1 }),
  c(5, '화산 트레킹', { happy: 1 }, 2, 3, { growth: 3, happy: 2 }, { happy: 1 }),
  c(6, '정원 축제 장터', { network: 1 }, 1, 3, { asset: 3, network: 2 }, { network: 1 }),
  c(7, '설원 썰매 레이스', { happy: 1 }, 2, 3, { happy: 3, network: 2 }, { happy: 1 }),
  c(8, '바닷가 산책 모임', { happy: 1 }, 1, 3, { network: 3, happy: 2 }, { happy: 1 }),
  c(9, '구름 위 요가', { happy: 1, stamina: 1 }, 1, 3, { happy: 3, growth: 2 }, { happy: 1 }),
  c(10, '노을 아래 작별 파티', { happy: 1 }, 1, 3, { network: 3, happy: 3 }, { happy: 1 }),
  c(0, '서핑 체험', { happy: 1 }, 2, 4, { happy: 3, growth: 2 }, { stamina: -1 }),
  c(0, '보물찾기', { growth: 1 }, 2, 3, { asset: 4, happy: 1 }, { happy: 1 }),
  c(0, '요트 타기', { happy: 1 }, 2, 3, { happy: 2, network: 2, growth: 1 }, { happy: 1 }),
  c(0, '캠프파이어 한마당', { network: 1 }, 1, 3, { network: 3, happy: 2 }, { happy: 1 }),
  c(0, '스노클링', { happy: 1 }, 2, 3, { growth: 2, happy: 3 }, { happy: 1 }),
  c(0, '해변 요리 대회', { asset: 1 }, 1, 3, { asset: 2, network: 2, happy: 1 }, { happy: 1 }),
];
export const ACTIVITY_CARDS: JourneyCard[] = ACT_RAW.map((card, i) => ({ ...card, id: `a-${i + 1}` }));

// ───────── 트러블 카드: 참으면 손해, 맞서면 피할 수도 있다 ─────────
const TRB_RAW: JourneyCard[] = [
  c(1, '넘어져서 엉엉', { happy: -1 }, 1, 4, { growth: 1 }, { happy: -2 }),
  c(2, '숙제를 못 했어', { growth: -1 }, 1, 4, { growth: 1, happy: 1 }, { growth: -1, happy: -1 }),
  c(3, '친구와 다툼', { network: -1 }, 1, 4, { network: 1, growth: 1 }, { network: -2 }),
  c(4, '시험을 망친 날', { happy: -1 }, 1, 4, { growth: 2 }, { happy: -1, growth: -1 }),
  c(5, '월세 폭탄', { asset: -1 }, 1, 4, { asset: 1 }, { asset: -2 }),
  c(6, '야근과 육아 사이', { happy: -1, stamina: -1 }, 1, 4, { happy: 1, network: 1 }, { happy: -2 }),
  c(7, '건강 적신호', { stamina: -2 }, 1, 4, { happy: 1 }, { stamina: -2, happy: -1 }),
  c(8, '무릎이 쑤신다', { stamina: -1, happy: -1 }, 1, 4, { happy: 1 }, { stamina: -2 }),
  c(9, '낡은 지붕', { asset: -1 }, 1, 4, { network: 1 }, { asset: -2 }),
  c(10, '마지막 후회', { happy: -1 }, 1, 4, { happy: 2 }, { happy: -2 }),
  c(0, '갑작스런 폭풍', { stamina: -2 }, 1, 4, { growth: 1 }, { stamina: -2, happy: -1 }),
  c(0, '길을 잃었다', { stamina: -1, happy: -1 }, 1, 4, { growth: 1 }, { stamina: -2 }),
  c(0, '배가 고장났다', { asset: -1 }, 1, 4, { growth: 1 }, { asset: -2 }),
  c(0, '해파리 출몰', { happy: -1 }, 1, 4, { happy: 1 }, { happy: -2 }),
  c(0, '수상한 여행 사기', { asset: -1 }, 1, 4, { growth: 1 }, { asset: -2 }),
  c(0, '안개 속 헤매기', { growth: -1 }, 1, 4, { growth: 1, happy: 1 }, { growth: -1, happy: -1 }),
];
export const TROUBLE_CARDS: JourneyCard[] = TRB_RAW.map((card, i) => ({ ...card, id: `t-${i + 1}` }));

export const DECKS: Record<CardDeck, JourneyCard[]> = {
  journey: CARDS,
  activity: ACTIVITY_CARDS,
  trouble: TROUBLE_CARDS,
};

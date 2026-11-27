import type { CardDeck, Effect, JourneyCard, Req } from '../types';

type E = Effect;
/** 카드 정의 헬퍼: safe 효과, 도전(체력 비용, 난이도 dc, 성공, 실패) */
function c(zone: number, title: string, safe: E, cost: number, dc: number, win: E, lose: E): JourneyCard {
  return { id: '', zone, title, safe, challenge: { staminaCost: cost, dc, win, lose } };
}
/** 조건이 붙은 카드 */
function lc(req: Req, card: JourneyCard): JourneyCard {
  return { ...card, requires: req };
}

/*
 * 카드는 모두 "그 나이에 실제로 겪는 일"이다. 섬(구간)마다 따로 있다.
 * 문구는 성별 역할을 가정하지 않는다 (부모님, 보호자, 동반자, 배우자 …).
 */

// ───────── 여정 카드 (일상) ─────────
const JOURNEY: JourneyCard[] = [
  // 1 갓난아기~유아
  c(1, '첫 걸음마 도전', { happy: 1, growth: 1 }, 1, 4, { growth: 3, happy: 2 }, { happy: -1 }),
  c(1, '놀이터 미끄럼틀', { happy: 1, network: 1 }, 1, 3, { happy: 3, network: 2 }, { stamina: -1 }),
  c(1, '낯선 아이와 인사', { network: 1, happy: 1 }, 1, 4, { network: 4 }, { happy: -1 }),
  c(1, '이유식 먹기', { stamina: 2 }, 1, 3, { growth: 2, happy: 1 }, {}),
  c(1, '까꿍 놀이', { happy: 1 }, 1, 3, { happy: 2, network: 2 }, {}),
  c(1, '그림책 읽어 주기', { growth: 1 }, 1, 3, { growth: 3, happy: 1 }, {}),
  c(1, '첫 낱말', { growth: 1, happy: 1 }, 1, 4, { growth: 3, network: 1 }, {}),
  // 2 초등
  c(2, '방과후 줄다리기 대회', { happy: 1, network: 1 }, 1, 4, { network: 3, happy: 2 }, { happy: -1 }),
  c(2, '용돈으로 뭘 살까', { asset: 2 }, 0, 4, { asset: 3, growth: 1 }, { asset: -1 }),
  c(2, '받아쓰기 시험', { growth: 2 }, 1, 4, { growth: 4, happy: 1 }, { growth: 0, happy: -1 }),
  c(2, '짝꿍과 친해지기', { network: 1 }, 1, 3, { network: 3, happy: 1 }, {}),
  c(2, '반장 선거', { growth: 1 }, 1, 4, { network: 2, growth: 2 }, { happy: -1 }),
  c(2, '가족 나들이', { happy: 2 }, 0, 4, { happy: 3, network: 1 }, {}),
  c(2, '도서관 가는 길', { growth: 1, stamina: 1 }, 1, 3, { growth: 3 }, {}),
  // 3 중등
  c(3, '학원 vs 동아리', { growth: 2 }, 1, 4, { growth: 2, network: 3 }, { happy: -1 }),
  c(3, '용돈 모으기 챌린지', { asset: 2 }, 0, 4, { asset: 4 }, {}),
  c(3, '첫 무대 발표', { growth: 1, network: 1 }, 2, 4, { happy: 3, network: 2, growth: 1 }, { happy: -2 }),
  c(3, '수학여행', { happy: 1, network: 1 }, 1, 3, { happy: 2, network: 3 }, { happy: 1 }),
  c(3, '사춘기, 부모님과 대화', { happy: 1 }, 1, 4, { network: 2, happy: 2 }, { happy: -1 }),
  c(3, '자유학기 직업 체험', { growth: 1 }, 1, 3, { growth: 3, asset: 1 }, {}),
  c(3, '체육대회', { happy: 1, stamina: 1 }, 1, 4, { happy: 2, network: 2 }, { stamina: -1 }),
  // 4 고등
  c(4, '모의고사', { growth: 2 }, 1, 4, { growth: 4, asset: 1 }, { happy: -2 }),
  c(4, '친구와 놀러 갈까', { happy: 1, network: 1 }, 1, 3, { happy: 3, network: 2 }, { growth: -1 }),
  c(4, '주말 아르바이트', { asset: 2 }, 1, 3, { asset: 4, growth: 1 }, { stamina: -1 }),
  c(4, '짝사랑 고백', { happy: 1 }, 1, 4, { happy: 3, network: 1 }, { happy: -1 }),
  c(4, '대입 원서 접수', { growth: 1 }, 1, 4, { growth: 3, happy: 1 }, { happy: -1 }),
  c(4, '진로 상담', { growth: 1 }, 1, 3, { growth: 2, happy: 2 }, {}),
  c(4, '야간 자율학습', { growth: 2 }, 1, 4, { growth: 3, stamina: -1 }, { stamina: -1 }),
  // 5 성인 초반
  c(5, '해외 여행 제안', { happy: 1 }, 2, 4, { happy: 3, network: 1, growth: 1 }, { asset: -2 }),
  c(5, '자격증에 도전', { growth: 2 }, 1, 4, { growth: 3, asset: 2 }, { asset: -1 }),
  c(5, '첫 월급 어떻게 쓸까', { asset: 2 }, 1, 3, { asset: 3, happy: 2 }, { happy: -1 }),
  lc({ noPartner: true }, c(5, '소개팅', { network: 1 }, 1, 4, { happy: 2, network: 2, life: { partner: true } }, { happy: -1 })),
  c(5, '자취방 구하기', { asset: 1 }, 1, 4, { happy: 2, asset: 1 }, { asset: -1 }),
  c(5, '인턴 지원', { growth: 1 }, 1, 4, { growth: 3, asset: 1 }, {}),
  c(5, '친구들과 모임', { network: 2 }, 1, 3, { network: 3, happy: 2 }, {}),
  // 6 성인 중반
  c(6, '투자 제안', { asset: 1 }, 1, 4, { asset: 5 }, { asset: -2 }),
  lc({ children: 1 }, c(6, '육아와 일의 균형', { happy: 1, network: 1 }, 2, 4, { happy: 3, network: 2, growth: 1 }, { stamina: -1 })),
  c(6, '동네 모임 총무', { network: 2 }, 1, 3, { network: 3, asset: 1, happy: 1 }, { happy: -1 }),
  lc({ partner: true, childrenLt: 2 }, c(6, '가정을 꾸릴 기회', { asset: 1 }, 1, 3, { happy: 3, network: 1, life: { children: 1 } }, { stamina: -1 })),
  lc({ noHome: true, minAsset: 2 }, c(6, '내 집 마련 대출', { asset: 1 }, 1, 4, { happy: 2, asset: -1, life: { home: true } }, { asset: -1 })),
  lc({ children: 1 }, c(6, '학부모 상담', { network: 1 }, 1, 4, { happy: 2, network: 2 }, { stamina: -1 })),
  lc({ career: true }, c(6, '이직 제안', { asset: 1 }, 1, 4, { growth: 1, asset: 2, life: { raise: 1 } }, { growth: 1 })),
  c(6, '직장 회식', { network: 1 }, 1, 3, { network: 3, stamina: -1 }, {}),
  c(6, '야간 대학원 수업', { growth: 1 }, 2, 4, { growth: 4 }, { stamina: -1 }),
  // 7 성인 말기
  c(7, '일과 건강 사이', { happy: 1, stamina: 2 }, 2, 4, { asset: 4, growth: 1 }, { stamina: -2 }),
  lc({ children: 1 }, c(7, '자녀 독립 준비', { network: 1, happy: 1 }, 1, 4, { network: 3, happy: 2 }, { happy: -1 })),
  c(7, '건강 검진 결과', { stamina: 2, happy: 1 }, 1, 4, { stamina: 2, happy: 2, growth: 1 }, { happy: -1 }),
  lc({ children: 1 }, c(7, '자녀 대학 입학', { happy: 1 }, 1, 4, { happy: 3, network: 1 }, {})),
  lc({ career: true }, c(7, '승진 심사', { asset: 1 }, 1, 4, { growth: 2, asset: 2, life: { raise: 1 } }, {})),
  c(7, '오랜만의 동창회', { network: 1 }, 1, 3, { network: 3, happy: 1 }, {}),
  c(7, '노후 준비 상담', { asset: 1 }, 1, 4, { asset: 3, growth: 1 }, {}),
  // 8 노년 초반
  c(8, '경로당 모임', { network: 1, happy: 1 }, 1, 4, { network: 2, happy: 1, asset: 1 }, {}),
  lc({ grandchildren: 1 }, c(8, '손자의 부탁', { happy: 1, network: 1 }, 1, 3, { happy: 3, network: 1 }, { stamina: -1 })),
  c(8, '새 취미 배우기', { growth: 1, happy: 1 }, 1, 4, { growth: 3, happy: 1, asset: 1 }, { happy: -1 }),
  lc({ children: 1, grandchildrenLt: 2 }, c(8, '손주 탄생', { happy: 2 }, 1, 3, { happy: 3, network: 1, life: { grandchildren: 1 } }, { happy: 1 })),
  lc({ career: true }, c(8, '은퇴 기념 모임', { happy: 1 }, 1, 4, { network: 3, happy: 2 }, { happy: 1 })),
  c(8, '연금 수령 상담', { asset: 1 }, 1, 4, { asset: 2, growth: 1 }, {}),
  c(8, '산책 친구 만들기', { network: 1 }, 1, 3, { network: 3, stamina: 1 }, {}),
  // 9 노년 중반
  c(9, '옛 친구의 편지', { network: 1, happy: 1 }, 1, 4, { network: 3, happy: 2 }, {}),
  c(9, '추억 정리', { happy: 1, growth: 1 }, 1, 4, { happy: 3, growth: 2 }, { stamina: -1 }),
  c(9, '마루 위 낮잠', { stamina: 2, happy: 1 }, 0, 4, { stamina: 3, happy: 1, asset: 1 }, {}),
  lc({ grandchildren: 1 }, c(9, '손주 재롱잔치', { happy: 2 }, 1, 4, { happy: 3, network: 1 }, { happy: 1 })),
  c(9, '병원 정기검진', { stamina: 1 }, 1, 4, { stamina: 2, happy: 1 }, {}),
  c(9, '자서전 쓰기', { growth: 1 }, 1, 4, { growth: 3, happy: 1 }, {}),
  // 10 노년 말기 (끝)
  c(10, '마지막 편지 쓰기', { happy: 1, network: 1 }, 1, 4, { happy: 3, network: 2 }, {}),
  c(10, '유산 정하기', { asset: 2 }, 1, 4, { asset: 2, network: 2, happy: 1 }, { happy: -1 }),
  lc({ family: true }, c(10, '가족과 마지막 식사', { happy: 2 }, 1, 4, { happy: 3, network: 2 }, { happy: 1 })),
  c(10, '옛 사진첩 정리', { happy: 2 }, 0, 4, { happy: 3, growth: 1 }, {}),
  c(10, '고향 방문', { happy: 1 }, 1, 4, { happy: 3, network: 1 }, { stamina: -1 }),
  c(10, '오랜 친구와 통화', { network: 1 }, 0, 4, { network: 3, happy: 1 }, {}),
  c(10, '창가에서 노을 보기', { happy: 1, stamina: 1 }, 0, 4, { happy: 3, growth: 1 }, {}),
];
export const CARDS: JourneyCard[] = JOURNEY.map((card, i) => ({ ...card, id: `j-${i + 1}` }));

// ───────── 액티비티 카드: 참가하면 보상이 크다 (구경만 해도 조금 즐겁다) ─────────
const ACTIVITY: JourneyCard[] = [
  c(1, '모래성 쌓기', { happy: 1 }, 1, 3, { happy: 2, growth: 2, network: 1 }, { happy: 1 }),
  c(1, '물장구 놀이', { happy: 1 }, 1, 3, { happy: 3, stamina: 1, network: 1 }, { happy: 1 }),
  c(1, '동물 친구 만나기', { happy: 1 }, 1, 3, { happy: 2, growth: 2, network: 1 }, { happy: 1 }),
  c(2, '학교 소풍', { happy: 1 }, 2, 3, { growth: 2, network: 2, happy: 1 }, { happy: 1 }),
  c(2, '운동회 달리기', { happy: 1 }, 2, 3, { happy: 3, network: 2 }, { stamina: -1 }),
  c(2, '방학 캠프', { network: 1 }, 2, 3, { network: 3, growth: 1, happy: 1 }, { happy: 1 }),
  c(3, '학교 축제 무대', { happy: 1 }, 2, 3, { happy: 3, network: 2 }, { happy: 1 }),
  c(3, '동아리 대회', { growth: 1 }, 2, 3, { growth: 3, network: 2 }, { happy: 1 }),
  c(3, '친구들과 물놀이', { happy: 1 }, 2, 3, { happy: 3, network: 2 }, { happy: 1 }),
  c(4, '체험학습 현장', { growth: 1 }, 2, 4, { growth: 3, happy: 2 }, { stamina: -1 }),
  c(4, '학교 축제 부스', { happy: 1 }, 2, 3, { asset: 3, network: 2 }, { happy: 1 }),
  c(4, '봉사활동', { network: 1 }, 2, 3, { network: 3, growth: 1, happy: 1 }, { happy: 1 }),
  c(5, '배낭여행', { happy: 1 }, 2, 3, { growth: 3, happy: 2 }, { happy: 1 }),
  c(5, '동호회 모임', { network: 1 }, 1, 3, { network: 3, happy: 2 }, { happy: 1 }),
  c(5, '워킹홀리데이', { growth: 1 }, 2, 4, { asset: 3, growth: 2 }, { stamina: -1 }),
  c(6, '동네 벼룩시장', { network: 1 }, 1, 3, { asset: 3, network: 2 }, { network: 1 }),
  c(6, '가족 캠핑', { happy: 1 }, 2, 3, { happy: 3, network: 2 }, { happy: 1 }),
  c(6, '마라톤 대회', { happy: 1 }, 2, 4, { happy: 3, stamina: 1, growth: 1 }, { stamina: -1 }),
  c(7, '등산 모임', { happy: 1 }, 2, 3, { happy: 3, network: 2 }, { stamina: -1 }),
  c(7, '주말농장 수확', { happy: 1 }, 1, 3, { asset: 2, happy: 2, stamina: 1 }, { happy: 1 }),
  c(7, '부부·친구 여행', { happy: 1 }, 2, 3, { happy: 3, network: 2 }, { happy: 1 }),
  c(8, '걷기 모임', { happy: 1 }, 1, 3, { network: 3, happy: 2 }, { happy: 1 }),
  c(8, '노인대학 수업', { growth: 1 }, 1, 3, { growth: 3, network: 2 }, { happy: 1 }),
  c(8, '텃밭 가꾸기', { happy: 1 }, 1, 3, { happy: 2, asset: 1, stamina: 2 }, { happy: 1 }),
  c(9, '복지관 노래 교실', { happy: 1 }, 1, 3, { happy: 3, growth: 2 }, { happy: 1 }),
  c(9, '가족 사진 찍기', { happy: 1 }, 1, 3, { happy: 3, network: 2 }, { happy: 1 }),
  c(9, '옛 놀이 한마당', { network: 1 }, 1, 3, { happy: 3, network: 2 }, { happy: 1 }),
  c(10, '노을 아래 작별 파티', { happy: 1 }, 1, 3, { network: 3, happy: 3 }, { happy: 1 }),
  c(10, '손편지 낭독회', { happy: 1 }, 1, 3, { happy: 3, network: 2 }, { happy: 1 }),
  c(10, '고향 노래 부르기', { happy: 1 }, 1, 3, { happy: 3, growth: 1, network: 1 }, { happy: 1 }),
];
export const ACTIVITY_CARDS: JourneyCard[] = ACTIVITY.map((card, i) => ({ ...card, id: `a-${i + 1}` }));

// ───────── 트러블 카드: 그 나이에 흔한 어려움. 참으면 손해, 맞서면 피할 수도 있다 ─────────
const TROUBLE: JourneyCard[] = [
  c(1, '넘어져서 엉엉', { happy: -1 }, 1, 4, { growth: 1 }, { happy: -2 }),
  c(1, '열감기', { stamina: -2 }, 1, 4, { happy: 1 }, { stamina: -2, happy: -1 }),
  c(1, '낮잠을 안 자요', { happy: -1 }, 1, 4, { growth: 1 }, { happy: -2 }),
  c(1, '분리불안', { network: -1 }, 1, 4, { network: 1, happy: 1 }, { happy: -2 }),
  c(1, '장난감을 뺏겼어', { happy: -1 }, 1, 4, { network: 1 }, { happy: -2 }),
  c(2, '숙제를 못 했어', { growth: -1 }, 1, 4, { growth: 1, happy: 1 }, { growth: -1, happy: -1 }),
  c(2, '친구가 놀려요', { happy: -1 }, 1, 4, { network: 1, happy: 1 }, { happy: -2 }),
  c(2, '준비물을 안 가져왔어', { growth: -1 }, 1, 4, { growth: 1 }, { growth: -2 }),
  c(2, '충치 치료', { stamina: -1, happy: -1 }, 1, 4, { happy: 1 }, { stamina: -2, happy: -1 }),
  c(3, '친구와 다툼', { network: -1 }, 1, 4, { network: 1, growth: 1 }, { network: -2 }),
  c(3, '시험 성적이 떨어졌어', { growth: -1 }, 1, 4, { growth: 2 }, { growth: -2 }),
  c(3, '외모 고민', { happy: -1 }, 1, 4, { happy: 1, growth: 1 }, { happy: -2 }),
  c(3, '핸드폰에 빠져 버렸어', { growth: -1, stamina: -1 }, 1, 4, { growth: 1 }, { growth: -1, stamina: -2 }),
  c(4, '시험을 망친 날', { happy: -1 }, 1, 4, { growth: 2 }, { happy: -1, growth: -1 }),
  c(4, '입시 스트레스', { happy: -1, stamina: -1 }, 1, 4, { growth: 1, happy: 1 }, { happy: -2, stamina: -2 }),
  c(4, '친구 관계가 어색해졌어', { network: -1 }, 1, 4, { network: 2 }, { network: -2 }),
  c(4, '진로가 막막해', { growth: -1 }, 1, 4, { growth: 2, happy: 1 }, { growth: -1, happy: -1 }),
  c(5, '월세 폭탄', { asset: -1 }, 1, 4, { asset: 1 }, { asset: -2 }),
  c(5, '취업 낙방', { happy: -1 }, 1, 4, { growth: 2 }, { happy: -2 }),
  c(5, '학자금 대출 상환', { asset: -1 }, 1, 4, { asset: 1 }, { asset: -2 }),
  c(5, '번아웃', { stamina: -2 }, 1, 4, { happy: 1 }, { stamina: -2, happy: -1 }),
  lc({ partner: true }, c(5, '연인과의 다툼', { happy: -1 }, 1, 4, { happy: 1, network: 1 }, { happy: -2 })),
  lc({ children: 1 }, c(6, '야근과 육아 사이', { happy: -1, stamina: -1 }, 1, 4, { happy: 1, network: 1 }, { happy: -2 })),
  lc({ children: 1 }, c(6, '아이가 아파요', { happy: -1, stamina: -1 }, 1, 4, { happy: 1, network: 1 }, { happy: -2, stamina: -2 })),
  lc({ career: true }, c(6, '실직 위기', { asset: -1 }, 1, 4, { growth: 1 }, { asset: -2 })),
  lc({ home: true }, c(6, '대출 이자 부담', { asset: -1 }, 1, 4, { asset: 1 }, { asset: -2 })),
  c(6, '층간소음 갈등', { happy: -1 }, 1, 4, { network: 1 }, { happy: -2 }),
  c(6, '전세 보증금 문제', { asset: -1 }, 1, 4, { growth: 1 }, { asset: -2 }),
  c(7, '건강 적신호', { stamina: -2 }, 1, 4, { happy: 1 }, { stamina: -2, happy: -1 }),
  c(7, '부모님 간병', { stamina: -2 }, 1, 4, { happy: 1 }, { stamina: -2, happy: -1 }),
  lc({ partner: true }, c(7, '배우자의 건강 이상', { happy: -1, stamina: -1 }, 1, 4, { happy: 1 }, { happy: -2 })),
  lc({ career: true }, c(7, '구조조정 소문', { asset: -1 }, 1, 4, { growth: 1 }, { asset: -2 })),
  lc({ children: 1 }, c(7, '자녀 학비 부담', { asset: -1 }, 1, 4, { network: 1 }, { asset: -2 })),
  c(7, '갱년기 불면', { stamina: -1, happy: -1 }, 1, 4, { happy: 1 }, { stamina: -2 }),
  c(8, '무릎이 쑤신다', { stamina: -1, happy: -1 }, 1, 4, { happy: 1 }, { stamina: -2 }),
  lc({ children: 1 }, c(8, '자녀와 연락이 뜸', { happy: -1 }, 1, 4, { network: 1 }, { happy: -2 })),
  c(8, '보이스피싱 전화', { asset: -1 }, 1, 4, { growth: 1 }, { asset: -2 }),
  c(8, '낙상 사고', { stamina: -2 }, 1, 4, { happy: 1 }, { stamina: -2, happy: -1 }),
  c(8, '친구의 부고', { happy: -1, network: -1 }, 1, 4, { happy: 1 }, { happy: -2, network: -1 }),
  c(9, '집 수리비', { asset: -1 }, 1, 4, { network: 1 }, { asset: -2 }),
  c(9, '병원 입원', { stamina: -2 }, 1, 4, { happy: 1 }, { stamina: -2, happy: -1 }),
  c(9, '시력이 나빠져요', { growth: -1 }, 1, 4, { happy: 1 }, { growth: -2 }),
  c(9, '외로운 밤', { happy: -1 }, 1, 4, { network: 1 }, { happy: -2 }),
  c(10, '마지막 후회', { happy: -1 }, 1, 4, { happy: 2 }, { happy: -2 }),
  c(10, '기력이 쇠했어요', { stamina: -2 }, 1, 4, { happy: 1 }, { stamina: -2, happy: -1 }),
  c(10, '친구들을 먼저 보내다', { happy: -1, network: -1 }, 1, 4, { happy: 1 }, { happy: -2, network: -1 }),
  c(10, '유언장을 고민하다', { happy: -1 }, 1, 4, { growth: 1, happy: 1 }, { happy: -2 }),
];
export const TROUBLE_CARDS: JourneyCard[] = TROUBLE.map((card, i) => ({ ...card, id: `t-${i + 1}` }));

export const DECKS: Record<CardDeck, JourneyCard[]> = {
  journey: CARDS,
  activity: ACTIVITY_CARDS,
  trouble: TROUBLE_CARDS,
};

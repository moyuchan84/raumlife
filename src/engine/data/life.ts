import type { Effect, LifeState, Req } from '../types';

export function emptyLife(): LifeState {
  return { house: null, villa: null, career: null, jobId: null, raise: 0, jobAsked: false, partner: false, children: 0, grandchildren: 0, home: false };
}

/** 중간 구간에서 시작하는 코스를 위한 표준 인생 상태 (앞 구간의 기록을 대신한다) */
export function startLife(startZone: number): LifeState {
  const l = emptyLife();
  // 이미 은퇴한 나이에서 시작하면 직장생활을 마친 상태(연금 수령)
  if (startZone >= 8) {
    l.career = '회사원';
    l.jobId = 'office';
    l.jobAsked = true;
  }
  if (startZone >= 6) l.partner = true;
  if (startZone >= 7) {
    l.children = 1;
    l.home = true;
  }
  if (startZone >= 9) l.grandchildren = 1;
  return l;
}

export function meets(req: Req | undefined, life: LifeState, asset: number): boolean {
  if (!req) return true;
  if (req.partner && !life.partner) return false;
  if (req.noPartner && life.partner) return false;
  if (req.children !== undefined && life.children < req.children) return false;
  if (req.childrenLt !== undefined && life.children >= req.childrenLt) return false;
  if (req.grandchildren !== undefined && life.grandchildren < req.grandchildren) return false;
  if (req.grandchildrenLt !== undefined && life.grandchildren >= req.grandchildrenLt) return false;
  if (req.home && !life.home) return false;
  if (req.noHome && life.home) return false;
  if (req.career && !life.career) return false;
  if (req.noCareer && life.career) return false;
  if (req.family && !(life.partner || life.children > 0)) return false;
  if (req.minAsset !== undefined && asset < req.minAsset) return false;
  return true;
}

export function reqText(req: Req | undefined): string {
  if (!req) return '';
  const parts: string[] = [];
  if (req.partner) parts.push('동반자가 있어야 해요');
  if (req.noPartner) parts.push('동반자가 없을 때');
  if (req.children) parts.push('자녀가 있어야 해요');
  if (req.childrenLt !== undefined) parts.push('자녀가 더 적을 때');
  if (req.grandchildren) parts.push('손주가 있어야 해요');
  if (req.noHome) parts.push('내 집이 없을 때');
  if (req.home) parts.push('내 집이 있어야 해요');
  if (req.career) parts.push('직업이 있어야 해요');
  if (req.noCareer) parts.push('직업이 없을 때');
  if (req.family) parts.push('가족이 있어야 해요');
  if (req.minAsset !== undefined) parts.push(`💰${req.minAsset} 이상 필요`);
  return parts.join(' · ');
}

/** 구간 끝 이정표에서 고르는 인생의 갈림길 */
export interface MilestoneOption {
  id: string;
  name: string;
  desc: string;
  effect: Effect;
  /** 있으면 주사위 d6 ≥ dc 일 때만 effect, 아니면 fail */
  dc?: number;
  fail?: Effect;
  requires?: Req;
  /** 'house' 면 고른 뒤 집을 사거나 짓는 화면이 열린다 */
  action?: 'house';
}
export interface MilestoneInfo {
  title: string;
  options: MilestoneOption[];
}

export const MILESTONES: Record<number, MilestoneInfo> = {
  1: {
    title: '유치원 입학 준비',
    options: [
      { id: 'books', name: '그림책과 친해지기', desc: '글자를 하나둘 알아가요', effect: { growth: 2, happy: 1 } },
      { id: 'play', name: '동네 친구들과 뛰놀기', desc: '친구가 생겨요', effect: { network: 2, happy: 1 } },
      { id: 'rest', name: '엄마 아빠 품에서 쉬기', desc: '푹 쉬고 든든하게', effect: { happy: 2, stamina: 3 } },
    ],
  },
  2: {
    title: '초등학교 졸업',
    options: [
      { id: 'study', name: '공부에 집중하기', desc: '성적이 쑥쑥', effect: { growth: 3 } },
      { id: 'sports', name: '운동·예체능 도전', desc: '몸도 마음도 튼튼', effect: { happy: 2, network: 1, stamina: 2 } },
      { id: 'friends', name: '친구들과 우정 다지기', desc: '평생 갈 친구', effect: { network: 3 } },
    ],
  },
  3: {
    title: '중학교 졸업 — 진로를 정해요',
    options: [
      { id: 'academic', name: '일반 고등학교 진학', desc: '대학을 목표로', effect: { growth: 3 } },
      { id: 'tech', name: '기술을 배우는 학교', desc: '일찍 기술을 익혀요', effect: { growth: 2, asset: 1 } },
      { id: 'dream', name: '꿈을 찾아 떠나는 여행', desc: '시간을 갖고 고민해요', effect: { happy: 3, network: 1 } },
    ],
  },
  4: {
    title: '고등학교 졸업 — 대학이냐, 취업이냐',
    options: [
      { id: 'univ', name: '대학 진학', desc: '배움을 더 깊이', effect: { growth: 3, asset: -1 } },
      { id: 'job', name: '바로 취업 준비', desc: '일찍 사회로 (용돈벌이)', effect: { asset: 2, growth: 1 } },
      { id: 'startup', name: '창업·프리랜서에 도전', desc: '성공하면 크지만 운이 필요해요', effect: { asset: 3, growth: 1 }, dc: 4, fail: { asset: -1, growth: 1 } },
    ],
  },
  5: {
    title: '독립 — 어른으로의 첫걸음',
    options: [
      { id: 'love', name: '연애하고 결혼하기', desc: '인연은 노력만으로는 안 돼요 (주사위)', effect: { happy: 3, network: 2, life: { partner: true } }, dc: 3, fail: { happy: -1 }, requires: { noPartner: true } },
      { id: 'together', name: '함께하는 시간 가꾸기', desc: '소중한 사람과 함께', effect: { happy: 2, network: 1 }, requires: { partner: true } },
      { id: 'career', name: '커리어 쌓기', desc: '일과 배움에 몰두해요', effect: { growth: 2, asset: 2 } },
      { id: 'solo', name: '혼자 떠나는 세계 여행', desc: '견문을 넓혀요', effect: { happy: 3, growth: 1, asset: -1 } },
    ],
  },
  6: {
    title: '인생의 중반 — 무엇을 가꿀까',
    options: [
      { id: 'home', name: '내 집 마련', desc: '원래 있는 집을 사거나 직접 지어요 (💰2 이상 필요)', effect: {}, action: 'house', requires: { noHome: true, minAsset: 2 } },
      { id: 'child', name: '아이를 맞이하기', desc: '가정을 꾸려요 (주사위)', effect: { happy: 3, asset: -1, life: { children: 1 } }, dc: 3, fail: { happy: 1 }, requires: { partner: true, childrenLt: 2 } },
      { id: 'promo', name: '승진·이직에 도전', desc: '연봉이 오르면 월급이 +1 (주사위)', effect: { growth: 1, life: { raise: 1 } }, dc: 3, fail: { growth: 1 }, requires: { career: true } },
      { id: 'family', name: '가족과 보내는 시간', desc: '쉬며 재충전', effect: { happy: 2, network: 1, stamina: 2 } },
    ],
  },
  7: {
    title: '은퇴 준비',
    options: [
      { id: 'saving', name: '노후 자금 마련', desc: '든든한 노후', effect: { asset: 3 } },
      { id: 'late-home', name: '내 집 마련', desc: '늦었지만 집을 사거나 직접 지어요 (💰2 이상 필요)', effect: {}, action: 'house', requires: { noHome: true, minAsset: 2 } },
      { id: 'support', name: '자녀의 독립 돕기', desc: '자식 농사의 마무리', effect: { happy: 2, network: 1, asset: -1 }, requires: { children: 1 } },
      { id: 'health', name: '건강 챙기기', desc: '운동과 검진', effect: { stamina: 3, happy: 1 } },
      { id: 'hobby', name: '새 취미·배움', desc: '제2의 청춘', effect: { growth: 2, happy: 1 } },
    ],
  },
  8: {
    title: '은퇴 — 새로운 하루',
    options: [
      { id: 'travel', name: '여행하며 은퇴 생활', desc: '그동안 못 가본 곳으로', effect: { happy: 3, stamina: -1, asset: -1 } },
      { id: 'volunteer', name: '봉사·마을 활동', desc: '이웃과 함께', effect: { network: 3, happy: 1 } },
      { id: 'grand', name: '손주 돌보기', desc: '손주가 태어났어요 (주사위)', effect: { happy: 3, network: 1, life: { grandchildren: 1 } }, dc: 3, fail: { happy: 1 }, requires: { children: 1, grandchildrenLt: 2 } },
      { id: 'garden', name: '텃밭 가꾸기', desc: '느긋하게', effect: { happy: 1, growth: 1, stamina: 2 } },
    ],
  },
  9: {
    title: '고희 잔치',
    options: [
      { id: 'gathering', name: '가족·친지 모임', desc: '모두 모여 웃어요', effect: { happy: 3, network: 2 }, requires: { family: true } },
      { id: 'memoir', name: '자서전 쓰기', desc: '인생을 글로 남겨요', effect: { growth: 3, happy: 1 } },
      { id: 'friends', name: '옛 친구 찾아가기', desc: '오랜만의 만남', effect: { network: 3, stamina: -1 } },
    ],
  },
};

/** 구간(나이)별 체력 상한 */
export function staminaCapFor(cap: number[], zone: number): number {
  return cap[Math.max(0, Math.min(cap.length - 1, zone - 1))]!;
}

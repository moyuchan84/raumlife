import type { Effect, LifeState } from '../types';

/** 라이프처럼 정해진 직업과 월급. 섬을 옮길 때마다 월급을 받는다. 높은 월급은 학력(성장)이 필요하다. */
export interface Job {
  id: string;
  name: string;
  icon: string;
  /** 섬을 옮길 때마다 받는 💰 */
  salary: number;
  /** 필요한 🌱성장 (학력·자격) */
  minGrowth: number;
  /** 월급날에 함께 얻는 것 (직업의 보람) */
  perk: Effect;
  perkText: string;
}

export const JOBS: Job[] = [
  { id: 'artist', name: '예술가', icon: '🎨', salary: 1, minGrowth: 0, perk: { happy: 1, network: 1 }, perkText: '월급은 적지만 보람과 인맥이 쌓여요' },
  { id: 'farmer', name: '농부', icon: '🌾', salary: 2, minGrowth: 0, perk: { happy: 1 }, perkText: '자연과 함께하는 여유' },
  { id: 'cook', name: '요리사', icon: '🍳', salary: 2, minGrowth: 0, perk: { network: 1 }, perkText: '단골손님이 생겨요' },
  { id: 'firefighter', name: '소방관', icon: '🚒', salary: 3, minGrowth: 4, perk: { happy: 1 }, perkText: '사람을 구하는 보람' },
  { id: 'office', name: '회사원', icon: '💼', salary: 3, minGrowth: 5, perk: {}, perkText: '안정적인 월급' },
  { id: 'teacher', name: '교사', icon: '📚', salary: 3, minGrowth: 6, perk: { growth: 1 }, perkText: '가르치며 함께 배워요' },
  { id: 'nurse', name: '간호사', icon: '🩺', salary: 3, minGrowth: 6, perk: { network: 1 }, perkText: '많은 사람을 만나요' },
  { id: 'developer', name: '개발자', icon: '💻', salary: 4, minGrowth: 8, perk: {}, perkText: '높은 연봉' },
  { id: 'lawyer', name: '변호사', icon: '⚖️', salary: 5, minGrowth: 10, perk: {}, perkText: '아주 높은 연봉' },
  { id: 'doctor', name: '의사', icon: '🏥', salary: 5, minGrowth: 10, perk: { network: 1 }, perkText: '높은 연봉과 존경' },
];

export const JOB_BY_ID = new Map(JOBS.map((j) => [j.id, j]));

/** 지금 받는 월급 (직업 월급 + 승진으로 오른 만큼) */
export function salaryOf(life: LifeState): number {
  const j = life.jobId ? JOB_BY_ID.get(life.jobId) : undefined;
  return j ? j.salary + life.raise : 0;
}

/** 은퇴(노년) 후에는 월급 대신 연금 (월급의 절반, 올림) */
export function pensionOf(life: LifeState): number {
  return Math.ceil(salaryOf(life) / 2);
}

/** 직업 선택지: 조건 없는 직업 1개는 항상 포함하고 나머지는 무작위 3개 */
export function jobOffer(pick: (n: number) => number, growth: number): { job: Job; enabled: boolean }[] {
  const free = JOBS.filter((j) => j.minGrowth === 0);
  const rest = JOBS.filter((j) => j.minGrowth > 0);
  const chosen: Job[] = [free[pick(free.length)]!];
  const pool = [...rest, ...free.filter((j) => j !== chosen[0])];
  while (chosen.length < 4 && pool.length) {
    const i = pick(pool.length);
    chosen.push(pool.splice(i, 1)[0]!);
  }
  return chosen
    .sort((a, b) => a.salary - b.salary || a.minGrowth - b.minGrowth)
    .map((job) => ({ job, enabled: growth >= job.minGrowth }));
}

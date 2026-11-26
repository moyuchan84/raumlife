/**
 * 자기대전 시뮬레이터.
 *   npm run sim -- --games 2000 --players 4 --start 1 --end 10 --difficulty normal --bots greedy,greedy,rusher,builder
 */
import { Game, ZONES, goalLabel } from '../engine';
import type { Difficulty, GameConfig, GameResult } from '../engine';
import { createBot } from '../ai/bots';

interface Args {
  games: number;
  players: number;
  start: number;
  end: number;
  difficulty: Difficulty;
  bots: string[];
  seed: number;
  teams: boolean;
  json: boolean;
  tuning: Record<string, number | number[]>;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    games: 1000,
    players: 4,
    start: 1,
    end: 10,
    difficulty: 'normal',
    bots: [],
    seed: 1,
    teams: false,
    json: false,
    tuning: {},
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    const v = argv[i + 1];
    switch (k) {
      case '--games': a.games = Number(v); i++; break;
      case '--players': a.players = Number(v); i++; break;
      case '--start': a.start = Number(v); i++; break;
      case '--end': a.end = Number(v); i++; break;
      case '--difficulty': a.difficulty = v as Difficulty; i++; break;
      case '--bots': a.bots = v!.split(','); i++; break;
      case '--seed': a.seed = Number(v); i++; break;
      case '--teams': a.teams = true; break;
      case '--json': a.json = true; break;
      case '--tune': {
        const [key, val] = v!.split('=');
        a.tuning[key!] = val!.includes(',') ? val!.split(',').map(Number) : Number(val);
        i++;
        break;
      }
    }
  }
  if (a.bots.length === 0) a.bots = Array(a.players).fill('greedy');
  if (a.bots.length !== a.players) {
    // 봇 목록이 짧으면 순환해서 채운다
    a.bots = Array.from({ length: a.players }, (_, i) => a.bots[i % a.bots.length]!);
  }
  return a;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const f1 = (x: number) => x.toFixed(1);
function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
}

export async function simulate(args: Args) {
  const results: { res: GameResult; game: Game }[] = [];
  for (let g = 0; g < args.games; g++) {
    const seed = args.seed * 100003 + g;
    const config: GameConfig = {
      players: args.players,
      startZone: args.start,
      endZone: args.end,
      difficulty: args.difficulty,
      seed,
      tuning: args.tuning as never,
      ...(args.teams ? { teams: Array.from({ length: args.players }, (_, i) => i % 2) } : {}),
    };
    const game = new Game(config);
    const ctrls = args.bots.map((b, i) => createBot(b, seed * 7 + i));
    results.push({ res: await game.run(ctrls), game });
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const results = await simulate(args);
  const P = args.players;
  const zones = args.end - args.start + 1;

  const first = results[0]!.game;
  const rounds = results.map((r) => r.res.rounds);
  const playerTurns = results.map((r) => r.res.playerTurns);
  const secPerTurn = first.state.tuning.secondsPerTurn;
  const minutes = playerTurns.map((t) => (t * secPerTurn) / 60);

  const botNames = [...new Set(args.bots)];
  const winBy = new Map<string, number>();
  const scoreBy = new Map<string, number[]>();
  const baseBy = new Map<string, number[]>();
  const arrBy = new Map<string, number>();
  const bySeat = Array(P).fill(0) as number[];
  const seatScore: number[][] = Array.from({ length: P }, () => []);
  const compl: number[][] = [];
  const stats = { asset: [] as number[], happy: [] as number[], network: [] as number[], growth: [] as number[] };
  let countdownEnds = 0;
  let ties = 0;
  const metricSum: Record<string, number> = {};
  const rankOfFinish: number[] = [];
  const byGoal = new Map<string, number[]>();

  for (const { res, game } of results) {
    const w = res.winner;
    bySeat[w]!++;
    const wb = args.bots[w]!;
    winBy.set(wb, (winBy.get(wb) ?? 0) + 1);
    if (res.endedBy === 'countdown') countdownEnds++;
    const top = res.scores.map((s) => s.total).sort((a, b) => b - a);
    if (top.length > 1 && Math.abs(top[0]! - top[1]!) < 1e-9) ties++;
    for (const sc of res.scores) {
      const b = args.bots[sc.playerId]!;
      scoreBy.set(b, [...(scoreBy.get(b) ?? []), sc.total]);
      baseBy.set(b, [...(baseBy.get(b) ?? []), sc.base]);
      seatScore[sc.playerId]!.push(sc.total);
      const p = game.state.players[sc.playerId]!;
      if (p.arrived) arrBy.set(b, (arrBy.get(b) ?? 0) + 1);
      for (const k of ['asset', 'happy', 'network', 'growth'] as const) stats[k].push(p.stats[k]);
      compl.push(sc.completion);
      rankOfFinish.push(sc.base);
    }
    game.state.goals.forEach((g, gi) => {
      const key = g.kind === 'stat' ? `스탯:${g.stat}` : `조건:${g.cond}`;
      for (const sc of res.scores) byGoal.set(key, [...(byGoal.get(key) ?? []), sc.completion[gi]!]);
    });
    for (const [k, v] of Object.entries(res.metrics)) metricSum[k] = (metricSum[k] ?? 0) + v;
  }

  const N = results.length;
  const bases = results.flatMap((r) => r.res.scores.map((s) => s.base));
  const winnerBases = results.map((r) => r.res.scores[r.res.winner]!.base);
  const full = results.flatMap((r) => r.res.scores.map((s) => s.base >= 99.99));

  const out: string[] = [];
  const line = (s = '') => out.push(s);
  line(`═══ 시뮬레이션: ${N}판 · ${P}명 · ${ZONES[args.start - 1]!.name} ~ ${ZONES[args.end - 1]!.name} (${zones}구간) · 난이도 ${args.difficulty} ═══`);
  line(`봇: ${args.bots.join(', ')}`);
  line(`목표 예시(1번 판): ${first.state.goals.map(goalLabel).join(' / ')}`);
  line();
  line('■ 판 길이');
  line(`  라운드  평균 ${f1(mean(rounds))}  (p10 ${quantile(rounds, 0.1)} · 중앙 ${quantile(rounds, 0.5)} · p90 ${quantile(rounds, 0.9)})`);
  line(`  예상 소요 시간(턴당 ${secPerTurn}초 가정)  평균 ${f1(mean(minutes))}분  (p10 ${f1(quantile(minutes, 0.1))} · p90 ${f1(quantile(minutes, 0.9))})`);
  line(`  카운트다운으로 끝난 판 ${pct(countdownEnds / N)}  /  전원 도착으로 끝난 판 ${pct(1 - countdownEnds / N)}`);
  line();
  line('■ 점수 분포');
  line(`  전체 평균 달성률 ${f1(mean(bases))}  ·  승자 평균 ${f1(mean(winnerBases))}  ·  100% 달성 비율 ${pct(full.filter(Boolean).length / full.length)}`);
  line(`  1·2위 동점 ${pct(ties / N)}`);
  line(`  평균 최종 스탯: 자산 ${f1(mean(stats.asset))} · 행복 ${f1(mean(stats.happy))} · 인맥 ${f1(mean(stats.network))} · 성장 ${f1(mean(stats.growth))}`);
  line();
  line('■ 목표 종류별 평균 달성률 (균형 점검용)');
  for (const [k, v] of [...byGoal.entries()].sort()) line(`  ${k.padEnd(24)} ${pct(mean(v))}   (등장 ${v.length / P}회)`);
  line();
  line('■ 봇별 성적');
  for (const b of botNames) {
    const seats = args.bots.filter((x) => x === b).length;
    const expected = (seats / P) * N;
    const wins = winBy.get(b) ?? 0;
    line(`  ${b.padEnd(8)} 승 ${String(wins).padStart(5)}  (기대 ${f1(expected)} 대비 ${(wins / expected).toFixed(2)}배)  평균점수 ${f1(mean(scoreBy.get(b) ?? []))} (달성률만 ${f1(mean(baseBy.get(b) ?? []))})  도착률 ${pct((arrBy.get(b) ?? 0) / ((scoreBy.get(b) ?? []).length || 1))}`);
  }
  line();
  line('■ 자리(턴 순서) 편향');
  line('  ' + bySeat.map((w, i) => `P${i + 1}: ${pct(w / N)}`).join('  ') + `   (공평 ${pct(1 / P)})`);
  line('  ' + seatScore.map((v, i) => `P${i + 1}: ${f1(mean(v))}`).join('  ') + '   ← 평균 점수');
  line();
  line('■ 행동 통계 (게임당 평균)');
  const per = (k: string) => f1((metricSum[k] ?? 0) / N);
  line(`  도전 시도 ${per('challengeTried')} (성공 ${per('challengeWon')}) · 안전 선택 ${per('safeChosen')} · 재굴림 ${per('rerolls')}`);
  line(`  지름길 ${per('shortcuts')} · 둘레길 ${per('longRoutes')} · 탈진 ${per('exhausts')}`);
  line(`  진로 선택 ${per('pathTaken')} (자리 마감으로 못 고른 ${per('pathAllFull')}) · 보금자리 구매 ${per('lodgeBought')}`);
  line(`  방해 ${per('sabotages')} · 정상 바람 ${per('winds')} · 후발 CP 지급 ${per('catchUpCp')} · 마일스톤 보너스 ${per('milestoneBonus')}`);
  line();
  line('■ 칸 도착 횟수 (게임당)');
  line('  ' + ['journey', 'activity', 'trouble', 'camp', 'path', 'lodge', 'weather', 'milestone'].map((t) => `${t} ${per('tile:' + t)}`).join(' · '));
  if (args.teams) {
    const tw = new Map<number, number>();
    for (const { res } of results) tw.set(res.winningTeam!, (tw.get(res.winningTeam!) ?? 0) + 1);
    line();
    line('■ 팀전 (홀짝 좌석 2팀)');
    line('  ' + [...tw.entries()].map(([t, w]) => `팀${t}: ${pct(w / N)}`).join('  '));
  }
  console.log(out.join('\n'));
}

if (process.argv[1]?.includes('simulate')) main();

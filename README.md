# 인생 등산 (가칭)

공통 인생 목표를 놓고 3D 산을 오르는 온라인 보드게임. 설계는 [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md).

현재는 **Phase 0**: 규칙 엔진, AI 봇, 자기대전 시뮬레이터, 밸런스 테스트까지 구현되어 있다. UI와 서버는 아직 없다.

## 구조

| 경로 | 내용 |
|---|---|
| `src/engine` | 규칙 엔진 (순수 로직, 시드 기반 난수). 서버·AI·시뮬레이터가 같은 코드를 쓴다 |
| `src/engine/data` | 구간(10), 여정 카드, 날씨 카드 데이터 |
| `src/ai` | 봇: `random`, `greedy`, `rusher`, `builder`, `brawler` |
| `src/sim` | 자기대전 시뮬레이터 CLI |
| `test` | 단위 테스트 + 밸런스 회귀 테스트 |

## 실행

```bash
npm install
npm test            # 단위 + 밸런스 테스트
npm run typecheck

# 시뮬레이션 (옵션은 모두 선택)
npm run sim -- --games 2000 --players 4 --start 1 --end 10 --difficulty normal \
               --bots greedy,rusher,builder,brawler
npm run sim -- --players 6 --teams                # 3v3 팀전
npm run sim -- --tune perZoneGain=1.4 --tune arrivalBonus=3,2,1   # 튜닝값 덮어쓰기
```

시뮬레이터는 판 길이, 점수 분포, 봇별 승률, 자리 편향, 목표 종류별 달성률, 행동 통계를 출력한다.

## 엔진 사용 예

```ts
import { Game } from './src/engine';
import { createBot } from './src/ai/bots';

const game = new Game({ players: 4, startZone: 1, endZone: 3, difficulty: 'normal', seed: 7 });
const result = game.run([0, 1, 2, 3].map((i) => createBot('greedy', i)));
console.log(result.winner, result.scores);
```

플레이어(사람/AI)는 `Controller` 인터페이스(`src/engine/controller.ts`)로 결정을 내린다. 지금은 동기 방식이고, 온라인 서버에서는 같은 결정 목록을 메시지로 바꿔 쓴다.

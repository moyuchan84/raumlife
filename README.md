# 인생 등산 (가칭)

공통 인생 목표를 놓고 3D 산을 오르는 온라인 보드게임. 설계는 [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md).

현재 상태: **Phase 0**(규칙 엔진·AI·시뮬레이터), **Phase 1**(온라인 멀티플레이 서버 + 웹 화면), **Phase 2**(3D 보드)까지 구현되어 있다.

## 구조

| 경로 | 내용 |
|---|---|
| `src/engine` | 규칙 엔진 (순수 로직, 시드 기반 난수). 서버·AI·시뮬레이터가 같은 코드를 쓴다 |
| `src/engine/data` | 구간(10), 여정 카드, 날씨 카드 데이터 |
| `src/ai` | 봇: `random`, `greedy`, `rusher`, `builder`, `brawler` |
| `src/sim` | 자기대전 시뮬레이터 CLI |
| `src/shared` | 서버·클라이언트가 공유하는 메시지 프로토콜 |
| `src/server` | 방/대기실/게임 진행 서버 (WebSocket) |
| `src/client` | 브라우저 화면: 3D 보드(Three.js), 2D 보드(캔버스), 로비·결정 UI(DOM) |
| `test` | 단위 테스트 + 밸런스 회귀 + 서버 통합 테스트 |
| `scripts` | 클라이언트 빌드, 브라우저 스모크 테스트 |

## 플레이하기

```bash
npm install
npm start           # 클라이언트 빌드 후 서버 실행 → http://localhost:3000
```

방을 만들고 코드를 친구에게 알려 주면 최대 6명(봇 포함)이 함께 할 수 있다. 같은 네트워크의 다른 기기는 `http://<내 IP>:3000` 으로 접속한다.
환경변수: `PORT`(기본 3000), `PACE`(연출 속도 배율, 기본 1, 0 이면 즉시 진행).

- 게임 화면은 기본이 **3D**(나선형 산). 위쪽의 버튼으로 2D 보기로 바꿀 수 있고, WebGL 을 못 쓰면 자동으로 2D 가 된다. 3D 에서는 마우스 드래그로 돌리고 휠로 확대/축소할 수 있으며, 손을 떼고 5초 뒤에 다시 현재 차례의 말을 따라간다.
- 서버가 규칙을 판정한다(클라이언트는 입력만 보냄). 다른 사람의 정확한 스탯은 진행 중 전송되지 않는다.
- 결정 시간이 지나거나 연결이 끊기면 봇이 대신 결정한다. 같은 브라우저로 다시 접속하면 같은 자리로 돌아온다.
- 방은 서버 메모리에만 있다. 서버를 재시작하면 사라진다.

## 개발

```bash
npm test            # 단위 + 밸런스 + 서버 통합 테스트
npm run typecheck
npm run build:client

# 브라우저 스모크 테스트 (Playwright 필요)
PACE=0.15 PORT=3111 npm run server &
URL=http://localhost:3111 node scripts/e2e-smoke.cjs

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

플레이어(사람/AI)는 `Controller` 인터페이스(`src/engine/controller.ts`)로 결정을 내린다. 봇은 동기, 사람은 비동기(네트워크 응답 대기)로 구현되어 있고, 엔진은 `onEvent` 로 진행 이벤트를 내보내 화면 연출에 쓴다.

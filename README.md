# Auto Stock

Node.js 기반 자동매매 전략 모음 프로젝트입니다.

현재 저장소는 여러 전략을 `strategies/` 아래에서 분리해 관리하고, 토스증권 OpenAPI 연동에 필요한 공통 유틸은 `shared/`에서 함께 사용합니다. 실거래 자동화보다 dry-run, 주문계획 생성, 상태 동기화, 안전장치 검증을 먼저 두는 구조입니다.

## 폴더 구조

```text
docs/
  toss-openapi.json
shared/
  logger.js
  orderBuilder.js
  paperBroker.js
  risk.js
  tossClient.js
  utils.js
strategies/
  infinite_buying/
  toss-etf-ma20-3pct-trader/
```

- `docs/`: 토스 OpenAPI 등 프로젝트 공통 참고 문서
- `shared/`: 여러 전략에서 재사용하는 공통 클라이언트, 로거, 주문/리스크 유틸
- `strategies/`: 전략별 코드, 문서, 테스트

## 전략 목록

| 전략 | 설명 | 문서 |
|---|---|---|
| `infinite_buying` | 무한매수 V4 기반 TQQQ MVP 전략. 주문계획, paper 주문 기록, reconcile 골격 포함 | [README](strategies/infinite_buying/README.md) |
| `toss-etf-ma20-3pct-trader` | ETF MA20 3% 조건 기반 토스 OpenAPI 자동매매 전략 | [README](strategies/toss-etf-ma20-3pct-trader/README.md) |

## 빠른 시작

```bash
npm install
npm test
```

무한매수 주문계획 예시:

```bash
npm run infinite:plan -- --symbol TQQQ --currentPrice 50 --previousClose 51 --averagePrice 49 --holdingQuantity 10 --cash 5000 --minutesUntilClose 120 --currentRound 8.6
```

MA20 dry-run 예시:

```bash
npm run ma20:dry-run:signal
```

## npm Scripts

| 명령 | 설명 |
|---|---|
| `npm run infinite:plan` | 무한매수 주문계획 생성 |
| `npm run infinite:trade` | 무한매수 주문계획 생성 후 `--confirm` 시 paper 주문 기록 |
| `npm run infinite:reconcile` | 무한매수 상태 동기화 |
| `npm run infinite:auto` | 무한매수 자동 실행 스캐폴드 |
| `npm run infinite:backtest` | 무한매수 백테스트 스캐폴드 |
| `npm run ma20:signal` | MA20 전략 신호 생성 |
| `npm run ma20:order` | MA20 전략 주문 실행 |
| `npm run ma20:dry-run:signal` | MA20 전략 dry-run 신호 생성 |
| `npm run ma20:dry-run:order` | MA20 전략 dry-run 주문 실행 |
| `npm test` | 무한매수 전략 테스트 실행 |

## 환경변수

`.env.example`을 참고해 `.env`를 설정합니다.

```env
TOSS_CLIENT_ID=
TOSS_CLIENT_SECRET=
TOSS_API_BASE_URL=https://openapi.tossinvest.com
TOSS_ACCOUNT_SEQ=

TRADING_MODE=paper
ENABLE_AUTO_ORDER=false
LIVE_CONFIRM=NO
```

전략별 환경변수는 각 전략 README를 확인하세요.

## 안전 원칙

- 실거래는 기본 비활성화합니다.
- 주문 전 dry-run 또는 주문계획 확인을 먼저 수행합니다.
- `ENABLE_AUTO_ORDER=true`와 `LIVE_CONFIRM=YES` 없이는 실거래 경로를 열지 않습니다.
- API 키, access token, client secret은 로그에 남기지 않습니다.
- 브로커 상태와 내부 상태가 불일치하면 자동매매를 중단하는 방향으로 설계합니다.
- `strategies/*/data`, `strategies/*/logs`는 실행 중 생성되는 로컬 데이터이며 Git에 커밋하지 않습니다.

## 현재 구현 단계

`infinite_buying`은 MVP Phase 1 중심입니다.

- 구현됨: 전략 계산, 주문계획 생성, NO_TOUCH 정책, 리스크 필터 일부, paper 주문 기록, reconcile 골격
- 진행 예정: 토스 OpenAPI 실시간 조회 연동, 실거래 주문 전송, 스케줄러, 백테스트, SOXL 확장

`toss-etf-ma20-3pct-trader`는 기존 MA20 전략 구현입니다. 자세한 실행 방식과 운영 주의사항은 전략별 README를 확인하세요.

## 경로 안내

현재 전략 경로는 루트의 `infinite_buying/`가 아니라 `strategies/infinite_buying/`입니다. 이전 경로를 열고 있다면 IDE 탭을 새 경로로 다시 열어 주세요.

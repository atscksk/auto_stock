# toss-etf-ma20-3pct-trader

토스증권 OpenAPI를 사용해 국내 ETF 1종목에 대해 하루 1회 `ETF 20일 이동평균 + 3% 여유 전략`을 실행하는 Node.js 20+ ES Module CLI 스크립트입니다.

기본 종목은 `069500`, 기본 실행 모드는 `DRY_RUN`입니다.

## 빠른 사용법

`auto_stock` 루트에서 아래 순서로 실행합니다.

```bash
npm install
```

루트에 `.env` 파일을 만들고 토스 OpenAPI 키를 넣습니다.

```env
TOSS_CLIENT_ID=토스에서_받은_client_id
TOSS_CLIENT_SECRET=토스에서_받은_client_secret

MODE=DRY_RUN
LIVE_CONFIRM=NO

SYMBOL=069500
ORDER_BUDGET_KRW=300000

# 선택: DRY_RUN에서만 매수 가능 금액을 임의로 가정합니다.
DRY_RUN_BUYING_POWER_KRW=1000000
```

신호 계산 job을 실행합니다.

```bash
node toss-etf-ma20-3pct-trader/signal.js
```

또는 npm script를 사용할 수 있습니다.

```bash
npm run ma20:dry-run:signal
```

처음에는 `MODE=DRY_RUN` 상태로 실행하세요. signal job은 실제 주문 API를 호출하지 않고, 신호와 주문 계획만 로그에 저장합니다.

DRY_RUN에서 실제 계좌의 매수 가능 금액과 상관없이 테스트하고 싶다면 `DRY_RUN_BUYING_POWER_KRW`를 설정하세요. 예를 들어 `DRY_RUN_BUYING_POWER_KRW=1000000`이면 risk check에서 매수 가능 금액을 100만 원으로 가정합니다. 이 값은 `MODE=LIVE`에서는 사용되지 않습니다.

주문 계획을 실행하는 order job은 별도로 실행합니다.

```bash
node toss-etf-ma20-3pct-trader/order.js
```

또는:

```bash
npm run ma20:dry-run:order
```

## 실행하면 하는 일

프로그램은 계속 떠 있는 데몬이 아니라, 실행하면 한 번 동작하고 종료되는 CLI입니다.

signal job은 아래 순서로 동작합니다.

1. `.env` 설정을 읽습니다.
2. 토스 OpenAPI access token을 발급합니다.
3. 계좌 목록을 조회하고 첫 번째 계좌를 선택합니다.
4. `SYMBOL`의 일봉 40개를 조회합니다.
5. 최근 20개 종가로 MA20을 계산합니다.
6. `BUY`, `SELL`, `HOLD` 신호를 판단합니다.
7. 현재 보유 수량을 조회합니다.
8. portfolio 스냅샷을 저장합니다.
9. 주문 후보가 있으면 `order-plans.jsonl`에 주문 계획을 저장합니다.
10. 실제 주문 API는 호출하지 않습니다.

order job은 아래 순서로 동작합니다.

1. `order-plans.jsonl`에서 실행 가능한 주문 계획을 찾습니다.
2. 계좌, 보유 수량, 매수 가능 금액을 다시 조회합니다.
3. risk check를 다시 수행합니다.
4. `DRY_RUN`이면 가상 주문을 `orders.jsonl`에 저장합니다.
5. `LIVE`이고 모든 안전 조건을 통과한 경우에만 실제 주문 API를 호출합니다.

## 콘솔 출력 예시

콘솔에는 최종 결과 위주로 한 줄이 출력됩니다. 자세한 계산값은 로그 파일에 저장됩니다.

설정이 부족하면:

```text
Error: Required environment variable is missing: TOSS_CLIENT_ID
```

주문 조건이 아니면:

```text
No order: HOLD signal.
```

이미 보유 중이라 매수를 막으면:

```text
No order: Position already exists.
```

미보유라 매도를 막으면:

```text
No order: No position to sell.
```

signal job에서 주문 후보가 생기면:

```text
Order plan saved: ma20-069500-20260619-BUY
```

order job이 DRY_RUN 주문 계획을 실행하면:

```text
DRY_RUN planned paper order saved: ma20-069500-20260619-BUY
```

같은 날짜, 같은 종목, 같은 방향의 주문이 이미 있으면:

```text
No order: duplicate clientOrderId ma20-069500-20260619-BUY
```

LIVE 주문이 실제 완료되면:

```text
LIVE planned order completed: ma20-069500-20260619-BUY
```

## 결과 확인

실행 결과는 전략 폴더 아래 로그에서 확인합니다.

```text
toss-etf-ma20-3pct-trader/logs/signals.jsonl
toss-etf-ma20-3pct-trader/logs/order-plans.jsonl
toss-etf-ma20-3pct-trader/logs/orders.jsonl
toss-etf-ma20-3pct-trader/logs/portfolio.jsonl
toss-etf-ma20-3pct-trader/logs/errors.jsonl
```

각 파일의 의미는 다음과 같습니다.

- `signals.jsonl`: MA20, 종가, 매수선, 매도선, 최종 신호
- `order-plans.jsonl`: signal job이 저장한 다음 거래일 주문 계획
- `orders.jsonl`: DRY_RUN 가상 주문 또는 LIVE 실제 주문 결과
- `portfolio.jsonl`: 보유 수량, 평가금액, 매입금액, 평가손익, 수익률
- `errors.jsonl`: 설정 오류, API 오류, 주문 차단 오류

## 저장소 구조

여러 전략이 같은 토스 API 클라이언트와 운영 코드를 함께 사용할 수 있도록 공통 코드는 `auto_stock/shared`에 둡니다. 개별 전략 폴더에는 실행 진입점과 전략 전용 코드만 둡니다.

```text
auto_stock/
├── package.json
├── .env.example
├── docs/
│   └── toss-openapi.json
├── shared/
│   ├── tossClient.js
│   ├── logger.js
│   ├── utils.js
│   ├── paperBroker.js
│   ├── risk.js
│   └── orderBuilder.js
└── toss-etf-ma20-3pct-trader/
    ├── signal.js
    ├── order.js
    ├── main.js
    ├── README.md
    └── src/
        ├── main.js
        ├── config.js
        └── strategy.js
```

## 투자 위험 고지

이 프로그램은 투자 수익을 보장하지 않습니다. 자동매매는 손실, 주문 거부, 미체결, 부분 체결, API 장애, 잘못된 설정, 중복 실행 등의 위험이 있습니다.

실제 주문 전 최소 2~4주 이상 `DRY_RUN`으로 신호와 주문 후보를 검증하는 것을 권장합니다. 레버리지 ETF와 인버스 ETF에는 사용하지 않는 것을 권장합니다.

## OpenAPI 문서

토스증권 OpenAPI 문서는 루트 공통 위치에 둡니다.

```text
docs/toss-openapi.json
```

구현은 PRD보다 OpenAPI 문서를 우선합니다. API 호출 형식, 응답 구조, 필수 헤더, enum, 에러 형식은 이 문서를 기준으로 합니다.

사용하는 주요 API는 다음과 같습니다.

- `POST /oauth2/token`
- `GET /api/v1/accounts`
- `GET /api/v1/candles`
- `GET /api/v1/holdings`
- `POST /api/v1/orders`
- `GET /api/v1/buying-power`
- `GET /api/v1/sellable-quantity`
- `GET /api/v1/market-calendar/KR`

## LIVE 모드

실제 주문은 order job에서 아래 조건이 모두 충족될 때만 호출됩니다.

- `MODE=LIVE`
- `LIVE_CONFIRM=YES`
- risk check 통과
- 주문 수량이 0보다 큼
- 같은 `clientOrderId`가 주문 로그에 없음

signal job은 `MODE=LIVE`여도 실제 주문 API를 호출하지 않습니다. `shared/tossClient.js`의 `createOrder()`에도 마지막 안전장치가 있어 위 조건을 만족하지 않으면 실제 주문 API 호출을 차단합니다.

## 전략 설명

일봉 캔들은 다음 조건으로 조회합니다.

```text
GET /api/v1/candles?symbol=069500&interval=1d&count=40&adjusted=true
```

캔들은 `timestamp` 기준 오름차순으로 정렬합니다. 최근 20개 `closePrice`의 평균을 MA20으로 계산합니다.

- `close >= MA20 * 1.03`: `BUY`
- `close <= MA20 * 0.97`: `SELL`
- 그 외: `HOLD`

매수 수량은 `floor(ORDER_BUDGET_KRW / price)`로 계산합니다. 국내 ETF는 quantity 기반 주문만 사용하며 `orderAmount`는 사용하지 않습니다.

지정가 주문 가격은 초기 버전에서 최근 종가를 단순 반올림합니다.

TODO: 실제 LIVE 운용 전 국내 호가 단위 보정 로직을 적용해야 합니다.

## 안전장치

- 기본 `MODE=DRY_RUN`
- signal job에서는 실제 주문 API 호출 금지
- `DRY_RUN` order job에서는 실제 주문 API 호출 금지
- `LIVE`에서는 `LIVE_CONFIRM=YES` 필수
- 이미 보유 중이면 `BUY` 주문 없음
- 미보유면 `SELL` 주문 없음
- 주문 수량이 0 이하이면 주문 없음
- API 오류, 토큰 실패, 캔들 부족, 계좌 조회 실패, 보유 수량 조회 실패 시 주문 없음
- 같은 날짜, 같은 symbol, 같은 side의 `clientOrderId` 중복 주문 차단
- `429` 응답은 즉시 재시도하지 않고 에러 처리

## cron 예시

DRY_RUN 검증 단계에서는 signal job만 하루 1회 실행해도 됩니다.

```cron
40 15 * * 1-5 cd /path/to/auto_stock && /usr/bin/node toss-etf-ma20-3pct-trader/signal.js
```

LIVE 운영 단계에서는 signal job과 order job을 나눠 실행하는 것을 권장합니다.

```cron
40 15 * * 1-5 cd /path/to/auto_stock && /usr/bin/node toss-etf-ma20-3pct-trader/signal.js
5 9 * * 1-5 cd /path/to/auto_stock && /usr/bin/node toss-etf-ma20-3pct-trader/order.js
```

## 전략 함수 샘플

실제 API 호출 없이 `strategy.js`만 확인할 수 있습니다.

```js
import { ma20Strategy } from './toss-etf-ma20-3pct-trader/src/strategy.js';

const base = Array.from({ length: 20 }, (_, i) => ({
  timestamp: `2026-01-${String(i + 1).padStart(2, '0')}T09:00:00+09:00`,
  closePrice: '100'
}));

console.log(ma20Strategy([...base.slice(0, 19), { ...base[19], closePrice: '104' }]).signal); // BUY
console.log(ma20Strategy([...base.slice(0, 19), { ...base[19], closePrice: '96' }]).signal); // SELL
console.log(ma20Strategy([...base.slice(0, 19), { ...base[19], closePrice: '100' }]).signal); // HOLD
```

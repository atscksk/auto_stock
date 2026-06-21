# Infinite Buying V4 Auto Trader

무한매수 V4 전략 문서와 PRD를 기반으로 만든 TQQQ 자동매매 MVP입니다.

현재 구현 범위는 전략 계산기, 주문계획 생성, paper 주문 기록, 장마감 후 상태 동기화 골격입니다. 실거래 주문 전송은 기본적으로 막혀 있으며, dry-run/반자동 확인 흐름을 먼저 검증하는 용도입니다.

## 실행 전 준비

루트 프로젝트에서 실행합니다.

```bash
npm install
```

환경변수는 `.env`에 설정할 수 있습니다.

```env
TRADING_MODE=paper
ENABLE_AUTO_ORDER=false
LIVE_CONFIRM=NO

IB_SYMBOL=TQQQ
IB_STRATEGY_CAPITAL=10000.00
IB_CASH=5000.00
IB_CURRENT_PRICE=50.00
IB_PREVIOUS_CLOSE=51.00
IB_AVERAGE_PRICE=49.00
IB_HOLDING_QUANTITY=10
IB_AVAILABLE_SELL_QUANTITY=10
IB_CURRENT_ROUND=8.6
IB_MINUTES_UNTIL_CLOSE=120
IB_MARKET_OPEN=true

TOSS_CLIENT_ID=
TOSS_CLIENT_SECRET=
TOSS_API_BASE_URL=https://openapi.tossinvest.com
TOSS_ACCOUNT_SEQ=
```

`TRADING_MODE=paper`가 기본값입니다. `LIVE` 실거래 모드는 `ENABLE_AUTO_ORDER=true`와 `LIVE_CONFIRM=YES`가 함께 있어야만 주문 단계로 넘어가도록 막혀 있습니다.

## 주문계획 확인

주문 전송 없이 전략 계산 결과와 주문 후보를 출력합니다.

```bash
npm run infinite:plan -- --symbol TQQQ
```

CLI 인자로 값을 직접 넣을 수도 있습니다.

```bash
npm run infinite:plan -- --symbol TQQQ --currentPrice 50 --previousClose 51 --averagePrice 49 --holdingQuantity 10 --cash 5000 --minutesUntilClose 120 --currentRound 8.6
```

출력 항목:

```text
[상태]
[평단]
[T]
[별표%]
[별표 매도가]
[15% 보조 매도가]
[NO_TOUCH]
[예상 현금사용]
[매수 주문 후보]
[매도 주문 후보]
[위험 경고]
```

주문계획은 `infinite_buying/logs/order-plans.jsonl`에도 기록됩니다.

## Paper 주문 기록

`--confirm`을 붙이면 생성된 주문 후보를 paper 주문 기록으로 저장합니다.

```bash
npm run infinite:trade -- --symbol TQQQ --confirm --currentPrice 50 --previousClose 51 --averagePrice 49 --holdingQuantity 10 --cash 5000 --minutesUntilClose 120 --currentRound 8.6
```

저장 위치:

```text
infinite_buying/data/orders.json
infinite_buying/logs/orders.jsonl
```

같은 `clientOrderId`는 중복 저장하지 않습니다.

## 장마감 후 동기화

현재 상태와 브로커 상태 역할의 입력값을 비교하고, 차이가 있으면 `MANUAL_HALT` 상태로 저장합니다.

```bash
npm run infinite:reconcile -- --symbol TQQQ --averagePrice 49 --holdingQuantity 10
```

상태 파일은 다음 위치에 저장됩니다.

```text
infinite_buying/data/TQQQ.state.json
```

## 테스트

전략 계산과 주문계획 생성 테스트를 실행합니다.

```bash
npm test
```

현재 테스트 범위:

- T 계산
- 별표% 계산
- 별표 매도가 계산
- 15% 보조 매도가 계산
- 전반전/후반전 상태 판단
- NO_TOUCH 주문 차단
- 주문 후보 생성

## 주요 전략 규칙

- `T = 사이클 누적 매수 체결금액 / 1유닛`
- `1유닛 = 전략자금 / 40`
- `별표% = totalRound - 2 * currentRound`
- `별표 매도가 = 평단 * (1 + 별표% / 100)`
- `15% 보조 매도가 = 직전 장마감 후 확정 평단 * 1.15`
- `currentRound <= totalRound / 2`이면 `NORMAL_FRONT`
- 그 외는 `NORMAL_BACK`

## cutoff 및 NO_TOUCH

기본 설정:

```text
cancelCutoffMinutesBeforeClose = 45
orderCutoffMinutesBeforeClose = 35
noTouchMinutesBeforeClose = 15
```

마감 15분 전 이후에는 신규 주문, 취소, 정정, 중복 재시도를 하지 않습니다.

## 현재 한계

아래 기능은 파일과 명령 골격만 있으며, 실제 브로커 API 연동 또는 시뮬레이션은 다음 단계에서 확장해야 합니다.

- 토스 OpenAPI 실시간 조회 연동
- 실거래 주문 전송
- 자동 스케줄러
- 백테스트
- SOXL 병렬 운용
- 큰수매수와 리버스모드 전체 자동화

## 관련 문서

- 전략 문서: `infinite_buying/docs/infinite_buying_document.md`
- PRD: `infinite_buying/docs/infinite_buying_prd.md`

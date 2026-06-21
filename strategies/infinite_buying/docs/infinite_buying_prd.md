# PRD: 무한매수 V4 자동매매 프로그램

> 제품명: Infinite Buying V4 Auto Trader  
> 구현 언어: JavaScript / Node.js  
> 브로커 연동: 토스증권 OpenAPI  
> 대상 종목: TQQQ MVP, SOXL 2차 확장  
> 문서 버전: v0.2  
> 핵심 변경점: T 소수점 처리, 브로커 상태 동기화, 주문 cutoff, NO_TOUCH 구간, 15% DAY 주문 재생성 정책 반영

---

## 1. 제품 개요

### 1.1 목적

본 제품은 사용자가 제공한 무한매수 V4 전략 자료를 기반으로, 토스증권 OpenAPI를 이용해 미국 ETF를 자동 또는 반자동으로 매매하는 JavaScript 기반 프로그램이다.

초기 목표는 완전 자동 실거래가 아니라 다음 순서의 단계적 개발이다.

```text
전략 계산기
→ 주문표 생성기
→ 페이퍼 트레이딩
→ 반자동 주문
→ 소액 자동매매
→ 실거래 자동화
```

### 1.2 핵심 원칙

```text
1. 브로커 실제 상태를 내부 상태보다 우선한다.
2. 일부 체결과 미체결을 정상 시나리오로 처리한다.
3. 마감 직전 주문 변경을 제한한다.
4. 상태 불일치 시 자동매매를 멈춘다.
5. 실거래 전 dry-run 결과를 반드시 생성한다.
```

---

## 2. 제품 목표

### 2.1 MVP 목표

MVP는 **TQQQ 단일 종목에 대한 주문계획 생성 및 반자동 주문**까지 구현한다.

포함 기능:

```text
- 토스 OpenAPI 인증
- 계좌 조회
- 현재가 조회
- 일봉 조회
- 보유자산 조회
- 주문계획 생성
- dry-run 출력
- 수동 승인 후 주문 전송
- 주문 내역 조회
- 장마감 후 상태 동기화
```

### 2.2 비목표

MVP에서는 다음을 제외한다.

```text
- 완전 자동 실거래 기본 활성화
- SOXL 병렬 운용
- 웹 대시보드
- 모바일 앱
- 모든 원본 전략 예외의 완전 자동 구현
- 큰수매수 기본 활성화
```

---

## 3. 사용자 시나리오

### 3.1 주문계획 확인

```bash
npm run plan -- --symbol TQQQ
```

출력:

```text
[상태] NORMAL_FRONT
[평단] 59.10
[보유수량] 35
[T] 8.6
[★%] 2.8%
[매수 주문 후보]
[매도 주문 후보]
[위험 경고]
```

### 3.2 반자동 주문

```bash
npm run trade -- --symbol TQQQ --confirm
```

흐름:

```text
1. 데이터 조회
2. 브로커 상태 동기화
3. 주문계획 생성
4. dry-run 출력
5. 사용자 승인
6. 주문 전송
7. 주문 결과 저장
```

### 3.3 장마감 후 동기화

```bash
npm run reconcile -- --symbol TQQQ
```

흐름:

```text
1. 주문 내역 조회
2. 체결 내역 조회
3. 보유자산 조회
4. T 재계산
5. 상태 저장
6. 불일치 시 MANUAL_HALT
```

---

## 4. 시스템 아키텍처

### 4.1 디렉터리 구조

```text
src/
  app.js
  config/
    index.js
    strategy.config.js
    risk.config.js
    schedule.config.js
  clients/
    tossClient.js
  services/
    authService.js
    accountService.js
    marketDataService.js
    assetService.js
    orderService.js
    orderHistoryService.js
    marketCalendarService.js
  strategy/
    strategyEngine.js
    stateMachine.js
    calculators.js
    riskFilters.js
    orderPlanner.js
    reconciliation.js
    cutoffPolicy.js
  storage/
    stateStore.js
    orderStore.js
    tradeLogStore.js
    reportStore.js
  jobs/
    preMarketJob.js
    planJob.js
    orderJob.js
    noTouchJob.js
    postMarketJob.js
    reconcileJob.js
  cli/
    plan.js
    trade.js
    auto.js
    reconcile.js
    backtest.js
  utils/
    decimal.js
    logger.js
    time.js
    idempotency.js
```

---

## 5. 토스 OpenAPI 연동 요구사항

### 5.1 인증

OAuth2 Client Credentials 방식으로 access token을 발급한다.

요구사항:

```text
client_id, client_secret은 .env에서 로드
토큰 만료 시 자동 재발급
토큰 재발급 실패 시 주문 중단
토큰과 secret은 로그에 기록 금지
```

환경변수:

```env
TOSS_CLIENT_ID=
TOSS_CLIENT_SECRET=
TOSS_API_BASE_URL=https://openapi.tossinvest.com
TOSS_ACCOUNT_SEQ=
```

### 5.2 필수 API 기능

```text
계좌 목록 조회
보유자산 조회
현재가 조회
일봉 조회
미국장 캘린더 조회
매수 가능 금액 조회
매도 가능 수량 조회
주문 생성
미체결 주문 조회
주문 취소
주문 정정
주문 상세 조회
주문 체결 내역 조회
```

### 5.3 주문 매핑

LOC 주문:

```text
orderType = LIMIT
timeInForce = CLS
```

15% 보조 매도:

```text
orderType = LIMIT
timeInForce = DAY
```

---

## 6. 전략 엔진 요구사항

### 6.1 입력값

```js
{
  symbol,
  currentPrice,
  previousClose,
  averagePrice,
  holdingQuantity,
  availableSellQuantity,
  cash,
  buyingPower,
  strategyCapital,
  unitAmount,
  totalRound,
  currentRound,
  dailyCandles,
  openOrders,
  filledOrders,
  strategyState,
  riskSettings,
  marketCalendar
}
```

### 6.2 출력값

```js
{
  symbol,
  generatedAt,
  state,
  nextState,
  starPercent,
  starPrice,
  buyOrders,
  sellOrders,
  cancelOrders,
  warnings,
  riskLevel,
  expectedCashUsage,
  noTouch,
  manualHaltReason
}
```

---

## 7. T 회차 계산 및 동기화 요구사항

### 7.1 T 정의

T는 주문 횟수나 날짜 수가 아니라 **사이클 누적 매수 체결금액 기준 진행 회차**다.

```text
T = realizedBuyAmountInCycle / unitAmount
```

T는 소수점을 허용한다.

### 7.2 장마감 후 T 재계산

장마감 후 다음 기준으로 T를 재계산한다.

```text
1. 해당 사이클의 실제 매수 체결금액 합산
2. 수수료 포함 여부는 설정값으로 관리
3. T = 누적 매수 체결금액 / 1유닛
4. 소수점 4자리까지 저장
```

설정:

```js
{
  includeFeesInRoundCalculation: false,
  roundPrecision: 4
}
```

### 7.3 일부 체결 처리

```text
일부 체결 시 체결된 금액만 T에 반영한다.
미체결 수량은 T에 반영하지 않는다.
부분 체결 후 나머지 주문이 만료되면 체결분만 기록한다.
```

### 7.4 내부 상태와 브로커 상태 대조

```text
브로커 보유수량 === 내부 보유수량
브로커 평균단가와 내부 평균단가 차이 <= 허용 오차
체결금액 기반 T 계산 가능
미체결 주문 상태 확인 가능
```

불일치 시:

```text
state = MANUAL_HALT
autoOrder = false
```

---

## 8. 핵심 전략 계산

### 8.1 ★% 계산

```js
starPercent = totalRound - 2 * currentRound
```

### 8.2 ★% 가격

```js
starPrice = averagePrice * (1 + starPercent / 100)
```

### 8.3 15% 보조 매도가

```js
limit15Price = confirmedAveragePriceAfterClose * 1.15
```

### 8.4 전반전/후반전

```js
if (currentRound <= totalRound / 2) {
  state = "NORMAL_FRONT"
} else {
  state = "NORMAL_BACK"
}
```

---

## 9. 주문계획 생성 요구사항

### 9.1 주문계획 생성 순서

```text
1. MANUAL_HALT 여부 확인
2. 장 운영 여부 확인
3. NO_TOUCH 구간 여부 확인
4. 브로커 상태 동기화 결과 확인
5. 미체결 주문 확인
6. 보유수량과 현금 확인
7. 위험 필터 적용
8. 매수거부 판단
9. 매도거부 판단
10. 리버스모드 판단
11. 큰수매수 판단
12. 일반모드 매수 계산
13. ★% LOC 매도 계산
14. 15% DAY 보조 매도 계산
15. 매수 가능 금액 및 매도 가능 수량 검증
```

### 9.2 주문 수량

```text
주문 수량은 정수 주 단위
소수점 수량 사용 금지
수량 계산 결과는 내림 처리
수량 0이면 주문 생성 금지
```

### 9.3 주문 가격

```text
가격 계산은 decimal 라이브러리 사용
호가 단위에 맞게 보정
미국주식 가격은 최소 소수점 2자리 처리
```

### 9.4 멱등성

모든 주문에는 clientOrderId를 부여한다.

형식:

```text
{cycleId}-{symbol}-{date}-{side}-{sequence}
```

동일 clientOrderId가 이미 존재하면 재전송하지 않는다.

---

## 10. 주문 cutoff 및 NO_TOUCH 정책

### 10.1 설정값

```js
{
  cancelCutoffMinutesBeforeClose: 45,
  orderCutoffMinutesBeforeClose: 35,
  noTouchMinutesBeforeClose: 15
}
```

### 10.2 시간별 동작

```text
마감 60분 전:
- 1차 주문계획 생성

마감 45분 전:
- 기존 미체결 주문 정리 가능 마지막 구간

마감 35분 전:
- 신규 LOC 주문 제출 가능 마지막 구간

마감 20분 전:
- 주문 접수 여부 확인

마감 15분 전 이후:
- NO_TOUCH
```

### 10.3 NO_TOUCH 금지 작업

```text
신규 주문
주문 취소
주문 정정
중복 재시도
주문계획 변경
```

### 10.4 NO_TOUCH 허용 작업

```text
주문 상태 조회
위험 로그 기록
사용자 알림
```

---

## 11. 15% DAY 보조 매도 관리 요구사항

### 11.1 기본 정책

토스 OpenAPI에서 해외주식 GTC 지원이 명확히 검증되기 전까지 15% 보조 매도는 DAY 주문으로만 처리한다.

### 11.2 재계산 기준

```text
15% 가격은 직전 장마감 후 확정 평균단가 기준으로 계산한다.
장중 추가 매수 체결로 평단이 변해도 당일 즉시 재계산하지 않는다.
다음 거래일 주문 생성 시 재계산한다.
```

### 11.3 기존 주문 처리

```text
기존 15% DAY 주문은 장 종료 후 만료된 것으로 가정한다.
만약 주문 조회 결과 기존 보조 매도 주문이 남아 있으면 취소 후 재주문한다.
취소 가능 cutoff를 지난 경우 취소하지 않고 다음 거래일 reconcile에서 처리한다.
```

### 11.4 우선순위

```text
★% LOC 매도 > 15% DAY 보조 매도
리버스모드 매도 > 15% DAY 보조 매도
NO_TOUCH > 15% 주문 변경
```

---

## 12. 위험관리 요구사항

### 12.1 현금보존

```text
최소 현금 비율 = 20%
초기 권장 현금 비율 = 30%
현금보존선 하회 시 신규 매수 금지
```

### 12.2 종목별 최대 투입

```text
TQQQ 최대 투입 = 전략자금의 50%
SOXL 최대 투입 = 전략자금의 30%
```

MVP는 TQQQ만 사용한다.

### 12.3 추세 필터

```text
TQQQ:
- QQQ가 200일 이동평균 아래면 신규 사이클 금지
- 기존 사이클은 매수 규모 50% 축소

SOXL:
- SOXX 또는 SMH가 200일 이동평균 아래면 신규 사이클 금지
- 기존 사이클은 큰수매수 금지
```

### 12.4 급락 필터

```text
당일 현재가가 전일 종가 대비 -8% 이하:
- 신규 매수 금지
- 하단 LOC 매수 취소
- 매도 주문만 유지
```

### 12.5 평가손실 중단

```text
평가손실 -30%:
- 신규 매수 중단
- 리버스모드 검토

평가손실 -45%:
- MANUAL_HALT
- 사용자 승인 전 주문 금지

평가손실 -60%:
- 자동매매 완전 중지
- 신규 주문 금지
```

---

## 13. 데이터 모델

### 13.1 StrategyState

```js
{
  symbol: "TQQQ",
  state: "NORMAL_FRONT",
  cycleId: "TQQQ-20260621-001",
  totalRound: 20,
  currentRound: 8.6,
  unitAmount: "250.00",
  strategyCapital: "10000.00",
  realizedBuyAmountInCycle: "2150.00",
  averagePrice: "59.10",
  holdingQuantity: 35,
  brokerSyncedAt: "2026-06-21T21:10:00Z",
  bigBuyCount: 1,
  buyRejectCount: 0,
  sellRejectCount: 0,
  manualHaltReason: null
}
```

### 13.2 OrderPlan

```js
{
  symbol: "TQQQ",
  generatedAt: "2026-06-21T20:55:00Z",
  state: "NORMAL_FRONT",
  noTouch: false,
  buyOrders: [],
  sellOrders: [],
  cancelOrders: [],
  warnings: [],
  riskLevel: "NORMAL",
  expectedCashUsage: "0.00"
}
```

### 13.3 OrderRecord

```js
{
  clientOrderId: "TQQQ-20260621-001-BUY-001",
  tossOrderId: null,
  cycleId: "TQQQ-20260621-001",
  symbol: "TQQQ",
  side: "BUY",
  orderType: "LIMIT",
  timeInForce: "CLS",
  price: "58.40",
  quantity: 3,
  status: "PLANNED",
  reason: "STAR_OR_BIG_BUY",
  createdAt: "2026-06-21T20:55:00Z"
}
```

### 13.4 ReconciliationResult

```js
{
  symbol: "TQQQ",
  cycleId: "TQQQ-20260621-001",
  brokerHoldingQuantity: 35,
  internalHoldingQuantity: 35,
  brokerAveragePrice: "59.10",
  internalAveragePrice: "59.10",
  realizedBuyAmountInCycle: "2150.00",
  recalculatedRound: 8.6,
  isSynced: true,
  differences: [],
  nextState: "NORMAL_FRONT"
}
```

---

## 14. CLI 요구사항

### 14.1 plan

```bash
npm run plan -- --symbol TQQQ
```

기능:

```text
데이터 조회
브로커 상태 확인
주문계획 생성
주문 전송 없이 출력
```

### 14.2 trade

```bash
npm run trade -- --symbol TQQQ --confirm
```

기능:

```text
주문계획 생성
사용자 승인
주문 전송
주문 결과 저장
```

### 14.3 reconcile

```bash
npm run reconcile -- --symbol TQQQ
```

기능:

```text
체결 내역 조회
보유자산 조회
T 재계산
내부 상태 동기화
불일치 시 MANUAL_HALT
```

### 14.4 auto

```bash
npm run auto
```

기능:

```text
스케줄 기준 자동 실행
NO_TOUCH 정책 준수
enableAutoOrder=false면 dry-run만 수행
```

### 14.5 backtest

```bash
npm run backtest -- --symbol TQQQ --from 2020-01-01 --to 2026-06-21
```

기능:

```text
과거 일봉 기반 시뮬레이션
LOC 체결 가정 적용
전략 상태 전환 검증
수익률, MDD, 승률 출력
```

---

## 15. 스케줄 요구사항

### 15.1 장 시작 전

```text
토큰 발급
계좌 조회
미국장 운영 확인
전일 일봉 업데이트
이동평균 계산
직전 상태 확인
```

### 15.2 장중

```text
현재가 조회
급락 필터 확인
위험 상태 확인
```

### 15.3 장마감 전

```text
cutoff 시간 확인
기존 미체결 주문 정리
최종 주문계획 생성
주문 제출
```

### 15.4 장마감 후

```text
체결 내역 조회
보유자산 조회
T 재계산
브로커 상태 동기화
리포트 생성
```

---

## 16. 설정 파일 요구사항

### 16.1 strategy.config.js

```js
module.exports = {
  symbols: ["TQQQ"],
  totalSplit: 40,
  totalRound: 20,
  cashReserveRatio: 0.3,
  maxAllocation: {
    TQQQ: 0.5,
    SOXL: 0.3
  },
  enableBigBuy: false,
  enableReverseMode: true,
  enableBuyReject: true,
  enableSellReject: true,
  enableTrendFilter: true,
  enableCrashFilter: true,
  enableAutoOrder: false
}
```

### 16.2 schedule.config.js

```js
module.exports = {
  cancelCutoffMinutesBeforeClose: 45,
  orderCutoffMinutesBeforeClose: 35,
  noTouchMinutesBeforeClose: 15
}
```

### 16.3 risk.config.js

```js
module.exports = {
  minCashReserveRatio: 0.2,
  initialCashReserveRatio: 0.3,
  crashDropPercent: -8,
  maxLossPause: -30,
  maxLossManualHalt: -45,
  maxLossStop: -60,
  bigBuyMaxCashRatio: 0.2,
  bigBuyMaxCapitalRatio: 0.3,
  consecutiveDownDaysLookback: 5,
  consecutiveDownDaysLimit: 4,
  brokerAveragePriceTolerancePercent: 0.05
}
```

---

## 17. 에러 처리 요구사항

### 17.1 인증 실패

```text
재시도 1회
실패 시 주문 중단
MANUAL_HALT 전환
로그 저장
```

### 17.2 주문 실패

```text
실패 코드 저장
중복 재시도 금지
주문 가능 금액/수량 재확인
NO_TOUCH 구간이면 재시도 금지
```

### 17.3 일부 체결

```text
체결 수량만 반영
체결 금액만 T에 반영
미체결분은 다음 거래일 재계산
```

### 17.4 데이터 부족

```text
이동평균 계산 불가 시 신규 매수 금지
보유분 매도 주문은 제한적으로 허용
경고 출력
```

### 17.5 상태 불일치

```text
내부 상태와 브로커 상태가 불일치하면 MANUAL_HALT
자동 주문 금지
사용자 확인 후 수동 복구
```

---

## 18. 보안 요구사항

```text
API 키는 코드에 저장하지 않는다.
.env는 Git에 커밋하지 않는다.
access_token, client_secret은 로그에 기록하지 않는다.
계좌번호 전체를 로그에 기록하지 않는다.
실거래 모드는 명시적 설정이 있어야만 활성화한다.
```

환경변수 예시:

```env
NODE_ENV=production
TRADING_MODE=paper
ENABLE_AUTO_ORDER=false
TOSS_CLIENT_ID=
TOSS_CLIENT_SECRET=
TOSS_ACCOUNT_SEQ=
```

---

## 19. 비기능 요구사항

### 19.1 안정성

```text
주문 전 dry-run 필수
주문 생성 멱등성 보장
중복 주문 방지
상태 파일 손상 시 자동 주문 중단
```

### 19.2 정확성

```text
decimal 라이브러리 사용
부동소수점 직접 계산 금지
주문 수량 정수 처리
호가 단위 가격 보정
```

### 19.3 관측 가능성

```text
모든 상태 전환 로그 저장
주문계획과 실제 주문 결과 비교 가능
장마감 후 reconcile 리포트 생성
```

---

## 20. 테스트 요구사항

### 20.1 단위 테스트

```text
T 계산
★% 계산
★% 가격 계산
15% 가격 계산
전반전/후반전 판단
NO_TOUCH 판단
매수거부 판단
매도거부 판단
위험 필터 판단
```

### 20.2 통합 테스트

```text
인증 후 현재가 조회
보유자산 조회
주문계획 생성
주문 요청 객체 생성
주문 실패 응답 처리
체결 내역 기반 T 재계산
```

### 20.3 시뮬레이션 테스트

```text
전체 체결
일부 체결
미체결
API 지연
마감 직전 주문 실패
장기 하락장
갭하락
현금 부족
브로커 상태 불일치
```

---

## 21. 개발 단계

### Phase 1: 전략 계산기

```text
전략 상태 모델
T 계산
★% 계산
주문계획 생성
dry-run 출력
```

### Phase 2: 토스 API 읽기 연동

```text
인증
계좌 조회
현재가 조회
일봉 조회
보유자산 조회
```

### Phase 3: Reconciliation

```text
주문 내역 조회
체결 내역 조회
보유자산 대조
T 재계산
MANUAL_HALT 처리
```

### Phase 4: 반자동 주문

```text
사용자 승인 후 주문 전송
clientOrderId 관리
중복 주문 방지
```

### Phase 5: 페이퍼 트레이딩/백테스트

```text
과거 데이터 검증
LOC 체결 가정
MDD, 승률, 현금소진 빈도 분석
```

### Phase 6: 제한적 자동매매

```text
스케줄러 실행
cutoff 정책 적용
NO_TOUCH 정책 적용
소액 자동 주문
```

---

## 22. 성공 지표

### 기술 지표

```text
중복 주문 0건
상태 불일치 감지율 100%
NO_TOUCH 구간 주문 변경 0건
API 키 로그 노출 0건
```

### 전략 지표

```text
백테스트 MDD 확인
현금 소진 빈도 확인
사이클 평균 종료 기간 확인
사이클 승률 확인
페이퍼 트레이딩 1개월 이상 무오류
```

---

## 23. 주요 리스크와 대응

| 리스크 | 대응 |
|---|---|
| 일부 체결로 T 불일치 | 체결금액 기준 T 재계산 |
| 마감 직전 API 지연 | cutoff 및 NO_TOUCH 정책 |
| 기존 주문 취소 실패 | 다음 거래일 reconcile, 필요 시 MANUAL_HALT |
| 15% 주문 평단 불일치 | DAY 주문으로 매일 재계산 |
| 브로커 상태와 내부 상태 불일치 | 자동주문 중단 |
| 급락장 원금 소진 | 현금보존, 급락필터, 손실중단 |

---

## 24. 결론

본 PRD의 핵심은 단순 주문 자동화가 아니라 **브로커 상태와 전략 상태를 매일 동기화하고, 불확실하면 멈추는 자동매매 시스템**을 만드는 것이다.

MVP는 TQQQ 단일 종목, dry-run과 반자동 주문 중심으로 개발하고, 이후 안정성이 검증되면 자동 주문과 SOXL 확장으로 진행한다.

# PRD: 토스증권 Open API 기반 ETF MA20 3% 전략 자동매매 봇

## 1. 프로젝트 개요

### 프로젝트명

`toss-etf-ma20-3pct-trader`

프로젝트명에는 전략이 드러나도록 `ma20-3pct`를 포함한다.

- `ma20`: 20일 이동평균 전략
- `3pct`: 이동평균 대비 ±3% 여유 구간 사용
- `trader`: 자동매매 실행 프로그램

### 목적

토스증권 Open API를 사용하여 **국내 ETF 1종목**을 대상으로 하루 1회 자동으로 매매 신호를 계산하고, 설정에 따라 가상 주문 또는 실제 주문을 수행하는 Node.js 기반 자동매매 프로그램을 개발한다.

초기 전략은 입문자용으로 단순하고 검증이 쉬운 **20일 이동평균 + 3% 여유 전략**을 사용한다.

본 프로젝트는 실시간 틱 매매가 아니라 **일봉 기반 저빈도 자동매매**를 목표로 한다.

---

## 2. 핵심 결론

이 프로젝트는 **JavaScript / Node.js로 개발 가능**하다.

단, 토스증권 Open API 문서 기준으로 주문 API는 실제 매매 주문을 처리하는 API이므로, 초반에는 실제 주문을 보내지 않는 `DRY_RUN` 모드를 반드시 기본값으로 둔다.

### 개발 우선순위

1. `DRY_RUN` 신호 계산 프로그램
2. 가상 주문 기록 기능
3. 실제 계좌/보유수량 조회
4. 실제 주문 기능은 마지막 단계에서만 활성화

---

## 3. 대상 사용자

### 1차 사용자

자동매매 입문자.

### 사용자 특징

- Python보다 JavaScript/Node.js가 익숙함
- 복잡한 퀀트 전략보다 단순한 ETF 전략을 선호
- 실거래 전 2~4주 정도 모의 검증을 원함
- 주문 실수, 중복 주문, 과도한 손실을 피하고 싶음

---

## 4. 목표

### 기능 목표

- 토스증권 Open API 인증
- ETF 일봉 캔들 조회
- 20일 이동평균 계산
- `BUY` / `SELL` / `HOLD` 신호 생성
- 계좌 목록 조회
- 보유 ETF 수량 조회
- 매수 가능 금액 조회
- `DRY_RUN` 가상 주문 기록
- `LIVE` 모드 실제 주문 생성
- 주문 중복 방지
- 실행 로그 저장

### 운영 목표

- 하루 1회 실행
- 국내 장 마감 후 실행
- 기본값은 `DRY_RUN`
- `LIVE` 주문은 명시적으로 활성화해야만 가능
- 1종목 ETF만 대상으로 시작

---

## 5. 비목표

초기 버전에서는 아래 기능을 개발하지 않는다.

- 초단타 매매
- 실시간 WebSocket 매매
- 다종목 포트폴리오 리밸런싱
- 머신러닝 예측
- 복잡한 백테스트 엔진
- 대시보드
- 텔레그램 알림
- 미국 주식 자동매매
- 레버리지/인버스 ETF 자동매매

---

## 6. 사용 전략

## 6.1 전략명

`ETF 20일 이동평균 + 3% 여유 전략`

## 6.2 대상 종목

기본값:

```text
069500
```

예시 기준: KODEX 200 ETF.

## 6.3 전략 규칙

일봉 기준으로 최근 20개 종가의 평균을 계산한다.

```text
MA20 = 최근 20거래일 종가 평균
매수 기준선 = MA20 × 1.03
매도 기준선 = MA20 × 0.97
```

### 매수 조건

```text
현재 종가 >= MA20 × 1.03
그리고 현재 해당 ETF를 보유하지 않음
```

### 매도 조건

```text
현재 종가 <= MA20 × 0.97
그리고 현재 해당 ETF를 보유 중
```

### 대기 조건

```text
그 외 모든 경우
```

---

## 7. 동작 시나리오

## 7.1 기본 실행 흐름

```text
프로그램 시작
  ↓
환경변수 로드
  ↓
토스 OAuth2 토큰 발급
  ↓
계좌 목록 조회
  ↓
ETF 일봉 캔들 조회
  ↓
20일 이동평균 계산
  ↓
BUY / SELL / HOLD 판단
  ↓
보유 수량 조회
  ↓
중복 주문 여부 판단
  ↓
DRY_RUN이면 가상 주문 기록
  ↓
LIVE이면 실제 주문 생성
  ↓
결과 로그 저장
  ↓
프로그램 종료
```

---

## 7.2 DRY_RUN 모드

`MODE=DRY_RUN`일 때는 실제 주문 API를 호출하지 않는다.

- 신호 계산
- 보유 여부 확인
- 주문 예정 내역 출력
- `logs/trades.jsonl` 또는 `logs/orders.jsonl`에 가상 주문 기록
- 실제 `/api/v1/orders` 호출 금지

---

## 7.3 LIVE 모드

`MODE=LIVE`일 때만 실제 주문 API를 호출한다.

단, 다음 조건을 모두 만족해야 한다.

```text
MODE=LIVE
LIVE_CONFIRM=YES
ORDER_BUDGET_KRW > 0
대상 종목이 허용 목록에 있음
중복 주문이 아님
장 운영일 조건을 만족함
```

---

## 8. 토스 Open API 사용 범위

## 8.1 인증

### API

```http
POST /oauth2/token
```

### 설명

OAuth 2.0 Client Credentials 방식으로 `client_id`, `client_secret`을 토큰으로 교환한다.

발급된 토큰은 이후 API 호출에서 다음 헤더에 사용한다.

```http
Authorization: Bearer {access_token}
```

### 구현 요구사항

- token cache 구현
- `expires_in` 기준 만료 1분 전 재발급
- 토큰 발급 실패 시 주문 로직 실행 금지
- `client_secret`은 로그에 절대 남기지 않음

---

## 8.2 캔들 조회

### API

```http
GET /api/v1/candles?symbol={symbol}&interval=1d&count=40&adjusted=true
```

### 설명

일봉 캔들 데이터를 가져와 20일 이동평균 계산에 사용한다.

### 구현 요구사항

- 최소 20개 이상의 일봉 필요
- 응답이 최신순일 수 있으므로 `timestamp` 기준 오름차순 정렬
- `closePrice`를 숫자로 변환
- `adjusted=true` 기본 사용

---

## 8.3 계좌 조회

### API

```http
GET /api/v1/accounts
```

### 설명

계좌 조회 응답의 `accountSeq`를 이후 계좌 관련 API 호출 시 `X-Tossinvest-Account` 헤더 값으로 사용한다.

### 구현 요구사항

- 첫 번째 `BROKERAGE` 계좌 사용
- 계좌가 없으면 프로그램 중단
- `accountSeq`를 모든 계좌 API 요청 헤더에 포함

---

## 8.4 보유 주식 조회

### API

```http
GET /api/v1/holdings?symbol={symbol}
```

### 구현 요구사항

- 해당 `symbol`의 `quantity` 확인
- `quantity > 0`이면 보유 중으로 판단
- `averagePurchasePrice`, `profitLoss`는 로그에 저장

---

## 8.5 주문 전 거래 가능 정보 조회

### 구현 요구사항

- 매수 전 매수 가능 금액 조회
- 매도 전 매도 가능 수량 조회
- 조회 실패 시 주문 금지

---

## 8.6 주문 생성

### API

```http
POST /api/v1/orders
```

### 설명

Order API는 실제 매매 주문을 처리한다.  
따라서 `DRY_RUN`에서는 이 API를 절대 호출하지 않는다.

국내 ETF는 수량 기반 주문을 사용한다.

### 국내 ETF 매수 주문 예시

```json
{
  "clientOrderId": "ma20-069500-20260619-buy",
  "symbol": "069500",
  "side": "BUY",
  "orderType": "LIMIT",
  "quantity": "10",
  "price": "35000"
}
```

### 국내 ETF 매도 주문 예시

```json
{
  "clientOrderId": "ma20-069500-20260619-sell",
  "symbol": "069500",
  "side": "SELL",
  "orderType": "LIMIT",
  "quantity": "10",
  "price": "35000"
}
```

---

## 9. 시스템 아키텍처

## 9.1 기술 스택

```text
Runtime: Node.js 20+
Language: JavaScript ES Modules
Package Manager: npm
HTTP Client: native fetch
Config: dotenv
Scheduler: node-cron 또는 OS cron
Storage MVP: JSONL file
```

---

## 9.2 디렉토리 구조

```text
toss-etf-ma20-3pct-trader/
├── src/
│   ├── main.js
│   ├── config.js
│   ├── tossClient.js
│   ├── strategy.js
│   ├── risk.js
│   ├── orderBuilder.js
│   ├── paperBroker.js
│   ├── logger.js
│   └── utils.js
├── logs/
│   ├── signals.jsonl
│   ├── orders.jsonl
│   └── errors.jsonl
├── .env.example
├── package.json
└── README.md
```

---

## 10. 환경변수 명세

`.env.example`

```env
TOSS_CLIENT_ID=
TOSS_CLIENT_SECRET=

MODE=DRY_RUN
LIVE_CONFIRM=NO

SYMBOL=069500
ORDER_BUDGET_KRW=300000

ORDER_TYPE=LIMIT
PRICE_SLIPPAGE_RATE=0.001

MIN_CANDLES=20
MA_WINDOW=20
BUY_THRESHOLD=1.03
SELL_THRESHOLD=0.97

LOG_LEVEL=info
```

---

## 11. 모듈별 상세 명세

## 11.1 `config.js`

### 역할

환경변수를 읽고 검증한다.

### 요구사항

- 필수 환경변수 누락 시 에러
- `MODE`는 `DRY_RUN` 또는 `LIVE`만 허용
- `LIVE`일 때 `LIVE_CONFIRM=YES` 아니면 중단
- `ORDER_BUDGET_KRW`는 양수만 허용
- `SYMBOL`은 숫자/영문/./-만 허용

---

## 11.2 `tossClient.js`

### 역할

토스증권 API 클라이언트.

### 함수

```js
getAccessToken()
request(path, options)
getAccounts()
getDailyCandles(symbol, count)
getHoldings(accountSeq, symbol)
getBuyingPower(accountSeq)
getSellableQuantity(accountSeq, symbol)
createOrder(accountSeq, order)
getOrder(orderId)
```

### 요구사항

- 모든 요청에 `Authorization` 헤더 추가
- 계좌 API에는 `X-Tossinvest-Account` 헤더 추가
- 429 응답 시 즉시 재시도하지 않고 에러 처리
- API 응답 원문 일부를 로그에 남김
- `client_secret`은 로그에 절대 남기지 않음

---

## 11.3 `strategy.js`

### 역할

20일 이동평균 전략 계산.

### 입력

```js
candles: Array<{
  timestamp: string,
  closePrice: string
}>
```

### 출력

```js
{
  signal: 'BUY' | 'SELL' | 'HOLD',
  close: number,
  ma20: number,
  buyLine: number,
  sellLine: number,
  reason: string
}
```

### 전략 로직

```js
if (close >= ma20 * 1.03) return BUY
if (close <= ma20 * 0.97) return SELL
return HOLD
```

---

## 11.4 `risk.js`

### 역할

실제 주문 가능 여부를 판단한다.

### 체크 항목

- `LIVE` 모드 보호장치
- 중복 매수 방지
- 미보유 매도 방지
- 주문 금액 제한
- 수량 0 이하 주문 방지
- 허용 종목 여부
- 캔들 데이터 부족 여부

### 주문 가능 조건

```text
BUY:
signal=BUY
hasPosition=false
quantity > 0
buyingPower >= orderBudget

SELL:
signal=SELL
hasPosition=true
sellableQuantity > 0

HOLD:
주문 없음
```

---

## 11.5 `orderBuilder.js`

### 역할

전략 신호와 계좌 상태를 기반으로 주문 객체를 생성한다.

### clientOrderId 규칙

```text
ma20-{symbol}-{YYYYMMDD}-{side}
```

예:

```text
ma20-069500-20260619-buy
```

### 지정가 가격

초기 버전에서는 최근 종가를 기준으로 한다.

```text
BUY price = close × (1 + PRICE_SLIPPAGE_RATE)
SELL price = close × (1 - PRICE_SLIPPAGE_RATE)
```

단, 국내 ETF 호가 단위 처리는 MVP 이후 개선 항목으로 둔다.

---

## 11.6 `paperBroker.js`

### 역할

`DRY_RUN` 모드에서 실제 주문 대신 가상 주문을 기록한다.

### 저장 내용 예시

```json
{
  "timestamp": "2026-06-19T15:40:00+09:00",
  "mode": "DRY_RUN",
  "symbol": "069500",
  "side": "BUY",
  "quantity": "8",
  "price": "35000",
  "clientOrderId": "ma20-069500-20260619-buy",
  "reason": "close >= ma20 * 1.03"
}
```

---

## 11.7 `logger.js`

### 역할

JSONL 로그 저장.

### 로그 파일

```text
logs/signals.jsonl
logs/orders.jsonl
logs/errors.jsonl
```

### 신호 로그 예시

```json
{
  "timestamp": "2026-06-19T15:40:00+09:00",
  "symbol": "069500",
  "close": 35000,
  "ma20": 33800,
  "buyLine": 34814,
  "sellLine": 32786,
  "signal": "BUY",
  "hasPosition": false,
  "mode": "DRY_RUN"
}
```

---

## 12. 핵심 실행 로직

`main.js`는 다음 흐름을 따른다.

1. config 로드
2. access token 준비
3. accounts 조회
4. accountSeq 선택
5. candles 조회
6. strategy 계산
7. holdings 조회
8. 주문 필요 여부 판단
9. `DRY_RUN`이면 paper order 저장
10. `LIVE`이면 createOrder 호출
11. 결과 로그 저장
12. 종료

---

## 13. 실행 스케줄

MVP에서는 프로그램 자체가 데몬으로 계속 떠 있지 않아도 된다.

권장 방식:

```text
OS cron 또는 서버 cron
평일 15:40 KST 실행
```

예:

```bash
40 15 * * 1-5 cd /home/user/toss-etf-auto-trader && node src/main.js
```

휴장일 판단은 국내 장 운영 정보 API를 사용하여 보완한다.

---

## 14. MVP 범위

## 14.1 반드시 구현

- Node.js 프로젝트 초기화
- `.env` 설정
- OAuth2 토큰 발급
- 계좌 조회
- 캔들 조회
- 20일 이동평균 전략
- 보유 수량 조회
- `DRY_RUN` 주문 기록
- `LIVE` 보호장치
- 실제 주문 함수 구현
- 로그 저장

## 14.2 후순위

- SQLite 저장
- 텔레그램 알림
- 웹 대시보드
- 복수 ETF 지원
- 호가 단위 자동 보정
- 장 운영 시간 자동 판단 고도화
- 주문 체결 상세 추적
- 백테스트 기능

---

## 15. 안전장치

## 15.1 LIVE 모드 보호

실제 주문은 아래 조건이 모두 참이어야 가능하다.

```text
MODE=LIVE
LIVE_CONFIRM=YES
ALLOW_LIVE_ORDER=true 내부 검증 통과
```

## 15.2 중복 주문 방지

- 이미 보유 중이면 `BUY` 주문 금지
- 미보유 상태이면 `SELL` 주문 금지
- 같은 날짜, 같은 symbol, 같은 side의 `clientOrderId` 재사용
- 주문 전 `logs/orders.jsonl`에서 동일 `clientOrderId` 존재 여부 확인

## 15.3 주문 금액 제한

```text
ORDER_BUDGET_KRW 이하로만 매수
quantity = floor(ORDER_BUDGET_KRW / price)
quantity <= 0이면 주문 없음
```

## 15.4 실패 시 동작

```text
토큰 발급 실패 → 종료
캔들 부족 → 주문 없음
계좌 조회 실패 → 종료
보유 수량 조회 실패 → 주문 없음
매수 가능 금액 조회 실패 → 주문 없음
주문 API 실패 → 에러 로그 저장 후 종료
```

---

## 16. 테스트 계획

## 16.1 단위 테스트

### strategy.js

- 캔들 20개 미만이면 `HOLD`
- 종가가 매수 기준 이상이면 `BUY`
- 종가가 매도 기준 이하이면 `SELL`
- 중간 구간이면 `HOLD`
- 문자열 `closePrice`를 숫자로 정상 변환

### risk.js

- `BUY + 미보유` → 주문 가능
- `BUY + 보유` → 주문 불가
- `SELL + 보유` → 주문 가능
- `SELL + 미보유` → 주문 불가
- `HOLD` → 주문 불가

---

## 16.2 통합 테스트

- `DRY_RUN`에서 실제 주문 API가 호출되지 않는지 확인
- access token 발급 후 candles 조회 성공
- holdings 조회 성공
- 주문 예정 내역이 `logs/orders.jsonl`에 저장되는지 확인

---

## 16.3 2~4주 검증 기준

수익률보다 시스템 안정성을 먼저 검증한다.

- 매일 정해진 시간에 실행되는가
- 캔들 데이터가 정상 조회되는가
- 신호 계산이 로그에 남는가
- 중복 매수가 발생하지 않는가
- 미보유 매도가 발생하지 않는가
- `DRY_RUN`에서 실제 주문이 절대 발생하지 않는가
- 에러가 발생했을 때 주문이 차단되는가

---

## 17. 성공 기준

MVP 성공 기준은 다음과 같다.

- `npm install` 후 실행 가능
- `.env`만 설정하면 동작
- `DRY_RUN` 모드에서 신호 계산 가능
- `logs/signals.jsonl` 생성
- `BUY`/`SELL` 조건일 때 `logs/orders.jsonl`에 가상 주문 기록
- `LIVE` 모드 보호장치가 작동
- 실제 주문 함수는 존재하지만 기본값으로 호출되지 않음

---

## 18. README에 포함할 내용

- 프로젝트 설명
- 투자 위험 고지
- 설치 방법
- `.env` 설정 방법
- `DRY_RUN` 실행 방법
- `LIVE` 전환 방법
- 로그 확인 방법
- 전략 설명
- 주의사항

---

# Codex 작업 지시문

아래 내용을 Codex에 그대로 넣어 개발을 시작한다.

```text
Node.js 20+ 기반의 JavaScript ES Module 프로젝트를 만들어줘.

프로젝트 이름은 toss-etf-ma20-3pct-trader야.

목표:
토스증권 Open API를 사용해서 국내 ETF 1종목에 대해 하루 1회 20일 이동평균 + 3% 여유 전략을 실행하는 자동매매 봇을 만든다.

중요:
기본 모드는 반드시 DRY_RUN이어야 한다.
DRY_RUN에서는 실제 주문 API를 절대 호출하면 안 된다.
LIVE 주문은 MODE=LIVE와 LIVE_CONFIRM=YES가 모두 설정된 경우에만 가능해야 한다.

전략:
- symbol 기본값은 069500
- /api/v1/candles에서 interval=1d, count=40, adjusted=true로 일봉을 가져온다.
- timestamp 기준 오름차순으로 정렬한다.
- 최근 20개 closePrice 평균을 MA20으로 계산한다.
- close >= MA20 * 1.03이면 BUY
- close <= MA20 * 0.97이면 SELL
- 그 외는 HOLD

주문 조건:
- BUY 신호이고 해당 ETF를 보유하지 않을 때만 매수 후보
- SELL 신호이고 해당 ETF를 보유 중일 때만 매도 후보
- HOLD는 주문 없음
- 매수 수량은 floor(ORDER_BUDGET_KRW / price)
- 수량이 0 이하면 주문 없음

API:
- POST /oauth2/token
- GET /api/v1/accounts
- GET /api/v1/candles
- GET /api/v1/holdings
- 주문 함수 createOrder는 구현하되 DRY_RUN에서는 호출하지 않는다.
- 모든 계좌 API에는 X-Tossinvest-Account 헤더를 넣는다.
- 모든 인증 필요 API에는 Authorization: Bearer 토큰을 넣는다.

파일 구조:
src/config.js
src/tossClient.js
src/strategy.js
src/risk.js
src/orderBuilder.js
src/paperBroker.js
src/logger.js
src/main.js
.env.example
README.md

로그:
logs/signals.jsonl
logs/orders.jsonl
logs/errors.jsonl

package.json에는 type=module을 설정해줘.
native fetch를 사용하고, dotenv만 의존성으로 추가해줘.

README에는 설치 방법, .env 설정, DRY_RUN 실행 방법, LIVE 전환 주의사항을 적어줘.
```

---

## 19. 최종 추천 개발 순서

1. Codex로 기본 프로젝트 생성
2. `DRY_RUN`으로 `node src/main.js` 실행
3. `logs/signals.jsonl` 생성 확인
4. `BUY`/`SELL` 조건 강제 테스트
5. 실제 토스 API 인증 확인
6. 캔들 조회 확인
7. 보유 수량 조회 확인
8. 2~4주 `DRY_RUN` 운영
9. `ORDER_BUDGET_KRW=100000` 수준으로 소액 `LIVE` 테스트

---

## 20. 투자 및 운영 주의사항

이 문서는 개발용 PRD이며 투자 수익을 보장하지 않는다.

자동매매 프로그램은 API 오류, 네트워크 장애, 잘못된 주문, 시장 급변, 호가 단위 오류, 체결 지연 등으로 손실이 발생할 수 있다.

초기에는 반드시 `DRY_RUN`으로 충분히 검증하고, 실제 주문은 소액으로만 테스트한다.

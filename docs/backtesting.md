# 백테스트 사용법

이 문서는 로컬 CSV 데이터를 사용해 전략별 백테스트를 실행하는 방법을 정리한다.

현재 지원하는 전략은 다음 두 가지다.

```text
MA20 전략
무한매수 V4 전략
```

백테스트는 전략 검증용 도구이며, 실제 체결 품질을 보장하지 않는다. 수수료와 매도 세금은 옵션으로 단순 반영할 수 있지만, 환율, 슬리피지, 부분체결은 아직 정교하게 반영하지 않는다.

## 데이터 수집

토스 OpenAPI에서 일봉 데이터를 CSV로 저장한다.

```bash
npm run data:candles -- --symbol TQQQ --from 2026-01-01 --to 2026-06-30 --out data/TQQQ-2026-H1.csv
```

KODEX 200은 종목코드 `069500`을 사용한다.

```bash
npm run data:candles -- --symbol 069500 --from 2026-01-01 --to 2026-06-30 --out data/069500-2026-H1.csv
```

현재 생성된 주요 데이터 파일:

```text
data/TQQQ-2025-H1.csv
data/TQQQ-2025-H2.csv
data/TQQQ-2026-H1.csv
data/SOXL-2025-H1.csv
data/SOXL-2025-H2.csv
data/SOXL-2026-H1.csv
data/069500-2025-H1.csv
data/069500-2025-H2.csv
data/069500-2026-H1.csv
```

## CSV 형식

CSV는 일봉 기준이며 아래 컬럼을 사용한다.

```csv
Date,Open,High,Low,Close,Volume
2026-01-02,50,51,49,50,1000
```

날짜 형식은 아래 둘 다 사용할 수 있다.

```text
YYYY-MM-DD
YYYYMMDD
```

헤더는 소문자도 허용한다.

```text
date,open,high,low,close,volume
```

## MA20 백테스트

KODEX 200 2026년 상반기 예시:

```bash
npm run ma20:backtest -- --file data/069500-2026-H1.csv --symbol 069500 --cash 10000000 --orderBudget 1000000
```

파라미터를 직접 조정할 수도 있다.

```bash
npm run ma20:backtest -- --file data/069500-2026-H1.csv --symbol 069500 --cash 10000000 --orderBudget 1000000 --maWindow 20 --buyThreshold 1.03 --sellThreshold 0.97
```

주요 옵션:

```text
--file            CSV 파일 경로
--symbol          종목코드 또는 티커
--cash            초기 계좌 평가금
--orderBudget     1회 매수에 사용할 금액
--maWindow        이동평균 기간, 기본 20
--buyThreshold    매수 기준, 기본 1.03
--sellThreshold   매도 기준, 기본 0.97
--from            백테스트 시작일
--to              백테스트 종료일
```

MA20 체결 가정:

```text
보유 수량이 없고 BUY 신호가 나오면 종가 기준 매수한다.
보유 수량이 있고 SELL 신호가 나오면 종가 기준 전량 매도한다.
매수 수량은 floor(orderBudget / close)로 계산한다.
```

## 무한매수 백테스트

TQQQ 2026년 상반기 예시:

```bash
npm run infinite:backtest -- --file data/TQQQ-2026-H1.csv --symbol TQQQ --cash 10000 --strategyCapital 10000
```

SOXL 2026년 상반기 예시:

```bash
npm run infinite:backtest -- --file data/SOXL-2026-H1.csv --symbol SOXL --cash 10000 --strategyCapital 10000
```

무한매수 전략은 MA200 추세 필터를 사용한다. 데이터가 200개 미만이면 신규 사이클 매수가 막힐 수 있다. 짧은 기간 테스트에서 추세 필터를 끄려면 아래 옵션을 사용한다.

```bash
npm run infinite:backtest -- --file data/TQQQ-2026-H1.csv --symbol TQQQ --cash 10000 --strategyCapital 10000 --disableTrendFilter
```

상태 전환 이력을 파일로 저장하려면 `--stateTransitionsOut` 옵션을 사용한다. 확장자가 `.csv`이면 CSV로 저장하고, 그 외 확장자는 JSONL로 저장한다.

```bash
npm run infinite:backtest -- --file data/TQQQ-2026-H1.csv --symbol TQQQ --cash 10000 --strategyCapital 10000 --stateTransitionsOut data/TQQQ-state-transitions.csv
```

수수료를 반영하려면 `--feeRatePercent`를 사용한다. 예를 들어 `0.015`는 거래금액의 0.015%를 수수료로 차감한다.

```bash
npm run infinite:backtest -- --file data/TQQQ-2026-H1.csv --symbol TQQQ --cash 10000 --strategyCapital 10000 --feeRatePercent 0.015
```

매도 세금이나 별도 거래비용을 보수적으로 반영하려면 `--taxRatePercent`를 사용한다. 이 값은 매도 체결금액에서만 차감한다.

```bash
npm run infinite:backtest -- --file data/TQQQ-2026-H1.csv --symbol TQQQ --cash 10000 --strategyCapital 10000 --taxRatePercent 0.1
```

TQQQ, SOXL의 2025년 상반기/하반기, 2026년 상반기 결과를 표로 비교하려면 아래 명령을 사용한다.

```bash
npm run infinite:compare -- --cash 10000 --strategyCapital 10000 --disableTrendFilter
```

비교 결과를 파일로 저장할 수도 있다.

```bash
npm run infinite:compare -- --cash 10000 --strategyCapital 10000 --disableTrendFilter --out data/infinite-buying-comparison.md
```

주요 옵션:

```text
--file                 CSV 파일 경로
--symbol               티커
--cash                 초기 계좌 평가금
--strategyCapital      전략 배정금
--disableTrendFilter   MA200 추세 필터 비활성화
--stateTransitionsOut  상태 전환 이력 저장 경로, .csv 또는 .jsonl
--feeRatePercent       거래대금 대비 수수료율, 예: 0.015
--taxRatePercent       매도대금 대비 세금/추가 거래비용률, 예: 0.1
--from                 백테스트 시작일
--to                   백테스트 종료일
```

무한매수 체결 가정:

```text
LOC 매수는 종가가 계획 매수가 이하일 때 체결된 것으로 본다.
LOC 매도는 종가가 계획 매도가 이상일 때 체결된 것으로 본다.
15% DAY 보조 매도는 당일 고가가 계획 매도가 이상일 때 체결된 것으로 본다.
브로커 실제 주문 상태와 부분체결은 아직 반영하지 않는다. 수수료와 매도 세금은 옵션으로 단순 반영할 수 있다.
```

주의: 현재 무한매수 구현은 V4 전체 기능이 완성된 상태가 아니다. 일반 LOC 매수, 별표 매도, 15% 보조 매도, 일부 리스크 필터 중심이며 매도거부, 스킵, 리버스모드, 큰수매수 등은 보강이 필요하다.

## 출력 항목

공통 출력:

```text
[initial equity]       초기 계좌 평가금
[final equity]         최종 계좌 평가금
[total return]         전체 계좌 기준 수익률
[allocated capital]    전략 배정금
[allocated return]     전략 배정금 대비 수익률
[max deployed]         백테스트 기간 중 최대 실제 투입 평가액
[avg deployed]         백테스트 기간 중 평균 실제 투입 평가액
[buy & hold return]    같은 기간 단순보유 수익률
[excess vs buy & hold] 단순보유 대비 초과수익률
[max drawdown]         최대 낙폭
[trades]               전체, 매수, 매도 거래 수
[win rate]             수익 매도 / 전체 매도
[final state]          최종 상태
[last trades]          최근 거래 내역
```

`total return`은 계좌 전체 기준이다. 예를 들어 초기자산 1,000만 원 중 100만 원만 전략에 투입했다면 계좌 전체 수익률은 낮게 보일 수 있다.

`allocated return`은 전략 배정금 대비 수익률이다. 전략 효율을 볼 때는 이 값을 같이 확인해야 한다.

`buy & hold return`은 같은 기간 단순보유 수익률이다. 전략이 실제로 의미가 있는지 판단하려면 반드시 `excess vs buy & hold`를 함께 봐야 한다.

## 무한매수 진단 출력

무한매수 백테스트는 추가로 아래 진단 정보를 출력한다.

```text
[plans]                 생성된 일별 계획 수
[candles]               사용한 캔들 수
[planned orders]        계획된 매수/매도 주문 수
[filled orders]         체결 가정된 매수/매도 주문 수
[unfilled orders]       미체결 가정된 매수/매도 주문 수
[days with warnings]    경고가 발생한 일수
[state counts]          상태별 발생 횟수
[top warnings]          주요 경고 사유
[hint]                  결과 해석 힌트
```

## 무한매수 비교표

`npm run infinite:compare`는 기본적으로 아래 파일을 찾는다.

```text
data/TQQQ-2025-H1.csv
data/TQQQ-2025-H2.csv
data/TQQQ-2026-H1.csv
data/SOXL-2025-H1.csv
data/SOXL-2025-H2.csv
data/SOXL-2026-H1.csv
```

출력 표에는 전략 수익률, 배정금 수익률, 단순보유 수익률, 단순보유 대비 초과수익, 최대낙폭, 거래수, 매수거부/매도거부 횟수, 수수료, 세금이 포함된다.

예를 들어 아래처럼 나오면 매수 주문 자체가 생성되지 않은 것이다.

```text
[planned orders] buy=0, sell=0
[top warnings]
- 121x MA200 unavailable; new cycle buying is blocked when there is no existing position.
```

이 경우 데이터가 200일 미만이라 MA200 추세 필터가 신규 매수를 막았을 가능성이 높다. 짧은 기간만 테스트하려면 `--disableTrendFilter`를 사용하거나, 테스트 시작일보다 충분히 앞선 워밍업 데이터를 포함해야 한다.

아래처럼 나오면 주문 계획은 있었지만 LOC 조건 때문에 체결되지 않은 것이다.

```text
[planned orders] buy=29, sell=0
[filled orders] buy=0, sell=0
[unfilled orders] buy=29, sell=0
```

## 결과 해석 기준

백테스트 결과는 한 가지 숫자로 판단하지 않는다.

```text
total return           실제 계좌가 얼마나 늘었는지
allocated return       전략 배정금 대비 효율
buy & hold return      그냥 들고 있었을 때의 수익률
excess vs buy & hold   전략이 단순보유를 이겼는지
max drawdown           손실 구간을 얼마나 견뎌야 했는지
win rate               매도 거래 중 수익 거래 비율
```

승률이 낮아도 전체 수익은 플러스일 수 있다. 반대로 수익률이 플러스여도 단순보유보다 크게 낮으면 전략의 기회비용이 큰 것이다.

## 한계

현재 백테스트의 주요 한계:

```text
수수료는 단일 비율 옵션으로만 반영
세금은 매도대금 기준 단일 비율 옵션으로만 반영
환율 미반영
슬리피지 미반영
부분체결 미반영
실제 주문 실패/취소/정정 흐름 미반영
무한매수 V4 일부 기능 미완성
```

따라서 백테스트 결과가 좋더라도 바로 큰 금액으로 실거래하지 말고, DRY_RUN과 소액 실거래로 검증해야 한다.

# 무한매수 실거래 출시 게이트

이 문서는 무한매수 전략을 큰 금액 자동매매로 전환하기 전에 확인해야 하는 최종 게이트입니다.

체크박스는 실제 운영 결과가 확인된 뒤에만 표시합니다. 백테스트 통과만으로 실거래 준비가 끝난 것으로 보지 않습니다.

## 1. 코드 검증

- [ ] `git pull` 후 최신 코드 확인
- [ ] `npm install` 완료
- [ ] `npm test` 통과
- [ ] `docs/infinite-buying-roadmap.md`의 1~6단계 완료 확인
- [ ] 7단계 테스트 항목 통과 확인

확인 명령:

```bash
cd /opt/auto_stock
git pull
npm install
npm test
```

## 2. 환경변수 검증

- [ ] `.env`가 서버에만 존재함
- [ ] `.env` 권한이 `600`임
- [ ] `TOSS_CLIENT_ID` 설정
- [ ] `TOSS_CLIENT_SECRET` 설정
- [ ] `TOSS_ACCOUNT_SEQ` 설정
- [ ] 알림 채널 설정
- [ ] 브로커 API key가 VPS public IP로 제한됨

실거래 전 기본값:

```env
TRADING_MODE=paper
ENABLE_AUTO_ORDER=false
LIVE_CONFIRM=NO
IB_LIVE_ORDER_AMOUNT_LIMIT=
```

## 3. 알림 검증

- [ ] `infinite:health` 하트비트 수신
- [ ] `infinite:summary` 일일 요약 수신
- [ ] `infinite:plan` 주문 계획 알림 수신
- [ ] 매수거부/매도거부 알림 수신 확인
- [ ] reconcile 불일치 알림 수신 확인
- [ ] 알림에 secret, token, 전체 계좌번호가 노출되지 않음

확인 명령:

```bash
npm run infinite:health -- --symbol TQQQ
npm run infinite:summary -- --symbol TQQQ
npm run infinite:plan -- --symbol TQQQ
```

## 4. DRY_RUN/PAPER 운영 기록

최소 2주 동안 운영 결과를 기록합니다.

| 구분 | 시작일 | 종료일 | 결과 | 비고 |
| --- | --- | --- | --- | --- |
| DRY_RUN |  |  |  |  |
| PAPER |  |  |  |  |

통과 기준:

- [ ] cron 누락 없음
- [ ] plan/trade/reconcile/summary/health 알림이 정상 수신됨
- [ ] 주문 계획과 주문 기록이 일치함
- [ ] 중복 `clientOrderId` 제출 없음
- [ ] 미체결/부분체결 상태가 reconcile에서 반영됨
- [ ] `MANUAL_HALT` 발생 시 추가 주문이 차단됨

## 5. 소액 실거래 게이트

큰 금액 자동매매 전 소액으로 먼저 검증합니다.

- [ ] 1개 종목만 활성화
- [ ] 첫 투입 금액 상한 설정 `IB_LIVE_ORDER_AMOUNT_LIMIT`
- [ ] 첫 주문 후 즉시 `infinite:reconcile` 실행
- [ ] 브로커 보유수량과 내부 상태 일치 확인
- [ ] 체결 알림 수신 확인
- [ ] 일일 요약의 상태/T/평단 확인

소액 실거래 전환 시에만 아래 값을 변경합니다.

```env
TRADING_MODE=LIVE
ENABLE_AUTO_ORDER=true
LIVE_CONFIRM=YES
IB_LIVE_ORDER_AMOUNT_LIMIT=100
```

검증 후 문제가 있으면 즉시 원래 값으로 되돌립니다.

```env
TRADING_MODE=paper
ENABLE_AUTO_ORDER=false
LIVE_CONFIRM=NO
```

## 6. 장애 대응 준비

- [ ] `crontab -e`로 trade cron을 즉시 중지할 수 있음
- [ ] `docs/operations.md`의 수동 복구 절차 확인
- [ ] 브로커 앱에서 직접 주문 취소 가능
- [ ] VPS 콘솔 접속 방법 확보
- [ ] API key 폐기/재발급 절차 확인

## 최종 판단

아래 조건을 모두 만족해야 큰 금액 자동매매를 검토할 수 있습니다.

```text
백테스트 통과
DRY_RUN 최소 2주 통과
PAPER 또는 소액 실거래 최소 2주 통과
알림 정상
수동 복구 절차 숙지
첫 투입 금액 상한 설정
```

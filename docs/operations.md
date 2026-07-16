# 클라우드 운영 체크리스트

이 문서는 Vultr, DigitalOcean, Lightsail 같은 소형 VPS에서 이 프로젝트를 cron으로 운영할 때 필요한 최소 안전장치를 정리합니다.

자동매매 코드는 일반 웹 서버보다 보수적으로 운영해야 합니다. 처음에는 반드시 paper 모드로 실행하고, 며칠 동안 로그와 알림을 확인한 뒤 실거래를 검토하세요.

## 권장 VPS 사양

최소 권장 사양:

```text
1 vCPU
1 GB RAM
25 GB SSD
Ubuntu 24.04 LTS
Public IPv4
```

현재 프로젝트는 cron으로 짧게 실행되는 작업이 중심이므로 shared CPU VPS로 충분합니다. 장중 실시간 폴링, 무거운 백테스트, 여러 전략 병렬 실행이 추가되어 CPU 사용률이 계속 높아질 때만 더 높은 요금제나 Dedicated CPU를 검토하세요.

## 초기 서버 세팅

새 Ubuntu 서버에서 `root`로 실행합니다.

```bash
apt update
apt upgrade -y
apt install -y git curl build-essential htop
timedatectl set-timezone Asia/Seoul
```

Node.js 20 설치:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
npm -v
```

프로젝트 배포:

```bash
git clone https://github.com/atscksk/auto_stock.git /opt/auto_stock
cd /opt/auto_stock
npm install
npm test
```

## Swap 설정

1GB VPS에서는 scheduled job을 운영하기 전에 swap을 설정하는 것을 권장합니다. `npm install`, 테스트, 일시적인 메모리 증가 상황에서 OOM Killer가 프로세스를 죽일 가능성을 줄일 수 있습니다.

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
cp /etc/fstab /etc/fstab.bak
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h
```

`fallocate`가 실패하면 아래 방식으로 생성합니다.

```bash
dd if=/dev/zero of=/swapfile bs=1M count=2048
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
```

## 방화벽과 SSH

최소 설정:

```bash
ufw allow OpenSSH
ufw enable
ufw status
```

더 안전한 설정은 SSH를 내 집 IP에서만 허용하는 것입니다.

```bash
ufw delete allow OpenSSH
ufw allow from YOUR_HOME_IP to any port 22 proto tcp
ufw enable
ufw status
```

집 IP가 자주 바뀐다면 SSH 제한 전에 클라우드 콘솔 접속 같은 복구 방법을 확보하세요.

가능하면 비밀번호 로그인보다 SSH key 로그인을 사용하세요. `.env` 파일 권한도 제한합니다.

```bash
cd /opt/auto_stock
chmod 600 .env
```

## API Key 보안

브로커 API key는 필요한 권한만 부여해서 사용합니다.

실거래 전 필수 확인:

```text
API key가 Git에 커밋되지 않음
.env 권한이 600으로 제한됨
access token, client secret이 로그에 남지 않음
브로커가 지원하면 API key를 VPS public IP로 제한
실거래는 명시적인 플래그가 있어야만 가능
```

브로커가 IP 화이트리스트를 지원한다면, 주문 가능한 API key는 VPS public IP에서만 사용할 수 있도록 제한하세요.

## Cron 설정

짧게 실행되고 끝나는 작업은 cron으로 운영합니다. 처음에는 주문 없이 계획 생성만 돌리세요.

```cron
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin

30 8 * * 1-5 cd /opt/auto_stock && /usr/bin/npm run infinite:plan >> /opt/auto_stock/strategies/infinite_buying/logs/cron-plan.log 2>&1
```

이전 cron 작업이 끝나기 전에 다음 작업이 겹치지 않도록 `flock` 사용을 권장합니다.

```cron
30 8 * * 1-5 flock -n /tmp/auto-stock-infinite-plan.lock bash -lc 'cd /opt/auto_stock && /usr/bin/npm run infinite:plan >> /opt/auto_stock/strategies/infinite_buying/logs/cron-plan.log 2>&1'
```

계획 로그가 여러 번 정상적으로 쌓인 뒤에만 paper 주문 기록 job을 추가하세요.

```cron
50 4 * * 2-6 flock -n /tmp/auto-stock-infinite-trade.lock bash -lc 'cd /opt/auto_stock && /usr/bin/npm run infinite:trade -- --symbol TQQQ --confirm >> /opt/auto_stock/strategies/infinite_buying/logs/cron-trade.log 2>&1'
```

미국장 기준 cron 시간은 서머타임과 휴장일 영향을 받습니다. KST 고정 시간이 항상 맞는다고 가정하지 마세요.

## 모니터링

서버 상태 확인:

```bash
uptime
free -h
df -h
top
```

OOM Killer 발생 여부 확인:

```bash
dmesg -T | grep -i -E 'killed process|out of memory|oom'
```

cron 로그 확인:

```bash
tail -f /opt/auto_stock/strategies/infinite_buying/logs/cron-plan.log
tail -f /opt/auto_stock/strategies/infinite_buying/logs/order-plans.jsonl
tail -f /opt/auto_stock/strategies/infinite_buying/logs/orders.jsonl
```

장중 CPU 사용률이 계속 30~40%를 넘는다면 작업 빈도를 줄이거나, 무거운 작업을 장외 시간으로 옮기거나, 서버 업그레이드를 검토하세요.

## 알림

아래 알림이 준비되기 전에는 실거래 자동화를 켜지 않는 것을 권장합니다.

```text
heartbeat / 일일 생존 신고
cron 실패
주문 제출 실패
브로커 API 실패
rate limit 발생
MANUAL_HALT 발생
reconcile 불일치
포지션 또는 보유수량 변경
```

첫 버전은 Telegram 또는 Discord webhook이면 충분합니다. 알림 메시지에는 secret, 전체 계좌번호, access token을 포함하지 마세요.

현재 프로젝트는 Discord webhook과 Telegram bot 알림을 지원합니다. 둘 중 하나만 설정해도 됩니다.

```env
ENABLE_NOTIFICATIONS=true

# Discord를 사용할 때
DISCORD_WEBHOOK_URL=

# Telegram을 사용할 때
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

공통 heartbeat 명령:

```text
npm run health
```

전략별 알림이 연결되는 명령:

```text
npm run infinite:health
npm run infinite:summary
npm run infinite:plan
npm run infinite:trade
npm run infinite:reconcile
npm run ma20:signal
npm run ma20:order
```

heartbeat 수동 테스트:

```bash
cd /opt/auto_stock
npm run health
```

heartbeat cron 예시:

```cron
0 9 * * 1-5 flock -n /tmp/auto-stock-health.lock bash -lc 'cd /opt/auto_stock && /usr/bin/npm run health >> /opt/auto_stock/strategies/infinite_buying/logs/cron-health.log 2>&1'
```

무한매수 일일 요약 cron 예시:

```cron
10 6 * * 2-6 flock -n /tmp/auto-stock-infinite-summary.lock bash -lc 'cd /opt/auto_stock && /usr/bin/npm run infinite:summary -- --symbol TQQQ >> /opt/auto_stock/strategies/infinite_buying/logs/cron-summary.log 2>&1'
```

## 장시간과 브로커 점검 예외

미국 주식은 24시간 거래가 아닙니다. 작업은 아래 상황을 정상적으로 처리해야 합니다.

```text
주말
미국 휴장일
조기 폐장
브로커 점검 시간
장마감 후 일시적인 API 실패
rate limit
```

현재 무한매수 전략에는 cutoff와 NO_TOUCH 정책이 들어가 있지만, 주문 가능한 자동화를 켜기 전에는 검증된 미국장 캘린더 연동이 필요합니다.

## 실거래 전환 조건

paper 운영이 안정화되기 전까지는 아래 값을 유지하세요.

```env
TRADING_MODE=paper
ENABLE_AUTO_ORDER=false
LIVE_CONFIRM=NO
IB_LIVE_ORDER_AMOUNT_LIMIT=
```

실거래 전 체크리스트:

```text
VPS에서 npm test 통과
plan-only cron이 며칠 동안 정상 실행됨
paper trade 로그가 의도대로 기록됨
알림이 동작함
SSH와 API key IP 제한이 설정됨
swap이 활성화됨
브로커 상태 동기화 결과를 검토함
수동 복구 절차를 알고 있음
```

실거래는 반드시 소액으로 먼저 검증하세요.

## 무한매수 실거래 전 체크리스트

실거래 전에는 아래 항목을 모두 확인합니다.

```text
VPS에서 git pull 후 npm install 완료
VPS에서 npm test 통과
TRADING_MODE=paper 상태로 plan/trade/reconcile cron이 정상 실행됨
infinite:plan 알림에서 상태, T, 평단, 주문 후보를 확인함
매수거부/매도거부 알림이 별도 메시지로 수신됨
infinite:summary 일일 요약 알림이 정상 수신됨
infinite:health 하트비트에 마지막 실행 시간이 표시됨
TOSS_ACCOUNT_SEQ, TOSS_CLIENT_ID, TOSS_CLIENT_SECRET 값이 서버 .env에만 존재함
브로커 API key가 VPS public IP로 제한됨
ENABLE_AUTO_ORDER=false, LIVE_CONFIRM=NO 상태에서 paper 검증 완료
소액 실거래 전환 시 ENABLE_AUTO_ORDER=true, LIVE_CONFIRM=YES, IB_LIVE_ORDER_AMOUNT_LIMIT를 명시적으로 변경
첫 실거래 후 infinite:reconcile로 주문 상태와 내부 상태를 확인
MANUAL_HALT 발생 시 추가 주문 cron을 즉시 중지할 수 있음
```

실거래 전환 직전 확인 명령:

```bash
cd /opt/auto_stock
git pull
npm install
npm test
npm run infinite:plan -- --symbol TQQQ
npm run infinite:summary -- --symbol TQQQ
npm run infinite:health -- --symbol TQQQ
```

## 장애 발생 시 수동 복구 절차

장애가 발생하면 먼저 추가 주문을 멈춘 뒤 상태를 확인합니다. 손으로 급하게 주문을 넣기 전에 브로커 계좌와 내부 상태를 맞추는 것이 우선입니다.

1. cron 중지 또는 주석 처리:

```bash
crontab -e
```

`infinite:trade` 항목을 주석 처리하고 저장합니다. plan, health, summary는 필요하면 유지해도 됩니다.

2. 최근 로그 확인:

```bash
tail -n 100 /opt/auto_stock/strategies/infinite_buying/logs/cron-trade.log
tail -n 100 /opt/auto_stock/strategies/infinite_buying/logs/cron-reconcile.log
tail -n 100 /opt/auto_stock/strategies/infinite_buying/logs/orders.jsonl
```

3. 브로커 상태와 내부 상태 대조:

```bash
cd /opt/auto_stock
npm run infinite:reconcile -- --symbol TQQQ
```

불일치가 있으면 상태가 `MANUAL_HALT`로 전환됩니다. 이 상태에서는 추가 주문이 차단되어야 정상입니다.

4. 서버 상태 확인:

```bash
uptime
free -h
df -h
dmesg -T | grep -i -E 'killed process|out of memory|oom'
```

5. 원인별 대응:

```text
IP 제한 오류: 브로커 API key의 허용 IP에 VPS public IP를 등록
토큰 발급 실패: client id/secret, 계정 권한, API 사용 가능 상태 확인
권한 오류: 주문 권한과 계좌번호(TOSS_ACCOUNT_SEQ) 확인
rate limit: cron 빈도 축소, 즉시 반복 실행 중지
부분체결/미체결: reconcile 후 다음 장에서 상태 확인, 필요 시 브로커 앱에서 직접 취소
MANUAL_HALT: 내부 상태 파일과 브로커 보유수량/평단을 비교한 뒤 원인을 기록
```

6. 복구 후 재개:

```bash
npm test
npm run infinite:plan -- --symbol TQQQ
npm run infinite:summary -- --symbol TQQQ
```

알림과 로그가 정상이고 브로커 상태가 맞는 것을 확인한 뒤 `crontab -e`에서 `infinite:trade`를 다시 활성화합니다.

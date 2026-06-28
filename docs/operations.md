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

import dotenv from 'dotenv';

dotenv.config();

const MAX_MESSAGE_LENGTH = 1800;

export function createNotificationConfigFromEnv(env = process.env) {
  return {
    enabled: parseBool(env.ENABLE_NOTIFICATIONS, true),
    discordWebhookUrl: env.DISCORD_WEBHOOK_URL,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    telegramChatId: env.TELEGRAM_CHAT_ID
  };
}

export function hasNotificationTarget(config = createNotificationConfigFromEnv()) {
  return Boolean(
    config?.enabled !== false
    && (
      config?.discordWebhookUrl
      || (config?.telegramBotToken && config?.telegramChatId)
    )
  );
}

export async function notifyEvent(event, options = {}) {
  const config = options.config || createNotificationConfigFromEnv();
  if (!hasNotificationTarget(config)) {
    return { skipped: true, reason: 'NO_NOTIFICATION_TARGET' };
  }

  const message = formatNotificationMessage(event);
  const results = [];

  if (config.discordWebhookUrl) {
    results.push(await sendDiscord(config.discordWebhookUrl, message));
  }

  if (config.telegramBotToken && config.telegramChatId) {
    results.push(await sendTelegram({
      botToken: config.telegramBotToken,
      chatId: config.telegramChatId,
      message
    }));
  }

  return { skipped: false, results };
}

export async function notifySafely(event, options = {}) {
  try {
    return await notifyEvent(event, options);
  } catch (error) {
    if (options.throwOnError) throw error;
    console.error(`[notification] ${error.message}`);
    return { skipped: false, error };
  }
}

export function formatNotificationMessage(event) {
  const severity = event.severity || 'INFO';
  const title = getKoreanTitle(event);
  const details = normalizeDetails(event.details);
  const lines = [
    `[${severity}] ${title}`,
    event.strategy ? `전략: ${event.strategy}` : null,
    event.symbol ? `종목: ${event.symbol}` : null,
    event.state ? `상태: ${event.state}` : null,
    event.message ? `내용: ${translateMessage(event.message)}` : null,
    ...formatDetailLines(details),
    `시간: ${formatKstTime(event.timestamp)}`
  ].filter(Boolean);

  return redactSecrets(lines.join('\n')).slice(0, MAX_MESSAGE_LENGTH);
}

async function sendDiscord(webhookUrl, message) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message })
  });

  if (!response.ok) {
    throw new Error(`Discord notification failed: ${response.status} ${await safeResponseText(response)}`);
  }

  return { target: 'discord', ok: true };
}

async function sendTelegram({ botToken, chatId, message }) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    throw new Error(`Telegram notification failed: ${response.status} ${await safeResponseText(response)}`);
  }

  return { target: 'telegram', ok: true };
}

function redactSecrets(value) {
  return String(value)
    .replace(/(access[_-]?token|client[_-]?secret|bot[_-]?token|authorization)["':=\s]+[^"',\s]+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]');
}

function getKoreanTitle(event) {
  const titles = {
    HEARTBEAT: '자동매매 서버 생존 확인',
    TRADE_JOB_COMPLETED: '무한매수 주문 작업 완료',
    TRADE_JOB_FAILED: '무한매수 주문 작업 실패',
    RECONCILE_SYNCED: '무한매수 상태 동기화 정상',
    RECONCILE_MISMATCH: '무한매수 상태 불일치 감지',
    RECONCILE_JOB_FAILED: '무한매수 상태 동기화 실패',
    JOB_FAILED: '전략 작업 실패',
    SIGNAL_NO_ORDER: 'MA20 주문계획 없음',
    SIGNAL_DUPLICATE_PLAN: 'MA20 중복 주문계획 건너뜀',
    ORDER_PLAN_SAVED: 'MA20 주문계획 저장',
    ORDER_NO_DUE_PLAN: 'MA20 실행할 주문계획 없음',
    ORDER_DUPLICATE_SKIPPED: 'MA20 중복 주문 건너뜀',
    ORDER_BLOCKED: 'MA20 주문 차단',
    PAPER_ORDER_SAVED: 'MA20 Paper 주문 저장',
    LIVE_ORDER_COMPLETED: 'MA20 실거래 주문 완료'
  };
  return titles[event.type] || event.title || event.type || '자동매매 알림';
}

function translateMessage(message) {
  const messages = {
    'scheduled job host is alive': '스케줄 실행 서버가 정상 동작 중입니다.',
    'Broker and internal state are synced.': '브로커 상태와 내부 상태가 일치합니다.',
    'Broker and internal state differ. MANUAL_HALT required.': '브로커 상태와 내부 상태가 다릅니다. MANUAL_HALT 확인이 필요합니다.',
    'No due order plan.': '지금 실행할 주문계획이 없습니다.'
  };
  return messages[message] || message;
}

function normalizeDetails(details) {
  if (!details) return null;
  if (typeof details === 'string') return { details };
  return details;
}

function formatDetailLines(details) {
  if (!details) return [];

  const knownLines = [
    details.hostname ? `서버: ${details.hostname}` : null,
    details.uptimeSeconds != null ? `가동시간: ${formatDuration(details.uptimeSeconds)}` : null,
    details.loadAverage ? `부하: ${details.loadAverage.join(', ')}` : null,
    details.rssMb != null ? `메모리 RSS: ${details.rssMb} MB` : null,
    details.heapUsedMb != null ? `힙 사용량: ${details.heapUsedMb} MB` : null,
    details.buyOrders != null ? `매수 후보: ${details.buyOrders}` : null,
    details.sellOrders != null ? `매도 후보: ${details.sellOrders}` : null,
    details.submittedOrders != null ? `기록/전송 주문: ${details.submittedOrders}` : null,
    details.noTouch != null ? `NO_TOUCH: ${details.noTouch ? '예' : '아니오'}` : null,
    details.recalculatedRound != null ? `재계산 T: ${details.recalculatedRound}` : null,
    details.clientOrderId ? `주문 ID: ${details.clientOrderId}` : null,
    details.price != null ? `가격: ${details.price}` : null,
    details.reason ? `사유: ${details.reason}` : null
  ].filter(Boolean);

  const warnings = Array.isArray(details.warnings) && details.warnings.length
    ? [`경고: ${details.warnings.join(' | ')}`]
    : [];
  const differences = Array.isArray(details.differences) && details.differences.length
    ? [`차이: ${details.differences.join(' | ')}`]
    : [];

  const usedKeys = new Set([
    'hostname',
    'uptimeSeconds',
    'loadAverage',
    'rssMb',
    'heapUsedMb',
    'buyOrders',
    'sellOrders',
    'submittedOrders',
    'noTouch',
    'warnings',
    'recalculatedRound',
    'differences',
    'clientOrderId',
    'price',
    'reason'
  ]);
  const extra = Object.fromEntries(
    Object.entries(details).filter(([key]) => !usedKeys.has(key))
  );
  const extraLines = Object.keys(extra).length
    ? [`기타: ${JSON.stringify(extra, redactJsonSecret)}`]
    : [];

  return [...knownLines, ...warnings, ...differences, ...extraLines];
}

function redactJsonSecret(key, value) {
  if (/secret|token|authorization/i.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return redactSecrets(value);
  return value;
}

function formatDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total)) return String(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  if (hours > 0) return `${hours}시간 ${minutes}분 ${secs}초`;
  if (minutes > 0) return `${minutes}분 ${secs}초`;
  return `${secs}초`;
}

function formatKstTime(timestamp) {
  const date = timestamp ? new Date(timestamp) : new Date();
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

function parseBool(value, fallback) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'y'].includes(String(value).toLowerCase());
}

async function safeResponseText(response) {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return '';
  }
}

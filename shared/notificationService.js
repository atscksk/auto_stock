import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import dotenv from 'dotenv';

dotenv.config();

const execFileAsync = promisify(execFile);
const MAX_MESSAGE_LENGTH = 1800;

const ko = {
  strategy: '\uC804\uB7B5',
  symbol: '\uC885\uBAA9',
  state: '\uC0C1\uD0DC',
  message: '\uB0B4\uC6A9',
  time: '\uC2DC\uAC04',
  server: '\uC11C\uBC84',
  uptime: '\uAC00\uB3D9\uC2DC\uAC04',
  load: '\uBD80\uD558',
  rss: '\uBA54\uBAA8\uB9AC RSS',
  heap: '\uD799 \uC0AC\uC6A9\uB7C9',
  buyOrders: '\uB9E4\uC218 \uD6C4\uBCF4',
  sellOrders: '\uB9E4\uB3C4 \uD6C4\uBCF4',
  submittedOrders: '\uAE30\uB85D/\uC804\uC1A1 \uC8FC\uBB38',
  yes: '\uC608',
  no: '\uC544\uB2C8\uC624',
  recalculatedRound: '\uC7AC\uACC4\uC0B0 T',
  clientOrderId: '\uC8FC\uBB38 ID',
  price: '\uAC00\uACA9',
  reason: '\uC0AC\uC720',
  warnings: '\uACBD\uACE0',
  differences: '\uCC28\uC774',
  extra: '\uAE30\uD0C0'
};

const titles = {
  HEARTBEAT: '\uC790\uB3D9\uB9E4\uB9E4 \uC11C\uBC84 \uC0DD\uC874 \uD655\uC778',
  TRADE_JOB_COMPLETED: '\uBB34\uD55C\uB9E4\uC218 \uC8FC\uBB38 \uC791\uC5C5 \uC644\uB8CC',
  TRADE_JOB_FAILED: '\uBB34\uD55C\uB9E4\uC218 \uC8FC\uBB38 \uC791\uC5C5 \uC2E4\uD328',
  INFINITE_PLAN_CREATED: '무한매수 주문 계획',
  INFINITE_BUY_REJECTED: '무한매수 매수거부',
  INFINITE_SELL_REJECTED: '무한매수 매도거부',
  INFINITE_ORDER_FILLED: '무한매수 체결 확인',
  INFINITE_CYCLE_CLOSED: '무한매수 사이클 종료',
  INFINITE_DAILY_SUMMARY: '무한매수 일일 요약',
  ORDER_RATE_LIMIT: '무한매수 주문 API 요청 제한',
  ORDER_TOKEN_ERROR: '무한매수 주문 토큰 발급 실패',
  ORDER_IP_RESTRICTED: '무한매수 주문 IP 제한 오류',
  ORDER_PERMISSION_ERROR: '무한매수 주문 권한 오류',
  ORDER_IDEMPOTENCY_ERROR: '무한매수 주문 ID 중복/충돌',
  ORDER_TEMPORARY_ERROR: '무한매수 주문 일시 오류',
  RECONCILE_SYNCED: '\uBB34\uD55C\uB9E4\uC218 \uC0C1\uD0DC \uB3D9\uAE30\uD654 \uC815\uC0C1',
  RECONCILE_MISMATCH: '\uBB34\uD55C\uB9E4\uC218 \uC0C1\uD0DC \uBD88\uC77C\uCE58 \uAC10\uC9C0',
  RECONCILE_JOB_FAILED: '\uBB34\uD55C\uB9E4\uC218 \uC0C1\uD0DC \uB3D9\uAE30\uD654 \uC2E4\uD328',
  JOB_FAILED: '\uC804\uB7B5 \uC791\uC5C5 \uC2E4\uD328',
  SIGNAL_NO_ORDER: 'MA20 \uC8FC\uBB38\uACC4\uD68D \uC5C6\uC74C',
  SIGNAL_DUPLICATE_PLAN: 'MA20 \uC911\uBCF5 \uC8FC\uBB38\uACC4\uD68D \uAC74\uB108\uB700',
  ORDER_PLAN_SAVED: 'MA20 \uC8FC\uBB38\uACC4\uD68D \uC800\uC7A5',
  ORDER_NO_DUE_PLAN: 'MA20 \uC2E4\uD589\uD560 \uC8FC\uBB38\uACC4\uD68D \uC5C6\uC74C',
  ORDER_DUPLICATE_SKIPPED: 'MA20 \uC911\uBCF5 \uC8FC\uBB38 \uAC74\uB108\uB700',
  ORDER_BLOCKED: 'MA20 \uC8FC\uBB38 \uCC28\uB2E8',
  PAPER_ORDER_SAVED: 'MA20 Paper \uC8FC\uBB38 \uC800\uC7A5',
  LIVE_ORDER_COMPLETED: 'MA20 \uC2E4\uAC70\uB798 \uC8FC\uBB38 \uC644\uB8CC'
};

const translatedMessages = {
  'scheduled job host is alive': '\uC2A4\uCF00\uC904 \uC2E4\uD589 \uC11C\uBC84\uAC00 \uC815\uC0C1 \uB3D9\uC791 \uC911\uC785\uB2C8\uB2E4.',
  'Broker and internal state are synced.': '\uBE0C\uB85C\uCEE4 \uC0C1\uD0DC\uC640 \uB0B4\uBD80 \uC0C1\uD0DC\uAC00 \uC77C\uCE58\uD569\uB2C8\uB2E4.',
  'Broker and internal state differ. MANUAL_HALT required.': '\uBE0C\uB85C\uCEE4 \uC0C1\uD0DC\uC640 \uB0B4\uBD80 \uC0C1\uD0DC\uAC00 \uB2E4\uB985\uB2C8\uB2E4. MANUAL_HALT \uD655\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.',
  'No due order plan.': '\uC9C0\uAE08 \uC2E4\uD589\uD560 \uC8FC\uBB38\uACC4\uD68D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.'
};

export function createNotificationConfigFromEnv(env = process.env) {
  return {
    enabled: parseBool(env.ENABLE_NOTIFICATIONS, true),
    discordWebhookUrl: env.DISCORD_WEBHOOK_URL,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    telegramChatId: env.TELEGRAM_CHAT_ID,
    transport: env.NOTIFICATION_TRANSPORT || 'auto'
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
    results.push(await sendJson({
      url: config.discordWebhookUrl,
      body: { content: message },
      target: 'discord',
      transport: config.transport
    }));
  }

  if (config.telegramBotToken && config.telegramChatId) {
    results.push(await sendJson({
      url: `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
      body: {
        chat_id: config.telegramChatId,
        text: message,
        disable_web_page_preview: true
      },
      target: 'telegram',
      transport: config.transport
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
  const title = titles[event.type] || event.title || event.type || '\uC790\uB3D9\uB9E4\uB9E4 \uC54C\uB9BC';
  const details = normalizeDetails(event.details);
  const lines = [
    `[${severity}] ${title}`,
    event.strategy ? `${ko.strategy}: ${event.strategy}` : null,
    event.symbol ? `${ko.symbol}: ${event.symbol}` : null,
    event.state ? `${ko.state}: ${event.state}` : null,
    event.message ? `${ko.message}: ${translateMessage(event.message)}` : null,
    ...formatDetailLines(details),
    `${ko.time}: ${formatKstTime(event.timestamp)}`
  ].filter(Boolean);

  return redactSecrets(lines.join('\n')).slice(0, MAX_MESSAGE_LENGTH);
}

async function sendJson({ url, body, target, transport }) {
  if (transport === 'curl') {
    return sendJsonWithCurl({ url, body, target });
  }

  try {
    return await sendJsonWithFetch({ url, body, target });
  } catch (error) {
    if (transport === 'fetch') throw error;
    return sendJsonWithCurl({ url, body, target, fetchError: error });
  }
}

async function sendJsonWithFetch({ url, body, target }) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`${target} notification failed: ${response.status} ${await safeResponseText(response)}`);
  }

  return { target, ok: true, transport: 'fetch' };
}

async function sendJsonWithCurl({ url, body, target, fetchError }) {
  const { stdout, stderr } = await execFileAsync('curl', [
    '-sS',
    '-X',
    'POST',
    '-H',
    'Content-Type: application/json',
    '-d',
    JSON.stringify(body),
    url
  ], {
    timeout: 15000,
    maxBuffer: 1024 * 1024
  });

  let parsed = null;
  try {
    parsed = stdout ? JSON.parse(stdout) : null;
  } catch {
    parsed = null;
  }

  if (stderr) {
    throw new Error(`${target} curl notification failed: ${redactSecrets(stderr).slice(0, 300)}`);
  }
  if (parsed && parsed.ok === false) {
    throw new Error(`${target} notification failed: ${JSON.stringify(parsed).slice(0, 300)}`);
  }

  return {
    target,
    ok: true,
    transport: 'curl',
    fallbackFromFetch: Boolean(fetchError)
  };
}

function normalizeDetails(details) {
  if (!details) return null;
  if (typeof details === 'string') return { details };
  return details;
}

function formatDetailLines(details) {
  if (!details) return [];

  const knownLines = [
    details.hostname ? `${ko.server}: ${details.hostname}` : null,
    details.uptimeSeconds != null ? `${ko.uptime}: ${formatDuration(details.uptimeSeconds)}` : null,
    details.loadAverage ? `${ko.load}: ${details.loadAverage.join(', ')}` : null,
    details.rssMb != null ? `${ko.rss}: ${details.rssMb} MB` : null,
    details.heapUsedMb != null ? `${ko.heap}: ${details.heapUsedMb} MB` : null,
    details.buyOrders != null ? `${ko.buyOrders}: ${details.buyOrders}` : null,
    details.sellOrders != null ? `${ko.sellOrders}: ${details.sellOrders}` : null,
    details.submittedOrders != null ? `${ko.submittedOrders}: ${details.submittedOrders}` : null,
    details.currentRound != null ? `T: ${details.currentRound}` : null,
    details.averagePrice != null ? `평단: ${details.averagePrice}` : null,
    details.holdingQuantity != null ? `보유수량: ${details.holdingQuantity}` : null,
    details.expectedCashUsage != null ? `예상 현금사용: ${details.expectedCashUsage}` : null,
    details.buyOrderSummary ? `매수 주문: ${details.buyOrderSummary}` : null,
    details.sellOrderSummary ? `매도 주문: ${details.sellOrderSummary}` : null,
    details.filledOrderSummary ? `체결: ${details.filledOrderSummary}` : null,
    details.lastRuns ? `마지막 실행: ${formatLastRuns(details.lastRuns)}` : null,
    details.noTouch != null ? `NO_TOUCH: ${details.noTouch ? ko.yes : ko.no}` : null,
    details.recalculatedRound != null ? `${ko.recalculatedRound}: ${details.recalculatedRound}` : null,
    details.clientOrderId ? `${ko.clientOrderId}: ${details.clientOrderId}` : null,
    details.price != null ? `${ko.price}: ${details.price}` : null,
    details.reason ? `${ko.reason}: ${details.reason}` : null
  ].filter(Boolean);

  const warnings = Array.isArray(details.warnings) && details.warnings.length
    ? [`${ko.warnings}: ${details.warnings.join(' | ')}`]
    : [];
  const differences = Array.isArray(details.differences) && details.differences.length
    ? [`${ko.differences}: ${details.differences.join(' | ')}`]
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
    'currentRound',
    'averagePrice',
    'holdingQuantity',
    'expectedCashUsage',
    'buyOrderSummary',
    'sellOrderSummary',
    'filledOrderSummary',
    'lastRuns',
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
    ? [`${ko.extra}: ${JSON.stringify(extra, redactJsonSecret)}`]
    : [];

  return [...knownLines, ...warnings, ...differences, ...extraLines];
}

function translateMessage(message) {
  return translatedMessages[message] || message;
}

function redactJsonSecret(key, value) {
  if (/secret|token|authorization/i.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return redactSecrets(value);
  return value;
}

function redactSecrets(value) {
  return String(value)
    .replace(/(access[_-]?token|client[_-]?secret|bot[_-]?token|authorization)["':=\s]+[^"',\s]+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]');
}

function formatDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total)) return String(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  if (hours > 0) return `${hours}\uC2DC\uAC04 ${minutes}\uBD84 ${secs}\uCD08`;
  if (minutes > 0) return `${minutes}\uBD84 ${secs}\uCD08`;
  return `${secs}\uCD08`;
}

function formatLastRuns(lastRuns) {
  return Object.entries(lastRuns || {})
    .map(([name, timestamp]) => `${name}=${formatKstTime(timestamp)}`)
    .join(' | ');
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

export function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function todayKstCompact(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}${get('month')}${get('day')}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function sanitizeForLog(value) {
  if (value == null) return value;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text
    .replace(/(client_secret=)[^&\s"]+/gi, '$1[REDACTED]')
    .replace(/("client_secret"\s*:\s*")[^"]+/gi, '$1[REDACTED]')
    .replace(/(access_token=)[^&\s"]+/gi, '$1[REDACTED]')
    .replace(/("access_token"\s*:\s*")[^"]+/gi, '$1[REDACTED]')
    .replace(/(Authorization:\s*Bearer\s+)[^\s"]+/gi, '$1[REDACTED]');
}

export async function parseJsonSafely(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 1000) };
  }
}

export function unwrapResult(body) {
  return body && Object.prototype.hasOwnProperty.call(body, 'result') ? body.result : body;
}

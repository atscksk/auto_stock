const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 1000;

export function classifyOrderError(error) {
  const status = Number(error?.status || error?.cause?.status || 0);
  const text = [
    error?.message,
    error?.body,
    error?.cause?.message
  ].filter(Boolean).join(' ');

  if (/IP address not allowed|ip.*not allowed|ip.*허용/i.test(text)) {
    return {
      code: 'IP_NOT_ALLOWED',
      label: 'IP 제한 오류',
      retryable: false,
      alertType: 'ORDER_IP_RESTRICTED',
      severity: 'ERROR'
    };
  }

  if (/Token issue failed/i.test(text)) {
    return {
      code: 'TOKEN_ISSUE_FAILED',
      label: '토큰 발급 실패',
      retryable: false,
      alertType: 'ORDER_TOKEN_ERROR',
      severity: 'ERROR'
    };
  }

  if (status === 401 || status === 403 || /access_denied|permission|권한/i.test(text)) {
    return {
      code: 'PERMISSION_DENIED',
      label: '권한 오류',
      retryable: false,
      alertType: 'ORDER_PERMISSION_ERROR',
      severity: 'ERROR'
    };
  }

  if (status === 409 || /same clientOrderId|clientOrderId|idempotency/i.test(text)) {
    return {
      code: 'IDEMPOTENCY_CONFLICT',
      label: '주문 ID 중복/충돌',
      retryable: false,
      alertType: 'ORDER_IDEMPOTENCY_ERROR',
      severity: 'ERROR'
    };
  }

  if (status === 429 || /rate limit|too many requests/i.test(text)) {
    return {
      code: 'RATE_LIMIT',
      label: 'API 요청 제한',
      retryable: true,
      alertType: 'ORDER_RATE_LIMIT',
      severity: 'WARN'
    };
  }

  if (status >= 500 || /fetch failed|ETIMEDOUT|ECONNRESET|EAI_AGAIN|temporary/i.test(text)) {
    return {
      code: 'TEMPORARY_BROKER_ERROR',
      label: '일시적 브로커/API 오류',
      retryable: true,
      alertType: 'ORDER_TEMPORARY_ERROR',
      severity: 'WARN'
    };
  }

  return {
    code: 'ORDER_FAILED',
    label: '주문 실패',
    retryable: false,
    alertType: 'TRADE_JOB_FAILED',
    severity: 'ERROR'
  };
}

export async function withOrderRetry(operation, {
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
  sleep = defaultSleep
} = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation({ attempt });
    } catch (error) {
      const classification = classifyOrderError(error);
      error.classification = classification;
      error.attempt = attempt;
      lastError = error;

      if (!classification.retryable || attempt >= maxAttempts) {
        throw error;
      }

      await sleep(calculateBackoffMs(attempt, baseDelayMs));
    }
  }

  throw lastError;
}

export function calculateBackoffMs(attempt, baseDelayMs = DEFAULT_BASE_DELAY_MS) {
  return Math.round(baseDelayMs * (2 ** Math.max(0, attempt - 1)));
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

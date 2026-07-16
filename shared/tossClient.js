import { parseJsonSafely, sanitizeForLog, unwrapResult } from './utils.js';

const DEFAULT_BASE_URL = 'https://openapi.tossinvest.com';

export function createTossClient({
  clientId,
  clientSecret,
  baseUrl = DEFAULT_BASE_URL
}) {
  if (!clientId) throw new Error('TOSS_CLIENT_ID is required.');
  if (!clientSecret) throw new Error('TOSS_CLIENT_SECRET is required.');

  let tokenCache = null;

  async function getAccessToken() {
    const now = Date.now();
    if (tokenCache && now < tokenCache.expiresAt - 60_000) {
      return tokenCache.accessToken;
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    });

    const response = await fetch(`${baseUrl}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const data = await parseJsonSafely(response);

    if (!response.ok) {
      throw apiError('Token issue failed', response.status, data);
    }

    if (!data?.access_token || !data?.expires_in) {
      throw new Error('Token response is missing access_token or expires_in.');
    }

    tokenCache = {
      accessToken: data.access_token,
      expiresAt: now + Number(data.expires_in) * 1000
    };
    return tokenCache.accessToken;
  }

  async function request(path, options = {}) {
    const accessToken = await getAccessToken();
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(options.query || {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      ...(options.accountSeq ? { 'X-Tossinvest-Account': String(options.accountSeq) } : {}),
      ...(options.headers || {})
    };

    let body;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body
    });
    const data = await parseJsonSafely(response);

    if (!response.ok) {
      throw apiError(`API request failed: ${options.method || 'GET'} ${path}`, response.status, data);
    }

    return unwrapResult(data);
  }

  async function getAccounts() {
    return request('/api/v1/accounts');
  }

  async function getCandles({ symbol, interval = '1d', count = 100, before, adjusted = true }) {
    const result = await request('/api/v1/candles', {
      query: { symbol, interval, count, before, adjusted }
    });
    return {
      candles: result?.candles || [],
      nextBefore: result?.nextBefore || null
    };
  }

  async function getDailyCandles(symbol, count = 40) {
    const result = await getCandles({ symbol, interval: '1d', count, adjusted: true });
    return result.candles;
  }

  async function getHoldings(accountSeq, symbol) {
    return request('/api/v1/holdings', {
      accountSeq,
      query: { symbol }
    });
  }

  async function createOrder(accountSeq, order, guard = {}) {
    if (guard.mode !== 'LIVE' || guard.liveConfirm !== 'YES' || guard.riskPassed !== true) {
      throw new Error('Live order API call blocked by safety guard.');
    }
    return request('/api/v1/orders', {
      method: 'POST',
      accountSeq,
      body: order
    });
  }

  async function getOrders(accountSeq, { status = 'OPEN', symbol, from, to, cursor, limit } = {}) {
    return request('/api/v1/orders', {
      accountSeq,
      query: { status, symbol, from, to, cursor, limit }
    });
  }

  async function getOrder(accountSeq, orderId) {
    if (!orderId) throw new Error('orderId is required.');
    return request(`/api/v1/orders/${encodeURIComponent(orderId)}`, {
      accountSeq
    });
  }

  async function getBuyingPower(accountSeq, currency = 'KRW') {
    const result = await request('/api/v1/buying-power', {
      accountSeq,
      query: { currency }
    });
    return Number(result?.cashBuyingPower);
  }

  async function getSellableQuantity(accountSeq, symbol) {
    const result = await request('/api/v1/sellable-quantity', {
      accountSeq,
      query: { symbol }
    });
    return Number(result?.sellableQuantity);
  }

  async function getKrMarketCalendar(date) {
    return request('/api/v1/market-calendar/KR', {
      query: { date }
    });
  }

  return {
    getAccessToken,
    request,
    getAccounts,
    getCandles,
    getDailyCandles,
    getHoldings,
    createOrder,
    getOrders,
    getOrder,
    getBuyingPower,
    getSellableQuantity,
    getKrMarketCalendar
  };
}

function apiError(message, status, body) {
  const safeBody = sanitizeForLog(JSON.stringify(body).slice(0, 1000));
  const error = new Error(`${message} (status=${status}) body=${safeBody}`);
  error.status = status;
  error.body = safeBody;
  return error;
}

import { toNumber } from '../../../shared/utils.js';

export function ma20Strategy(candles, options = {}) {
  const maWindow = options.maWindow ?? 20;
  const buyThreshold = options.buyThreshold ?? 1.00;
  const sellThreshold = options.sellThreshold ?? 0.97;

  if (!Array.isArray(candles)) {
    return hold('candles input must be an array.');
  }

  const sorted = [...candles].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  if (sorted.length < maWindow) {
    return hold(`Not enough candles. required=${maWindow}, actual=${sorted.length}.`);
  }

  const recent = sorted.slice(-maWindow);
  const closes = recent.map((candle) => toNumber(candle.closePrice));
  if (closes.some((price) => price == null)) {
    return hold('closePrice contains an invalid number.');
  }

  const close = closes.at(-1);
  const ma20 = closes.reduce((sum, price) => sum + price, 0) / maWindow;
  const buyLine = ma20 * buyThreshold;
  const sellLine = ma20 * sellThreshold;
  const diagnostics = buildDiagnostics({ close, ma20, buyLine, sellLine });

  if (close >= buyLine) {
    return { signal: 'BUY', close, ma20, buyLine, sellLine, ...diagnostics, reason: 'close >= MA20 * BUY_THRESHOLD' };
  }

  if (close <= sellLine) {
    return { signal: 'SELL', close, ma20, buyLine, sellLine, ...diagnostics, reason: 'close <= MA20 * SELL_THRESHOLD' };
  }

  return { signal: 'HOLD', close, ma20, buyLine, sellLine, ...diagnostics, reason: 'threshold range.' };
}

function hold(reason) {
  return {
    signal: 'HOLD',
    close: null,
    ma20: null,
    buyLine: null,
    sellLine: null,
    closeToMaPct: null,
    buyGapPct: null,
    sellGapPct: null,
    reason
  };
}

function buildDiagnostics({ close, ma20, buyLine, sellLine }) {
  return {
    closeToMaPct: roundPercent((close / ma20 - 1) * 100),
    buyGapPct: roundPercent((close / buyLine - 1) * 100),
    sellGapPct: roundPercent((close / sellLine - 1) * 100)
  };
}

function roundPercent(value) {
  return Number(Number(value).toFixed(4));
}

import { toNumber } from '../../../shared/utils.js';

export function ma20Strategy(candles, options = {}) {
  const maWindow = options.maWindow ?? 20;
  const buyThreshold = options.buyThreshold ?? 1.03;
  const sellThreshold = options.sellThreshold ?? 0.97;

  if (!Array.isArray(candles)) {
    return hold('candles 입력이 배열이 아닙니다.');
  }

  const sorted = [...candles].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  if (sorted.length < maWindow) {
    return hold(`캔들이 부족합니다. 필요=${maWindow}, 현재=${sorted.length}`);
  }

  const recent = sorted.slice(-maWindow);
  const closes = recent.map((candle) => toNumber(candle.closePrice));
  if (closes.some((price) => price == null)) {
    return hold('closePrice에 유효하지 않은 숫자가 있습니다.');
  }

  const close = closes.at(-1);
  const ma20 = closes.reduce((sum, price) => sum + price, 0) / maWindow;
  const buyLine = ma20 * buyThreshold;
  const sellLine = ma20 * sellThreshold;

  if (close >= buyLine) {
    return { signal: 'BUY', close, ma20, buyLine, sellLine, reason: 'close >= MA20 * BUY_THRESHOLD' };
  }

  if (close <= sellLine) {
    return { signal: 'SELL', close, ma20, buyLine, sellLine, reason: 'close <= MA20 * SELL_THRESHOLD' };
  }

  return { signal: 'HOLD', close, ma20, buyLine, sellLine, reason: 'threshold 범위 안에 있습니다.' };
}

function hold(reason) {
  return {
    signal: 'HOLD',
    close: null,
    ma20: null,
    buyLine: null,
    sellLine: null,
    reason
  };
}

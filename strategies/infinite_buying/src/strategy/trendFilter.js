import { movingAverage } from './calculators.js';

export function evaluateTrendMa200(input) {
  const usesReference = Boolean(Array.isArray(input.trendCandles) && input.trendCandles.length);
  const candles = usesReference ? input.trendCandles : input.dailyCandles;
  const symbol = usesReference ? (input.trendSymbol || input.symbol) : input.symbol;
  const price = Number(usesReference
    ? input.trendPrice || latestClose(candles) || 0
    : input.currentPrice || 0);
  const ma200 = Array.isArray(candles) && candles.length ? movingAverage(candles, 200) : null;

  return {
    symbol,
    price,
    ma200,
    available: ma200 != null && Number.isFinite(price) && price > 0,
    usesReference,
    fallbackToTarget: Boolean(input.trendSymbol && !usesReference)
  };
}

function latestClose(candles = []) {
  if (!Array.isArray(candles) || candles.length === 0) return null;
  const sorted = [...candles].sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp));
  const latest = sorted.at(-1);
  return latest?.close ?? latest?.closePrice ?? null;
}

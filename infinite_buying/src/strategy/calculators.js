import { divide, multiply, round, toNumber } from '../utils/decimal.js';

export function calculateUnitAmount(strategyCapital, totalSplit) {
  return divide(strategyCapital, totalSplit, 2);
}

export function calculateCurrentRound(realizedBuyAmountInCycle, unitAmount, precision = 4) {
  if (toNumber(unitAmount) <= 0) throw new Error('unitAmount must be greater than zero.');
  return Number(divide(realizedBuyAmountInCycle, unitAmount, precision));
}

export function calculateStarPercent(totalRound, currentRound) {
  return round(Number(totalRound) - 2 * Number(currentRound), 4);
}

export function calculateStarPrice(averagePrice, starPercent) {
  const multiplier = 1 + Number(starPercent) / 100;
  return normalizeUsPrice(multiply(averagePrice, multiplier));
}

export function calculateLimit15Price(confirmedAveragePriceAfterClose) {
  return normalizeUsPrice(multiply(confirmedAveragePriceAfterClose, 1.15));
}

export function normalizeUsPrice(value) {
  const price = toNumber(value);
  if (price >= 1) return round(price, 2);
  return round(price, 4);
}

export function calculateAverageLossPercent(currentPrice, averagePrice) {
  if (Number(averagePrice) <= 0) return 0;
  return ((Number(currentPrice) - Number(averagePrice)) / Number(averagePrice)) * 100;
}

export function calculateDayDropPercent(currentPrice, previousClose) {
  if (Number(previousClose) <= 0) return 0;
  return ((Number(currentPrice) - Number(previousClose)) / Number(previousClose)) * 100;
}

export function movingAverage(candles, window) {
  const closes = [...candles]
    .sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp))
    .map((candle) => Number(candle.close ?? candle.closePrice))
    .filter(Number.isFinite);
  if (closes.length < window) return null;
  const sample = closes.slice(-window);
  return sample.reduce((sum, close) => sum + close, 0) / sample.length;
}

export function countDownDays(candles, lookback) {
  const sorted = [...candles]
    .sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp))
    .slice(-lookback);
  return sorted.filter((candle) => Number(candle.close ?? candle.closePrice) < Number(candle.open ?? candle.openPrice)).length;
}

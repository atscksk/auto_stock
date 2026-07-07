import {
  calculateAverageLossPercent,
  calculateDayDropPercent,
  countDownDays
} from './calculators.js';
import { evaluateTrendMa200 } from './trendFilter.js';

export function evaluateRiskFilters(input) {
  const warnings = [];
  const blocks = [];
  let buySizeMultiplier = 1;
  let riskLevel = 'NORMAL';

  const totalEquity = Number(input.cash || 0) + Number(input.holdingQuantity || 0) * Number(input.currentPrice || 0);
  const cashRatio = totalEquity > 0 ? Number(input.cash || 0) / totalEquity : 0;
  if (cashRatio < input.riskSettings.minCashReserveRatio) {
    blocks.push('CASH_RESERVE_BELOW_MINIMUM');
    warnings.push(`Cash reserve ${formatPercent(cashRatio)} is below minimum ${formatPercent(input.riskSettings.minCashReserveRatio)}.`);
  }

  const dayDrop = calculateDayDropPercent(input.currentPrice, input.previousClose);
  if (input.riskSettings.enableCrashFilter !== false && dayDrop <= input.riskSettings.crashDropPercent) {
    blocks.push('CRASH_FILTER');
    warnings.push(`Current price is ${dayDrop.toFixed(2)}% below previous close.`);
    riskLevel = 'HIGH';
  }

  const averageLoss = calculateAverageLossPercent(input.currentPrice, input.averagePrice);
  if (averageLoss <= input.riskSettings.maxLossStop) {
    blocks.push('MAX_LOSS_STOP');
    warnings.push(`Average loss ${averageLoss.toFixed(2)}% reached stop threshold.`);
    riskLevel = 'STOP';
  } else if (averageLoss <= input.riskSettings.maxLossManualHalt) {
    blocks.push('MAX_LOSS_MANUAL_HALT');
    warnings.push(`Average loss ${averageLoss.toFixed(2)}% reached manual halt threshold.`);
    riskLevel = 'HALT';
  } else if (averageLoss <= input.riskSettings.maxLossPause) {
    blocks.push('MAX_LOSS_PAUSE');
    warnings.push(`Average loss ${averageLoss.toFixed(2)}% reached pause threshold.`);
    riskLevel = 'HIGH';
  }

  if ((input.dailyCandles?.length || input.trendCandles?.length) && input.riskSettings.enableTrendFilter !== false) {
    if (input.dailyCandles?.length) {
      const downDays = countDownDays(input.dailyCandles, input.riskSettings.consecutiveDownDaysLookback);
      if (downDays >= input.riskSettings.consecutiveDownDaysLimit) {
        buySizeMultiplier *= 0.5;
        warnings.push(`Recent down days filter active: ${downDays}/${input.riskSettings.consecutiveDownDaysLookback}.`);
      }
    }

    const trend = evaluateTrendMa200(input);
    if (trend.fallbackToTarget) {
      warnings.push(`Reference trend data for ${input.trendSymbol} is unavailable; falling back to ${input.symbol} MA200.`);
    }
    if (!trend.available) {
      warnings.push(`${trend.symbol} MA200 unavailable; new cycle buying is blocked when there is no existing position.`);
      if (Number(input.holdingQuantity || 0) === 0) blocks.push('MA200_UNAVAILABLE_NEW_CYCLE');
    } else if (trend.price < trend.ma200) {
      buySizeMultiplier *= Number(input.holdingQuantity || 0) > 0 ? 0.5 : 0;
      warnings.push(`Trend filter active: ${trend.symbol} price is below MA200 (${trend.ma200.toFixed(2)}).`);
      if (Number(input.holdingQuantity || 0) === 0) blocks.push('TREND_FILTER_NEW_CYCLE');
    }
  }

  return {
    buyAllowed: blocks.length === 0,
    sellAllowed: true,
    blocks,
    warnings,
    riskLevel,
    buySizeMultiplier
  };
}

function formatPercent(value) {
  return `${(Number(value) * 100).toFixed(1)}%`;
}

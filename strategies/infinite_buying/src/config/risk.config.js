export const riskConfig = {
  minCashReserveRatio: 0.2,
  initialCashReserveRatio: 0.3,
  crashDropPercent: -8,
  maxLossPause: -30,
  maxLossManualHalt: -45,
  maxLossStop: -60,
  bigBuyTriggerLossPercent: -5,
  bigBuyMaxCashRatio: 0.2,
  bigBuyMaxCapitalRatio: 0.3,
  bigBuyMinCashRatio: 0.25,
  reverseLookbackDays: 5,
  reverseReboundPercent: 3,
  reverseExitProfitPercent: 0,
  reverseExitQuantityRatio: 1,
  sellRejectLimit: 5,
  minAverageImprovementPercent: 0,
  consecutiveDownDaysLookback: 5,
  consecutiveDownDaysLimit: 4,
  brokerAveragePriceTolerancePercent: 0.05
};

export const symbolRiskConfig = {
  TQQQ: {
    minCashReserveRatio: 0.2,
    crashDropPercent: -8,
    maxLossPause: -30,
    maxLossManualHalt: -45,
    maxLossStop: -60,
    consecutiveDownDaysLookback: 5,
    consecutiveDownDaysLimit: 4
  },
  SOXL: {
    minCashReserveRatio: 0.25,
    crashDropPercent: -12,
    maxLossPause: -35,
    maxLossManualHalt: -50,
    maxLossStop: -65,
    bigBuyMinCashRatio: 0.3,
    consecutiveDownDaysLookback: 6,
    consecutiveDownDaysLimit: 5
  }
};

export function resolveRiskConfig(symbol, overrides = {}) {
  const normalizedSymbol = String(symbol || '').toUpperCase();
  return {
    ...riskConfig,
    ...(symbolRiskConfig[normalizedSymbol] || {}),
    ...overrides
  };
}

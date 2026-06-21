export const strategyConfig = {
  symbols: ['TQQQ'],
  totalSplit: 40,
  totalRound: 20,
  cashReserveRatio: 0.3,
  maxAllocation: {
    TQQQ: 0.5,
    SOXL: 0.3
  },
  enableBigBuy: false,
  enableReverseMode: true,
  enableBuyReject: true,
  enableSellReject: true,
  enableTrendFilter: true,
  enableCrashFilter: true,
  enableAutoOrder: false,
  includeFeesInRoundCalculation: false,
  roundPrecision: 4
};

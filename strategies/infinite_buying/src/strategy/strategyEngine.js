import { appConfig } from '../config/index.js';
import { resolveRiskConfig } from '../config/risk.config.js';
import { calculateCurrentRound, calculateUnitAmount } from './calculators.js';
import { generateOrderPlan } from './orderPlanner.js';

export function buildStrategyInput({
  symbol,
  state,
  market,
  portfolio,
  orders = {},
  marketCalendar = {},
  now = new Date()
}) {
  const strategyCapital = state.strategyCapital || process.env.IB_STRATEGY_CAPITAL || '10000.00';
  const unitAmount = state.unitAmount || calculateUnitAmount(strategyCapital, appConfig.strategy.totalSplit);
  const realizedBuyAmountInCycle = state.realizedBuyAmountInCycle || '0.00';
  const currentRound = state.currentRound ?? calculateCurrentRound(
    realizedBuyAmountInCycle,
    unitAmount,
    appConfig.strategy.roundPrecision
  );

  return {
    symbol,
    currentPrice: market.currentPrice,
    previousClose: market.previousClose || market.currentPrice,
    averagePrice: firstPositive(portfolio.averagePrice, state.averagePrice, market.currentPrice),
    confirmedAveragePriceAfterClose: firstPositive(
      state.confirmedAveragePriceAfterClose,
      portfolio.averagePrice,
      state.averagePrice,
      market.currentPrice
    ),
    holdingQuantity: Number(portfolio.holdingQuantity || state.holdingQuantity || 0),
    availableSellQuantity: Number(portfolio.availableSellQuantity || portfolio.holdingQuantity || state.holdingQuantity || 0),
    cash: portfolio.cash || process.env.IB_CASH || strategyCapital,
    buyingPower: portfolio.buyingPower || portfolio.cash || process.env.IB_CASH || strategyCapital,
    strategyCapital,
    unitAmount,
    totalRound: state.totalRound || appConfig.strategy.totalRound,
    currentRound,
    dailyCandles: market.dailyCandles || [],
    trendSymbol: market.trendSymbol || appConfig.strategy.trendReferenceSymbols?.[symbol],
    trendPrice: market.trendPrice,
    trendCandles: market.trendCandles || [],
    openOrders: orders.openOrders || [],
    filledOrders: orders.filledOrders || [],
    strategyState: state,
    bigBuyAmountInCycle: state.bigBuyAmountInCycle || '0.00',
    riskSettings: resolveRiskConfig(symbol, market.riskSettings),
    enableCrashFilter: appConfig.strategy.enableCrashFilter,
    enableTrendFilter: market.enableTrendFilter ?? appConfig.strategy.enableTrendFilter,
    enableBigBuy: market.enableBigBuy ?? appConfig.strategy.enableBigBuy,
    enableReverseMode: market.enableReverseMode ?? appConfig.strategy.enableReverseMode,
    marketCalendar,
    schedule: appConfig.schedule,
    now
  };
}

export function createPlan(context) {
  return generateOrderPlan(buildStrategyInput(context));
}

function firstPositive(...values) {
  return values.find((value) => Number(value) > 0) || values.find((value) => value != null) || '0.00';
}

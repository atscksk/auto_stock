import { appConfig } from '../config/index.js';
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
    openOrders: orders.openOrders || [],
    filledOrders: orders.filledOrders || [],
    strategyState: state,
    riskSettings: appConfig.risk,
    enableCrashFilter: appConfig.strategy.enableCrashFilter,
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

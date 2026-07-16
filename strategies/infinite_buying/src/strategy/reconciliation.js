import { appConfig } from '../config/index.js';
import { calculateCurrentRound } from './calculators.js';
import { decideNormalState, StrategyState } from './stateMachine.js';

export function reconcileState({ state, broker, filledOrders = [] }) {
  const filledBuyOrders = filledOrders.filter((order) => order.side === 'BUY');
  const calculatedRealizedBuyAmountInCycle = filledBuyOrders
    .reduce((sum, order) => sum + Number(order.filledAmount ?? Number(order.price || 0) * Number(order.filledQuantity || order.quantity || 0)), 0)
    .toFixed(2);
  const realizedBuyAmountInCycle = filledBuyOrders.length > 0
    ? calculatedRealizedBuyAmountInCycle
    : String(state.realizedBuyAmountInCycle || '0.00');

  const recalculatedRound = calculateCurrentRound(
    realizedBuyAmountInCycle,
    state.unitAmount,
    appConfig.strategy.roundPrecision
  );

  const differences = [];
  if (Number(broker.holdingQuantity || 0) !== Number(state.holdingQuantity || 0)) {
    differences.push(`Holding quantity mismatch: broker=${broker.holdingQuantity}, internal=${state.holdingQuantity}.`);
  }

  const tolerance = appConfig.risk.brokerAveragePriceTolerancePercent;
  const brokerAveragePrice = Number(broker.averagePrice || 0);
  const internalAveragePrice = Number(state.averagePrice || 0);
  if (brokerAveragePrice > 0 && internalAveragePrice > 0) {
    const diffPercent = Math.abs((brokerAveragePrice - internalAveragePrice) / internalAveragePrice) * 100;
    if (diffPercent > tolerance) {
      differences.push(`Average price mismatch: broker=${broker.averagePrice}, internal=${state.averagePrice}.`);
    }
  }

  const isSynced = differences.length === 0;
  return {
    symbol: state.symbol,
    cycleId: state.cycleId,
    brokerHoldingQuantity: Number(broker.holdingQuantity || 0),
    internalHoldingQuantity: Number(state.holdingQuantity || 0),
    brokerAveragePrice: String(broker.averagePrice || '0.00'),
    internalAveragePrice: String(state.averagePrice || '0.00'),
    realizedBuyAmountInCycle,
    recalculatedRound,
    isSynced,
    differences,
    nextState: isSynced ? decideNormalState(recalculatedRound, state.totalRound) : StrategyState.MANUAL_HALT
  };
}

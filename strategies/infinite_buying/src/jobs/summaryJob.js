import { loadOrderRecords } from '../storage/orderStore.js';
import { loadRuntimeState, markStrategyRun } from '../storage/runtimeStore.js';
import { loadState } from '../storage/stateStore.js';

export function runSummaryJob({ symbol }) {
  const state = loadState(symbol);
  const orders = loadOrderRecords().filter((order) => order.symbol === symbol);
  const openOrders = orders.filter((order) => order.isTerminal !== true && !['FILLED', 'CANCELED', 'EXPIRED', 'REJECTED'].includes(String(order.status || '').toUpperCase()));
  const filledOrders = orders.filter((order) => Number(order.filledQuantity || 0) > 0);
  const summary = {
    state: state.state,
    currentRound: state.currentRound,
    averagePrice: state.averagePrice,
    holdingQuantity: state.holdingQuantity,
    realizedBuyAmountInCycle: state.realizedBuyAmountInCycle,
    openOrders: openOrders.length,
    filledOrders: filledOrders.length,
    lastRuns: loadRuntimeState().lastRuns || {},
    brokerSyncedAt: state.brokerSyncedAt,
    manualHaltReason: state.manualHaltReason
  };

  markStrategyRun('infinite:summary');
  return summary;
}

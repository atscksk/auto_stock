import { buildRuntimeContext } from '../services/contextService.js';
import { appConfig } from '../config/index.js';
import { createConfiguredTossClient } from '../clients/tossClient.js';
import { fetchOrderStatuses } from '../services/orderService.js';
import {
  loadFilledOrderExecutions,
  loadOpenOrderRecords,
  updateOrderStatuses
} from '../storage/orderStore.js';
import { markStrategyRun } from '../storage/runtimeStore.js';
import { reconcileState } from '../strategy/reconciliation.js';
import { saveState } from '../storage/stateStore.js';
import { StrategyState } from '../strategy/stateMachine.js';

export async function runReconcileJob({ symbol, args = {} }) {
  let orderStatusResult = null;
  if (appConfig.mode === 'LIVE') {
    const openOrders = loadOpenOrderRecords().filter((order) => order.brokerOrderId);
    if (openOrders.length > 0) {
      const statuses = await fetchOrderStatuses({
        tossClient: createConfiguredTossClient(),
        accountSeq: appConfig.toss.accountSeq,
        orders: openOrders,
        mode: appConfig.mode
      });
      orderStatusResult = updateOrderStatuses(statuses);
    }
  }

  const context = buildRuntimeContext(symbol, args);
  const result = reconcileState({
    state: context.state,
    broker: {
      holdingQuantity: context.portfolio.holdingQuantity,
      averagePrice: context.portfolio.averagePrice
    },
    filledOrders: loadFilledOrderExecutions()
  });

  const nextState = {
    ...context.state,
    state: result.isSynced ? result.nextState : StrategyState.MANUAL_HALT,
    currentRound: result.recalculatedRound,
    holdingQuantity: result.brokerHoldingQuantity,
    averagePrice: result.brokerAveragePrice,
    confirmedAveragePriceAfterClose: result.brokerAveragePrice,
    realizedBuyAmountInCycle: result.realizedBuyAmountInCycle,
    brokerSyncedAt: new Date().toISOString(),
    manualHaltReason: result.isSynced ? null : result.differences.join(' ')
  };

  saveState(symbol, nextState);
  markStrategyRun('infinite:reconcile');
  return {
    result: {
      ...result,
      cycleClosed: Number(context.state.holdingQuantity || 0) > 0 && Number(result.brokerHoldingQuantity || 0) === 0
    },
    nextState,
    orderStatusResult
  };
}

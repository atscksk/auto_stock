import { buildRuntimeContext } from '../services/contextService.js';
import { reconcileState } from '../strategy/reconciliation.js';
import { saveState } from '../storage/stateStore.js';
import { StrategyState } from '../strategy/stateMachine.js';

export function runReconcileJob({ symbol, args = {} }) {
  const context = buildRuntimeContext(symbol, args);
  const result = reconcileState({
    state: context.state,
    broker: {
      holdingQuantity: context.portfolio.holdingQuantity,
      averagePrice: context.portfolio.averagePrice
    },
    filledOrders: []
  });

  const nextState = {
    ...context.state,
    state: result.isSynced ? result.nextState : StrategyState.MANUAL_HALT,
    currentRound: result.recalculatedRound,
    brokerSyncedAt: new Date().toISOString(),
    manualHaltReason: result.isSynced ? null : result.differences.join(' ')
  };

  saveState(symbol, nextState);
  return { result, nextState };
}

import { parseArgs } from './args.js';
import { buildCliContext } from './context.js';
import { reconcileState } from '../strategy/reconciliation.js';
import { saveState } from '../storage/stateStore.js';
import { StrategyState } from '../strategy/stateMachine.js';

const args = parseArgs();
const symbol = String(args.symbol || process.env.IB_SYMBOL || 'TQQQ').toUpperCase();
const context = buildCliContext(symbol, args);

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
  state: result.nextState,
  currentRound: result.recalculatedRound,
  brokerSyncedAt: new Date().toISOString(),
  manualHaltReason: result.isSynced ? null : result.differences.join(' '),
  ...(result.isSynced ? {} : { state: StrategyState.MANUAL_HALT })
};

saveState(symbol, nextState);

console.log(`[동기화] ${result.isSynced ? 'OK' : 'MANUAL_HALT'}`);
console.log(`[T] ${result.recalculatedRound}`);
if (result.differences.length) {
  console.log('[차이]');
  for (const difference of result.differences) console.log(`- ${difference}`);
}

import { parseArgs } from './args.js';
import { runReconcileJob } from '../jobs/reconcileJob.js';
import { notifySafely } from '../../../../shared/notificationService.js';
import { notifyCycleClosed, notifyFilledOrders } from '../services/strategyNotificationService.js';

const args = parseArgs();
const symbol = String(args.symbol || process.env.IB_SYMBOL || 'TQQQ').toUpperCase();

try {
  const { result, orderStatusResult } = await runReconcileJob({ symbol, args });

  console.log(`[sync] ${result.isSynced ? 'OK' : 'MANUAL_HALT'}`);
  console.log(`[T] ${result.recalculatedRound}`);
  if (result.differences.length) {
    console.log('[differences]');
    for (const difference of result.differences) console.log(`- ${difference}`);
  }

  await notifySafely({
    type: result.isSynced ? 'RECONCILE_SYNCED' : 'RECONCILE_MISMATCH',
    title: result.isSynced ? 'Infinite buying reconcile OK' : 'Infinite buying reconcile mismatch',
    severity: result.isSynced ? 'INFO' : 'ERROR',
    strategy: 'infinite_buying',
    symbol,
    state: result.nextState,
    message: result.isSynced ? 'Broker and internal state are synced.' : 'Broker and internal state differ. MANUAL_HALT required.',
    details: {
      recalculatedRound: result.recalculatedRound,
      differences: result.differences
    }
  });
  await notifyFilledOrders({ symbol, orders: orderStatusResult?.newlyFilledOrders || [] });
  if (result.cycleClosed) {
    await notifyCycleClosed({ symbol, result });
  }
} catch (error) {
  await notifySafely({
    type: 'RECONCILE_JOB_FAILED',
    title: 'Infinite buying reconcile job failed',
    severity: 'ERROR',
    strategy: 'infinite_buying',
    symbol,
    message: error.message
  });
  throw error;
}

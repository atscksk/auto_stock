import { parseArgs } from './args.js';
import { runReconcileJob } from '../jobs/reconcileJob.js';

const args = parseArgs();
const symbol = String(args.symbol || process.env.IB_SYMBOL || 'TQQQ').toUpperCase();
const { result } = runReconcileJob({ symbol, args });

console.log(`[동기화] ${result.isSynced ? 'OK' : 'MANUAL_HALT'}`);
console.log(`[T] ${result.recalculatedRound}`);
if (result.differences.length) {
  console.log('[차이]');
  for (const difference of result.differences) console.log(`- ${difference}`);
}

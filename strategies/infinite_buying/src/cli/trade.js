import { parseArgs } from './args.js';
import { printPlan } from './format.js';
import { runTradeJob } from '../jobs/tradeJob.js';
import { notifySafely } from '../../../../shared/notificationService.js';
import { classifyOrderError } from '../services/orderErrorPolicy.js';
import { notifyRejectReasons } from '../services/strategyNotificationService.js';

const args = parseArgs();
const symbol = String(args.symbol || process.env.IB_SYMBOL || 'TQQQ').toUpperCase();

try {
  const result = await runTradeJob({ symbol, args });

  printPlan(result.plan);
  console.log(result.message);

  await notifySafely({
    type: 'TRADE_JOB_COMPLETED',
    title: 'Infinite buying trade job completed',
    strategy: 'infinite_buying',
    severity: result.submittedOrders.length > 0 ? 'INFO' : 'WARN',
    symbol,
    state: result.plan.nextState || result.plan.state,
    message: result.message,
    details: {
      buyOrders: result.plan.buyOrders.length,
      sellOrders: result.plan.sellOrders.length,
      submittedOrders: result.submittedOrders.length,
      skippedDuplicates: result.skippedDuplicates?.length || 0,
      noTouch: result.plan.noTouch,
      warnings: result.plan.warnings
    }
  });
  await notifyRejectReasons({ symbol, plan: result.plan });
} catch (error) {
  const classification = error.classification || classifyOrderError(error);
  await notifySafely({
    type: classification.alertType || 'TRADE_JOB_FAILED',
    title: 'Infinite buying trade job failed',
    severity: classification.severity || 'ERROR',
    strategy: 'infinite_buying',
    symbol,
    message: error.message,
    details: {
      errorCode: classification.code,
      errorLabel: classification.label,
      retryable: classification.retryable,
      attempt: error.attempt,
      clientOrderId: error.order?.clientOrderId
    }
  });
  throw error;
}

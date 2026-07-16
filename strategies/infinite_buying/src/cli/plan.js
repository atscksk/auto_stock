import { parseArgs } from './args.js';
import { printPlan } from './format.js';
import { runPlanJob } from '../jobs/planJob.js';
import { notifyPlanSummary, notifyRejectReasons } from '../services/strategyNotificationService.js';

const args = parseArgs();
const symbol = String(args.symbol || process.env.IB_SYMBOL || 'TQQQ').toUpperCase();
const plan = runPlanJob({ symbol, args });
printPlan(plan);
await notifyPlanSummary({ symbol, plan });
await notifyRejectReasons({ symbol, plan });

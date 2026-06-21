import { parseArgs } from './args.js';
import { printPlan } from './format.js';
import { runTradeJob } from '../jobs/tradeJob.js';

const args = parseArgs();
const symbol = String(args.symbol || process.env.IB_SYMBOL || 'TQQQ').toUpperCase();
const result = runTradeJob({ symbol, args });

printPlan(result.plan);
console.log(result.message);

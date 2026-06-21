import { parseArgs } from './args.js';
import { printPlan } from './format.js';
import { runPlanJob } from '../jobs/planJob.js';

const args = parseArgs();
const symbol = String(args.symbol || process.env.IB_SYMBOL || 'TQQQ').toUpperCase();
const plan = runPlanJob({ symbol, args });
printPlan(plan);

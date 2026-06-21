import { parseArgs } from './args.js';
import { buildCliContext } from './context.js';
import { printPlan } from './format.js';
import { createPlan } from '../strategy/strategyEngine.js';
import { recordPlan } from '../storage/orderStore.js';

const args = parseArgs();
const symbol = String(args.symbol || process.env.IB_SYMBOL || 'TQQQ').toUpperCase();
const context = buildCliContext(symbol, args);
const plan = createPlan(context);

plan.inputAveragePrice = context.portfolio.averagePrice;
plan.currentRound = context.state.currentRound;

recordPlan(plan);
printPlan(plan);

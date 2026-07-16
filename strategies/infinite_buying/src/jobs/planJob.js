import { buildRuntimeContext } from '../services/contextService.js';
import { createPlan } from '../strategy/strategyEngine.js';
import { recordPlan } from '../storage/orderStore.js';
import { markStrategyRun } from '../storage/runtimeStore.js';

export function runPlanJob({ symbol, args = {} }) {
  const context = buildRuntimeContext(symbol, args);
  const plan = createPlan(context);

  plan.inputAveragePrice = context.portfolio.averagePrice;
  plan.currentRound = context.state.currentRound;

  recordPlan(plan);
  markStrategyRun('infinite:plan');
  return plan;
}

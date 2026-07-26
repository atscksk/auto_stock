import { appConfig } from '../config/index.js';
import { createConfiguredTossClient } from '../clients/tossClient.js';
import { getConfiguredAccountSeq } from '../services/accountService.js';
import { buildRuntimeContextWithMarketData } from '../services/contextService.js';
import { createPlan } from '../strategy/strategyEngine.js';
import { recordPlan } from '../storage/orderStore.js';
import { markStrategyRun } from '../storage/runtimeStore.js';

export async function runPlanJob({ symbol, args = {} }) {
  const tossClient = shouldUseToss(args) ? createConfiguredTossClient() : null;
  const accountSeq = tossClient && args.skipAccount !== true
    ? await getConfiguredAccountSeq({ tossClient, accountSeq: appConfig.toss.accountSeq })
    : null;
  const context = await buildRuntimeContextWithMarketData(symbol, args, { tossClient, accountSeq });
  const plan = createPlan(context);

  plan.inputAveragePrice = context.portfolio.averagePrice;
  plan.currentRound = context.state.currentRound;

  recordPlan(plan);
  markStrategyRun('infinite:plan');
  return plan;
}

function hasTossCredentials() {
  return Boolean(appConfig.toss.clientId && appConfig.toss.clientSecret);
}

function shouldUseToss(args) {
  if (parseBool(args.offline ?? process.env.IB_OFFLINE_CONTEXT, false)) return false;
  return hasTossCredentials();
}

function parseBool(value, fallback) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'y'].includes(String(value).toLowerCase());
}

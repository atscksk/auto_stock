import { appConfig } from '../config/index.js';
import { createConfiguredTossClient } from '../clients/tossClient.js';
import { submitPlannedOrders } from '../services/orderService.js';
import { hasClientOrderId, recordOrders } from '../storage/orderStore.js';
import { markStrategyRun } from '../storage/runtimeStore.js';
import { runPlanJob } from './planJob.js';

export async function runTradeJob({ symbol, args = {} }) {
  const plan = runPlanJob({ symbol, args });
  const { orders: plannedOrders, skippedDuplicates } = selectNewUniqueOrders([
    ...plan.buyOrders,
    ...plan.sellOrders
  ]);

  if (!args.confirm) {
    return {
      plan,
      submittedOrders: [],
      skippedDuplicates,
      message: '주문 전송/기록을 하려면 --confirm 옵션이 필요합니다.'
    };
  }

  if (appConfig.mode === 'LIVE' && (appConfig.enableAutoOrder !== true || appConfig.liveConfirm !== 'YES')) {
    throw new Error('LIVE order blocked. ENABLE_AUTO_ORDER=true and LIVE_CONFIRM=YES are required.');
  }

  const submittedOrders = appConfig.mode === 'LIVE'
    ? await submitLiveOrders(plannedOrders)
    : plannedOrders;
  const recordResult = recordOrders(submittedOrders, {
    mode: appConfig.mode,
    status: appConfig.mode === 'LIVE' ? 'SUBMITTED' : 'PAPER_RECORDED',
    createdAt: new Date().toISOString()
  });
  markStrategyRun('infinite:trade');

  return {
    plan,
    submittedOrders: recordResult.inserted,
    skippedDuplicates: [...skippedDuplicates, ...recordResult.duplicates],
    message: `${recordResult.inserted.length}개 주문을 ${appConfig.mode === 'LIVE' ? '실거래 전송 후 기록' : 'paper 주문 기록'}으로 저장했습니다.`
  };
}

function selectNewUniqueOrders(orders) {
  const seen = new Set();
  const selected = [];
  const skippedDuplicates = [];

  for (const order of orders) {
    if (seen.has(order.clientOrderId) || hasClientOrderId(order.clientOrderId)) {
      skippedDuplicates.push(order);
      continue;
    }
    seen.add(order.clientOrderId);
    selected.push(order);
  }

  return { orders: selected, skippedDuplicates };
}

async function submitLiveOrders(orders) {
  const results = await submitPlannedOrders({
    tossClient: createConfiguredTossClient(),
    accountSeq: appConfig.toss.accountSeq,
    orders
  });

  return results.map(({ order, status, result, brokerOrderId }) => ({
    ...order,
    status,
    brokerOrderId: brokerOrderId || result?.orderId || null,
    brokerResult: result
  }));
}

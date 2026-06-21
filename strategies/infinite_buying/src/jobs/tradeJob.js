import { appConfig } from '../config/index.js';
import { runPlanJob } from './planJob.js';
import { hasClientOrderId, recordOrders } from '../storage/orderStore.js';

export function runTradeJob({ symbol, args = {} }) {
  const plan = runPlanJob({ symbol, args });
  const plannedOrders = [...plan.buyOrders, ...plan.sellOrders]
    .filter((order) => !hasClientOrderId(order.clientOrderId));

  if (!args.confirm) {
    return {
      plan,
      submittedOrders: [],
      message: '주문 전송 안 함: --confirm 옵션이 필요합니다.'
    };
  }

  if (appConfig.mode === 'LIVE' && (appConfig.enableAutoOrder !== true || appConfig.liveConfirm !== 'YES')) {
    throw new Error('LIVE order blocked. ENABLE_AUTO_ORDER=true and LIVE_CONFIRM=YES are required.');
  }

  recordOrders(plannedOrders, {
    mode: appConfig.mode,
    status: appConfig.mode === 'LIVE' ? 'READY_FOR_LIVE_SUBMISSION' : 'PAPER_RECORDED',
    createdAt: new Date().toISOString()
  });

  return {
    plan,
    submittedOrders: plannedOrders,
    message: `${plannedOrders.length}개 주문을 ${appConfig.mode === 'LIVE' ? '실거래 전송 대기 기록' : 'paper 주문 기록'}으로 저장했습니다.`
  };
}

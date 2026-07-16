import { notifySafely } from '../../../../shared/notificationService.js';

export async function notifyPlanSummary({ symbol, plan }) {
  await notifySafely({
    type: 'INFINITE_PLAN_CREATED',
    severity: plan.buyOrders.length || plan.sellOrders.length ? 'INFO' : 'WARN',
    strategy: 'infinite_buying',
    symbol,
    state: plan.nextState || plan.state,
    message: '무한매수 주문 계획이 생성되었습니다.',
    details: buildPlanDetails(plan)
  });
}

export async function notifyRejectReasons({ symbol, plan }) {
  const rejectReasons = plan.rejectReasons || [];
  for (const reason of rejectReasons) {
    await notifySafely({
      type: reason.side === 'SELL' ? 'INFINITE_SELL_REJECTED' : 'INFINITE_BUY_REJECTED',
      severity: reason.side === 'SELL' ? 'ERROR' : 'WARN',
      strategy: 'infinite_buying',
      symbol,
      state: reason.state || plan.nextState || plan.state,
      message: reason.message,
      details: {
        reason: reason.code,
        currentRound: plan.currentRound,
        averagePrice: plan.inputAveragePrice,
        warnings: plan.warnings
      }
    });
  }
}

export async function notifyFilledOrders({ symbol, orders = [] }) {
  for (const order of orders) {
    await notifySafely({
      type: 'INFINITE_ORDER_FILLED',
      severity: 'INFO',
      strategy: 'infinite_buying',
      symbol: order.symbol || symbol,
      message: '브로커 주문 체결을 확인했습니다.',
      details: {
        clientOrderId: order.clientOrderId,
        filledOrderSummary: formatOrder(order),
        reason: order.reason
      }
    });
  }
}

export async function notifyCycleClosed({ symbol, result }) {
  await notifySafely({
    type: 'INFINITE_CYCLE_CLOSED',
    severity: 'INFO',
    strategy: 'infinite_buying',
    symbol,
    state: result.nextState,
    message: '보유수량이 0이 되어 무한매수 사이클이 종료되었습니다.',
    details: {
      currentRound: result.recalculatedRound,
      averagePrice: result.brokerAveragePrice,
      holdingQuantity: result.brokerHoldingQuantity
    }
  });
}

export async function notifyDailySummary({ symbol, summary }) {
  await notifySafely({
    type: 'INFINITE_DAILY_SUMMARY',
    severity: summary.state === 'MANUAL_HALT' ? 'ERROR' : 'INFO',
    strategy: 'infinite_buying',
    symbol,
    state: summary.state,
    message: '무한매수 일일 요약입니다.',
    details: summary
  });
}

export function buildPlanDetails(plan) {
  return {
    currentRound: plan.currentRound,
    averagePrice: plan.inputAveragePrice,
    expectedCashUsage: plan.expectedCashUsage,
    buyOrders: plan.buyOrders.length,
    sellOrders: plan.sellOrders.length,
    buyOrderSummary: formatOrders(plan.buyOrders),
    sellOrderSummary: formatOrders(plan.sellOrders),
    noTouch: plan.noTouch,
    warnings: plan.warnings
  };
}

export function formatOrders(orders = []) {
  if (orders.length === 0) return '없음';
  return orders.map(formatOrder).join(' | ');
}

function formatOrder(order) {
  const quantity = order.filledQuantity || order.quantity;
  const price = order.averageFilledPrice || order.price;
  return `${order.side} ${quantity}주 @ ${price} (${order.reason || order.status || '주문'})`;
}

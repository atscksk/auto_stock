import { appConfig } from '../config/index.js';
import { classifyOrderError, withOrderRetry } from './orderErrorPolicy.js';

export async function submitPlannedOrders({ tossClient, accountSeq, orders, retry = {} }) {
  if (appConfig.mode !== 'LIVE') {
    return orders.map((order) => ({
      order,
      status: 'PAPER_RECORDED'
    }));
  }

  if (appConfig.enableAutoOrder !== true || appConfig.liveConfirm !== 'YES') {
    throw new Error('LIVE order blocked. ENABLE_AUTO_ORDER=true and LIVE_CONFIRM=YES are required.');
  }
  assertLiveOrderAmountLimit(orders, appConfig.liveOrderAmountLimit);

  const results = [];
  for (const order of orders) {
    try {
      const result = await withOrderRetry(
        () => tossClient.createOrder(accountSeq, order, {
          mode: appConfig.mode,
          liveConfirm: appConfig.liveConfirm,
          riskPassed: true
        }),
        retry
      );
      results.push({
        order,
        status: 'SUBMITTED',
        result,
        brokerOrderId: result?.orderId || result?.brokerOrderId || null
      });
    } catch (error) {
      const classification = error.classification || classifyOrderError(error);
      error.classification = classification;
      error.order = order;
      throw error;
    }
  }
  return results;
}

export function assertLiveOrderAmountLimit(orders = [], limit = 0) {
  const buyAmount = orders
    .filter((order) => order.side === 'BUY')
    .reduce((sum, order) => sum + Number(order.price || 0) * Number(order.quantity || 0), 0);

  if (buyAmount <= 0) return;
  if (!Number.isFinite(Number(limit)) || Number(limit) <= 0) {
    throw new Error('LIVE buy order blocked. IB_LIVE_ORDER_AMOUNT_LIMIT must be set before live buying.');
  }
  if (buyAmount > Number(limit)) {
    throw new Error(`LIVE buy order blocked. Estimated buy amount ${buyAmount.toFixed(2)} exceeds IB_LIVE_ORDER_AMOUNT_LIMIT ${Number(limit).toFixed(2)}.`);
  }
}

export async function fetchOrderStatus({ tossClient, accountSeq, order, mode = appConfig.mode }) {
  if (mode !== 'LIVE') {
    return {
      ...order,
      status: order.status || 'PAPER_RECORDED',
      filledQuantity: order.filledQuantity || 0,
      filledAmount: order.filledAmount || 0
    };
  }

  if (!order?.brokerOrderId) {
    throw new Error(`Cannot refresh order status without brokerOrderId: ${order?.clientOrderId || 'unknown'}`);
  }

  const brokerOrder = await tossClient.getOrder(accountSeq, order.brokerOrderId);
  return {
    ...brokerOrder,
    clientOrderId: order.clientOrderId,
    brokerOrderId: brokerOrder.orderId || order.brokerOrderId
  };
}

export async function fetchOrderStatuses({ tossClient, accountSeq, orders, mode = appConfig.mode }) {
  const statuses = [];
  for (const order of orders) {
    statuses.push(await fetchOrderStatus({ tossClient, accountSeq, order, mode }));
  }
  return statuses;
}

import { appConfig } from '../config/index.js';

export async function submitPlannedOrders({ tossClient, accountSeq, orders }) {
  if (appConfig.mode !== 'LIVE') {
    return orders.map((order) => ({
      order,
      status: 'PAPER_RECORDED'
    }));
  }

  if (appConfig.enableAutoOrder !== true || appConfig.liveConfirm !== 'YES') {
    throw new Error('LIVE order blocked. ENABLE_AUTO_ORDER=true and LIVE_CONFIRM=YES are required.');
  }

  const results = [];
  for (const order of orders) {
    results.push({
      order,
      status: 'SUBMITTED',
      result: await tossClient.createOrder(accountSeq, order, {
        mode: appConfig.mode,
        liveConfirm: appConfig.liveConfirm,
        riskPassed: true
      })
    });
  }
  return results;
}

export function printPlan(plan) {
  console.log(`[state] ${plan.nextState || plan.state}`);
  console.log(`[average price] ${plan.inputAveragePrice || ''}`);
  console.log(`[T] ${plan.currentRound ?? ''}`);
  console.log(`[star percent] ${plan.starPercent}%`);
  console.log(`[star sell price] ${plan.starPrice}`);
  console.log(`[15% assist sell price] ${plan.limit15Price || ''}`);
  console.log(`[NO_TOUCH] ${plan.noTouch ? 'YES' : 'NO'}`);
  console.log(`[expected cash usage] ${plan.expectedCashUsage}`);

  printOrders('buy order candidates', plan.buyOrders);
  printOrders('sell order candidates', plan.sellOrders);

  if (plan.warnings?.length) {
    console.log('[warnings]');
    for (const warning of plan.warnings) console.log(`- ${warning}`);
  }
  if (plan.rejectReasons?.length) {
    console.log('[reject reasons]');
    for (const reason of plan.rejectReasons) console.log(`- ${reason.code}: ${reason.message}`);
  }
  if (plan.manualHaltReason) console.log(`[MANUAL_HALT] ${plan.manualHaltReason}`);
}

function printOrders(title, orders = []) {
  console.log(`[${title}]`);
  if (orders.length === 0) {
    console.log('- none');
    return;
  }
  for (const order of orders) {
    console.log(`- ${order.side} ${order.quantity} ${order.symbol} @ ${order.price} ${order.timeInForce} (${order.reason}) ${order.clientOrderId}`);
  }
}

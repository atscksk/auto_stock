export function printPlan(plan) {
  console.log(`[상태] ${plan.nextState || plan.state}`);
  console.log(`[평단] ${plan.inputAveragePrice || ''}`);
  console.log(`[T] ${plan.currentRound ?? ''}`);
  console.log(`[별표%] ${plan.starPercent}%`);
  console.log(`[별표 매도가] ${plan.starPrice}`);
  console.log(`[15% 보조 매도가] ${plan.limit15Price || ''}`);
  console.log(`[NO_TOUCH] ${plan.noTouch ? 'YES' : 'NO'}`);
  console.log(`[예상 현금사용] ${plan.expectedCashUsage}`);

  printOrders('매수 주문 후보', plan.buyOrders);
  printOrders('매도 주문 후보', plan.sellOrders);

  if (plan.warnings?.length) {
    console.log('[위험 경고]');
    for (const warning of plan.warnings) console.log(`- ${warning}`);
  }
  if (plan.manualHaltReason) console.log(`[MANUAL_HALT] ${plan.manualHaltReason}`);
}

function printOrders(title, orders = []) {
  console.log(`[${title}]`);
  if (orders.length === 0) {
    console.log('- 없음');
    return;
  }
  for (const order of orders) {
    console.log(`- ${order.side} ${order.quantity} ${order.symbol} @ ${order.price} ${order.timeInForce} (${order.reason}) ${order.clientOrderId}`);
  }
}

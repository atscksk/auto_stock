import { todayKstCompact } from './utils.js';

export function buildQuantityOrder({
  strategyId,
  symbol,
  side,
  quantity,
  price,
  orderType = 'LIMIT',
  date = new Date()
}) {
  const roundedPrice = Math.round(Number(price));
  // TODO: Toss OpenAPI requires KR order prices to match tick sizes. MVP uses simple rounding.
  const order = {
    clientOrderId: `${strategyId}-${symbol}-${todayKstCompact(date)}-${side}`,
    symbol,
    side,
    orderType,
    quantity: String(quantity)
  };

  if (orderType === 'LIMIT') {
    order.price = String(roundedPrice);
  }

  return order;
}

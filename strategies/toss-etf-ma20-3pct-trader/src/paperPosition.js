export function calculatePaperPosition(orders = [], symbol) {
  let quantity = 0;
  let cost = 0;
  let realizedPnl = 0;

  for (const order of orders) {
    if (symbol && order.symbol !== symbol) continue;
    if (order.mode !== 'DRY_RUN') continue;

    const orderQuantity = Number(order.quantity);
    const price = Number(order.price);
    if (!Number.isFinite(orderQuantity) || orderQuantity <= 0 || !Number.isFinite(price) || price <= 0) {
      continue;
    }

    if (order.side === 'BUY') {
      quantity += orderQuantity;
      cost += orderQuantity * price;
    }

    if (order.side === 'SELL' && quantity > 0) {
      const sellQuantity = Math.min(orderQuantity, quantity);
      const averagePrice = cost / quantity;
      cost -= averagePrice * sellQuantity;
      quantity -= sellQuantity;
      realizedPnl += (price - averagePrice) * sellQuantity;
      if (quantity === 0) cost = 0;
    }
  }

  return {
    quantity,
    averagePrice: quantity > 0 ? roundMoney(cost / quantity) : 0,
    cost: roundMoney(cost),
    realizedPnl: roundMoney(realizedPnl),
    hasPosition: quantity > 0
  };
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

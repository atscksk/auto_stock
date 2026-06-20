export function createPaperBroker({ logOrder }) {
  if (typeof logOrder !== 'function') {
    throw new Error('createPaperBroker requires a logOrder function.');
  }

  return {
    savePaperOrder({ mode, symbol, side, quantity, price, clientOrderId, reason }) {
      const order = {
        mode,
        symbol,
        side,
        quantity: String(quantity),
        price: String(price),
        clientOrderId,
        reason
      };
      logOrder(order);
      return order;
    }
  };
}

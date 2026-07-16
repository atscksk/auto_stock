const OPEN_STATUSES = new Set(['OPEN', 'SUBMITTED', 'ACCEPTED', 'PENDING', 'WORKING', 'READY_FOR_LIVE_SUBMISSION']);
const FILLED_STATUSES = new Set(['FILLED', 'FULLY_FILLED', 'EXECUTED', 'COMPLETE', 'COMPLETED']);
const PARTIAL_STATUSES = new Set(['PARTIALLY_FILLED', 'PARTIAL_FILLED', 'PARTIAL']);
const CANCELED_STATUSES = new Set(['CANCELED', 'CANCELLED', 'EXPIRED']);
const REJECTED_STATUSES = new Set(['REJECTED', 'FAILED', 'ERROR']);
const TERMINAL_STATUSES = new Set(['FILLED', 'CANCELED', 'EXPIRED', 'REJECTED']);

export function normalizeOrderStatus(raw = {}, plannedOrder = {}) {
  const execution = raw.execution || {};
  const quantity = numberFrom(raw.quantity, plannedOrder.quantity, 0);
  const filledQuantity = numberFrom(
    raw.filledQuantity,
    raw.executedQuantity,
    raw.cumulativeFilledQuantity,
    execution.filledQuantity,
    0
  );
  const remainingQuantity = raw.remainingQuantity != null
    ? numberFrom(raw.remainingQuantity, 0)
    : Math.max(0, quantity - filledQuantity);
  const filledAmount = numberFrom(
    raw.filledAmount,
    raw.executedAmount,
    execution.filledAmount,
    filledQuantity * numberFrom(raw.averageFilledPrice, raw.filledPrice, plannedOrder.price, raw.price, 0)
  );
  const averageFilledPrice = numberFrom(
    raw.averageFilledPrice,
    raw.filledPrice,
    execution.averageFilledPrice,
    filledQuantity > 0 ? filledAmount / filledQuantity : 0
  );
  const normalizedStatus = normalizeStatus(raw.status, {
    filledQuantity,
    remainingQuantity,
    quantity
  });

  return {
    clientOrderId: raw.clientOrderId || plannedOrder.clientOrderId,
    brokerOrderId: raw.brokerOrderId || raw.orderId || plannedOrder.brokerOrderId || null,
    status: normalizedStatus,
    side: raw.side || plannedOrder.side,
    symbol: raw.symbol || plannedOrder.symbol,
    quantity,
    filledQuantity,
    remainingQuantity,
    filledAmount: roundMoney(filledAmount),
    averageFilledPrice: filledQuantity > 0 ? roundMoney(averageFilledPrice) : 0,
    isTerminal: TERMINAL_STATUSES.has(normalizedStatus),
    isFilled: normalizedStatus === 'FILLED',
    isPartial: normalizedStatus === 'PARTIALLY_FILLED'
  };
}

export function mergeOrderStatus(record, status, checkedAt = new Date().toISOString()) {
  return {
    ...record,
    brokerOrderId: status.brokerOrderId || record.brokerOrderId || null,
    status: status.status,
    filledQuantity: status.filledQuantity,
    remainingQuantity: status.remainingQuantity,
    filledAmount: status.filledAmount,
    averageFilledPrice: status.averageFilledPrice,
    isTerminal: status.isTerminal,
    lastStatusCheckedAt: checkedAt
  };
}

export function applyOrderStatusUpdates(records = [], statusUpdates = [], checkedAt = new Date().toISOString()) {
  const statusByClientId = new Map(statusUpdates.map((status) => [status.clientOrderId, status]));
  return records.map((record) => {
    const status = statusByClientId.get(record.clientOrderId);
    return status ? mergeOrderStatus(record, status, checkedAt) : record;
  });
}

export function extractFilledOrderExecutions(records = []) {
  return records
    .filter((record) => Number(record.filledQuantity || 0) > 0)
    .map((record) => ({
      clientOrderId: record.clientOrderId,
      cycleId: record.cycleId,
      symbol: record.symbol,
      side: record.side,
      price: record.averageFilledPrice || record.price,
      quantity: record.quantity,
      filledQuantity: record.filledQuantity,
      filledAmount: record.filledAmount,
      status: record.status,
      reason: record.reason
    }));
}

export function isTerminalOrderStatus(status) {
  return TERMINAL_STATUSES.has(String(status || '').trim().toUpperCase());
}

function normalizeStatus(status, { filledQuantity, remainingQuantity, quantity }) {
  const text = String(status || '').trim().toUpperCase();
  if (FILLED_STATUSES.has(text)) return 'FILLED';
  if (PARTIAL_STATUSES.has(text)) return 'PARTIALLY_FILLED';
  if (CANCELED_STATUSES.has(text)) return text === 'EXPIRED' ? 'EXPIRED' : 'CANCELED';
  if (REJECTED_STATUSES.has(text)) return 'REJECTED';
  if (OPEN_STATUSES.has(text)) {
    if (filledQuantity > 0 && remainingQuantity > 0) return 'PARTIALLY_FILLED';
    if (quantity > 0 && filledQuantity >= quantity) return 'FILLED';
    return 'OPEN';
  }
  if (filledQuantity > 0 && remainingQuantity > 0) return 'PARTIALLY_FILLED';
  if (quantity > 0 && filledQuantity >= quantity) return 'FILLED';
  if (text) return text;
  return 'UNKNOWN';
}

function numberFrom(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

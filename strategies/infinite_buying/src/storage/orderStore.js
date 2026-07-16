import path from 'node:path';
import { appendJsonLine, readJson, writeJson } from './jsonStore.js';
import {
  applyOrderStatusUpdates,
  extractFilledOrderExecutions,
  isTerminalOrderStatus,
  normalizeOrderStatus
} from '../strategy/orderStatus.js';

const DATA_DIR = path.resolve('strategies/infinite_buying/data');
const LOG_DIR = path.resolve('strategies/infinite_buying/logs');

export function orderRecordPath() {
  return path.join(DATA_DIR, 'orders.json');
}

export function loadOrderRecords() {
  return readJson(orderRecordPath(), []);
}

export function loadOpenOrderRecords() {
  return loadOrderRecords().filter((record) => record.isTerminal !== true && !isTerminalOrderStatus(record.status));
}

export function saveOrderRecords(records) {
  writeJson(orderRecordPath(), records);
}

export function hasClientOrderId(clientOrderId) {
  return loadOrderRecords().some((record) => record.clientOrderId === clientOrderId);
}

export function recordOrders(orders, metadata = {}) {
  const records = loadOrderRecords();
  const inserted = [];
  const duplicates = [];

  for (const order of orders) {
    if (!records.some((record) => record.clientOrderId === order.clientOrderId)) {
      const record = { ...order, ...metadata };
      records.push(record);
      inserted.push(record);
      appendJsonLine(path.join(LOG_DIR, 'orders.jsonl'), record);
    } else {
      duplicates.push(order);
    }
  }
  saveOrderRecords(records);
  return { records, inserted, duplicates };
}

export function updateOrderStatuses(statusResponses = [], checkedAt = new Date().toISOString()) {
  const records = loadOrderRecords();
  const statusUpdates = statusResponses.map((response) => {
    const plannedOrder = records.find((record) => record.clientOrderId === response.clientOrderId) || {};
    return normalizeOrderStatus(response, plannedOrder);
  });
  const previousFilledQuantityByClientId = new Map(
    records.map((record) => [record.clientOrderId, Number(record.filledQuantity || 0)])
  );
  const updatedRecords = applyOrderStatusUpdates(records, statusUpdates, checkedAt);
  saveOrderRecords(updatedRecords);
  return {
    records: updatedRecords,
    updated: statusUpdates,
    filledOrders: extractFilledOrderExecutions(updatedRecords),
    newlyFilledOrders: extractFilledOrderExecutions(updatedRecords)
      .filter((record) => Number(record.filledQuantity || 0) > Number(previousFilledQuantityByClientId.get(record.clientOrderId) || 0))
  };
}

export async function refreshOrderStatuses({ fetchOrderStatus, checkedAt = new Date().toISOString() } = {}) {
  if (typeof fetchOrderStatus !== 'function') {
    throw new Error('fetchOrderStatus function is required.');
  }

  const statusResponses = [];
  for (const order of loadOpenOrderRecords()) {
    statusResponses.push(await fetchOrderStatus(order));
  }
  return updateOrderStatuses(statusResponses, checkedAt);
}

export function loadFilledOrderExecutions() {
  return extractFilledOrderExecutions(loadOrderRecords());
}

export function recordPlan(plan) {
  appendJsonLine(path.join(LOG_DIR, 'order-plans.jsonl'), plan);
}

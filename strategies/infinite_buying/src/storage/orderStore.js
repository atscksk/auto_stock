import path from 'node:path';
import { appendJsonLine, readJson, writeJson } from './jsonStore.js';

const DATA_DIR = path.resolve('strategies/infinite_buying/data');
const LOG_DIR = path.resolve('strategies/infinite_buying/logs');

export function orderRecordPath() {
  return path.join(DATA_DIR, 'orders.json');
}

export function loadOrderRecords() {
  return readJson(orderRecordPath(), []);
}

export function saveOrderRecords(records) {
  writeJson(orderRecordPath(), records);
}

export function hasClientOrderId(clientOrderId) {
  return loadOrderRecords().some((record) => record.clientOrderId === clientOrderId);
}

export function recordOrders(orders, metadata = {}) {
  const records = loadOrderRecords();
  for (const order of orders) {
    if (!records.some((record) => record.clientOrderId === order.clientOrderId)) {
      records.push({ ...order, ...metadata });
      appendJsonLine(path.join(LOG_DIR, 'orders.jsonl'), { ...order, ...metadata });
    }
  }
  saveOrderRecords(records);
}

export function recordPlan(plan) {
  appendJsonLine(path.join(LOG_DIR, 'order-plans.jsonl'), plan);
}

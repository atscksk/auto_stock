import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOrderStatusUpdates,
  extractFilledOrderExecutions,
  normalizeOrderStatus
} from '../src/strategy/orderStatus.js';
import { fetchOrderStatus, fetchOrderStatuses } from '../src/services/orderService.js';
import { reconcileState } from '../src/strategy/reconciliation.js';
import { StrategyState } from '../src/strategy/stateMachine.js';

test('normalizes partially filled order status', () => {
  const status = normalizeOrderStatus(
    {
      clientOrderId: 'ib-1',
      brokerOrderId: 'broker-1',
      status: 'working',
      filledQuantity: 2,
      averageFilledPrice: 50,
      quantity: 5
    },
    {
      clientOrderId: 'ib-1',
      side: 'BUY',
      symbol: 'TQQQ',
      quantity: 5,
      price: 51
    }
  );

  assert.equal(status.status, 'PARTIALLY_FILLED');
  assert.equal(status.isPartial, true);
  assert.equal(status.isTerminal, false);
  assert.equal(status.remainingQuantity, 3);
  assert.equal(status.filledAmount, 100);
  assert.equal(status.averageFilledPrice, 50);
});

test('normalizes terminal order statuses', () => {
  const filled = normalizeOrderStatus({ status: 'completed', quantity: 3, filledQuantity: 3, filledAmount: 210 });
  const canceled = normalizeOrderStatus({ status: 'cancelled', quantity: 3, filledQuantity: 0 });
  const rejected = normalizeOrderStatus({ status: 'failed', quantity: 3, filledQuantity: 0 });

  assert.equal(filled.status, 'FILLED');
  assert.equal(filled.isFilled, true);
  assert.equal(filled.isTerminal, true);
  assert.equal(canceled.status, 'CANCELED');
  assert.equal(canceled.isTerminal, true);
  assert.equal(rejected.status, 'REJECTED');
  assert.equal(rejected.isTerminal, true);
});

test('normalizes Toss order execution payload', () => {
  const status = normalizeOrderStatus(
    {
      orderId: 'broker-2',
      symbol: 'TQQQ',
      side: 'BUY',
      status: 'PARTIAL_FILLED',
      quantity: '5',
      price: '70',
      execution: {
        filledQuantity: '3',
        averageFilledPrice: '69.5',
        filledAmount: '208.5'
      }
    },
    {
      clientOrderId: 'ib-2'
    }
  );

  assert.equal(status.clientOrderId, 'ib-2');
  assert.equal(status.brokerOrderId, 'broker-2');
  assert.equal(status.status, 'PARTIALLY_FILLED');
  assert.equal(status.filledQuantity, 3);
  assert.equal(status.remainingQuantity, 2);
  assert.equal(status.filledAmount, 208.5);
  assert.equal(status.averageFilledPrice, 69.5);
});

test('applies status updates and extracts filled executions', () => {
  const records = [
    {
      clientOrderId: 'ib-buy-1',
      cycleId: 'cycle-1',
      symbol: 'SOXL',
      side: 'BUY',
      quantity: 4,
      price: 25,
      status: 'OPEN'
    },
    {
      clientOrderId: 'ib-sell-1',
      cycleId: 'cycle-1',
      symbol: 'SOXL',
      side: 'SELL',
      quantity: 2,
      price: 30,
      status: 'OPEN'
    }
  ];
  const updated = applyOrderStatusUpdates(records, [
    normalizeOrderStatus({ clientOrderId: 'ib-buy-1', status: 'partially_filled', quantity: 4, filledQuantity: 2, filledAmount: 52 }, records[0]),
    normalizeOrderStatus({ clientOrderId: 'ib-sell-1', status: 'expired', quantity: 2, filledQuantity: 0 }, records[1])
  ], '2026-07-15T00:00:00.000Z');
  const executions = extractFilledOrderExecutions(updated);

  assert.equal(updated[0].status, 'PARTIALLY_FILLED');
  assert.equal(updated[0].lastStatusCheckedAt, '2026-07-15T00:00:00.000Z');
  assert.equal(updated[1].status, 'EXPIRED');
  assert.equal(executions.length, 1);
  assert.equal(executions[0].filledQuantity, 2);
  assert.equal(executions[0].filledAmount, 52);
});

test('fetches live order status with broker order id', async () => {
  const calls = [];
  const tossClient = {
    async getOrder(accountSeq, orderId) {
      calls.push({ accountSeq, orderId });
      return {
        orderId,
        symbol: 'TQQQ',
        side: 'BUY',
        status: 'FILLED',
        quantity: '2',
        execution: {
          filledQuantity: '2',
          averageFilledPrice: '80',
          filledAmount: '160'
        }
      };
    }
  };

  const status = await fetchOrderStatus({
    tossClient,
    accountSeq: '1',
    mode: 'LIVE',
    order: {
      clientOrderId: 'ib-live-1',
      brokerOrderId: 'broker-live-1'
    }
  });

  assert.deepEqual(calls, [{ accountSeq: '1', orderId: 'broker-live-1' }]);
  assert.equal(status.clientOrderId, 'ib-live-1');
  assert.equal(status.brokerOrderId, 'broker-live-1');
  assert.equal(status.execution.filledAmount, '160');
});

test('fetches multiple order statuses sequentially', async () => {
  const statuses = await fetchOrderStatuses({
    tossClient: {
      async getOrder(accountSeq, orderId) {
        return { orderId, status: 'PENDING', quantity: '1', execution: { filledQuantity: '0' } };
      }
    },
    accountSeq: '1',
    mode: 'LIVE',
    orders: [
      { clientOrderId: 'ib-1', brokerOrderId: 'broker-1' },
      { clientOrderId: 'ib-2', brokerOrderId: 'broker-2' }
    ]
  });

  assert.equal(statuses.length, 2);
  assert.equal(statuses[0].clientOrderId, 'ib-1');
  assert.equal(statuses[1].brokerOrderId, 'broker-2');
});

test('reconciliation keeps previous buy amount when no filled buy order is available', () => {
  const result = reconcileState({
    state: {
      symbol: 'TQQQ',
      cycleId: 'cycle-1',
      holdingQuantity: 3,
      averagePrice: 50,
      realizedBuyAmountInCycle: '500.00',
      unitAmount: '250.00',
      totalRound: 40
    },
    broker: {
      holdingQuantity: 3,
      averagePrice: 50
    },
    filledOrders: []
  });

  assert.equal(result.realizedBuyAmountInCycle, '500.00');
  assert.equal(result.recalculatedRound, 2);
  assert.equal(result.nextState, StrategyState.NORMAL_FRONT);
});

test('reconciliation uses filled buy amount and halts on broker mismatch', () => {
  const result = reconcileState({
    state: {
      symbol: 'TQQQ',
      cycleId: 'cycle-1',
      holdingQuantity: 2,
      averagePrice: 50,
      realizedBuyAmountInCycle: '0.00',
      unitAmount: '250.00',
      totalRound: 40
    },
    broker: {
      holdingQuantity: 3,
      averagePrice: 50
    },
    filledOrders: [
      { side: 'BUY', filledQuantity: 2, filledAmount: 220 },
      { side: 'BUY', filledQuantity: 1, price: 60 }
    ]
  });

  assert.equal(result.realizedBuyAmountInCycle, '280.00');
  assert.equal(result.recalculatedRound, 1.12);
  assert.equal(result.isSynced, false);
  assert.equal(result.nextState, StrategyState.MANUAL_HALT);
});

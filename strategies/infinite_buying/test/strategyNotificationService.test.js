import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNotificationMessage } from '../../../shared/notificationService.js';
import { buildPlanDetails, formatOrders } from '../src/services/strategyNotificationService.js';

test('formats infinite buying plan details for notification', () => {
  const plan = {
    currentRound: 8.5,
    inputAveragePrice: 70.12,
    expectedCashUsage: '210.36',
    buyOrders: [
      { side: 'BUY', quantity: 3, price: 70.12, reason: 'NORMAL_MODE_LOC_BUY' }
    ],
    sellOrders: [
      { side: 'SELL', quantity: 1, price: 73.2, reason: 'STAR_PERCENT_LOC_SELL' }
    ],
    noTouch: false,
    warnings: ['sample warning']
  };

  const details = buildPlanDetails(plan);
  assert.equal(details.currentRound, 8.5);
  assert.equal(details.averagePrice, 70.12);
  assert.match(details.buyOrderSummary, /BUY 3주 @ 70.12/);
  assert.match(details.sellOrderSummary, /SELL 1주 @ 73.2/);
});

test('formats empty order summary as Korean none', () => {
  assert.equal(formatOrders([]), '없음');
});

test('notification message includes plan and heartbeat operation fields', () => {
  const message = formatNotificationMessage({
    type: 'INFINITE_PLAN_CREATED',
    severity: 'INFO',
    strategy: 'infinite_buying',
    symbol: 'TQQQ',
    state: 'NORMAL_FRONT',
    message: '무한매수 주문 계획이 생성되었습니다.',
    timestamp: '2026-07-15T00:00:00.000Z',
    details: {
      currentRound: 8.5,
      averagePrice: 70.12,
      holdingQuantity: 3,
      buyOrderSummary: 'BUY 3주 @ 70.12',
      sellOrderSummary: '없음',
      lastRuns: {
        'infinite:plan': '2026-07-15T00:00:00.000Z'
      }
    }
  });

  assert.match(message, /무한매수 주문 계획/);
  assert.match(message, /T: 8.5/);
  assert.match(message, /평단: 70.12/);
  assert.match(message, /보유수량: 3/);
  assert.match(message, /마지막 실행:/);
});

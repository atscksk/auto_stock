import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOrderPlan } from '../src/strategy/orderPlanner.js';
import { riskConfig } from '../src/config/risk.config.js';
import { scheduleConfig } from '../src/config/schedule.config.js';

test('blocks order creation in no touch window', () => {
  const plan = generateOrderPlan(baseInput({
    marketCalendar: { isOpen: true, minutesUntilClose: 10 }
  }));

  assert.equal(plan.noTouch, true);
  assert.equal(plan.buyOrders.length, 0);
  assert.equal(plan.sellOrders.length, 0);
});

test('creates dry-run order candidates outside cutoff', () => {
  const plan = generateOrderPlan(baseInput());

  assert.equal(plan.nextState, 'NORMAL_FRONT');
  assert.equal(plan.buyOrders.length, 1);
  assert.equal(plan.sellOrders.length, 2);
  assert.equal(plan.sellOrders[0].timeInForce, 'CLS');
  assert.equal(plan.sellOrders[1].timeInForce, 'DAY');
});

function baseInput(overrides = {}) {
  return {
    symbol: 'TQQQ',
    currentPrice: '50.00',
    previousClose: '51.00',
    averagePrice: '49.00',
    confirmedAveragePriceAfterClose: '49.00',
    holdingQuantity: 10,
    availableSellQuantity: 10,
    cash: '5000.00',
    buyingPower: '5000.00',
    strategyCapital: '10000.00',
    unitAmount: '250.00',
    totalRound: 20,
    currentRound: 8.6,
    dailyCandles: [],
    openOrders: [],
    filledOrders: [],
    strategyState: {
      state: 'NORMAL_FRONT',
      cycleId: 'TQQQ-20260621-001'
    },
    riskSettings: riskConfig,
    schedule: scheduleConfig,
    marketCalendar: { isOpen: true, minutesUntilClose: 120 },
    now: new Date('2026-06-21T12:00:00Z'),
    ...overrides
  };
}

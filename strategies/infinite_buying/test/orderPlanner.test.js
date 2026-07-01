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
  const plan = generateOrderPlan(baseInput({
    averagePrice: '51.00',
    confirmedAveragePriceAfterClose: '51.00'
  }));

  assert.equal(plan.nextState, 'NORMAL_FRONT');
  assert.equal(plan.buyOrders.length, 1);
  assert.equal(plan.sellOrders.length, 2);
  assert.equal(plan.sellOrders[0].timeInForce, 'CLS');
  assert.equal(plan.sellOrders[1].timeInForce, 'DAY');
});

test('blocks star sell below average price in normal back state', () => {
  const plan = generateOrderPlan(baseInput({
    averagePrice: '70.00',
    confirmedAveragePriceAfterClose: '70.00',
    currentPrice: '68.00',
    currentRound: 13.6,
    strategyState: {
      state: 'NORMAL_BACK',
      cycleId: 'TQQQ-20260621-001'
    }
  }));

  assert.equal(plan.nextState, 'SELL_REJECT');
  assert.equal(plan.sellRejectCount, 1);
  assert.equal(plan.starPercent < 0, true);
  assert.equal(plan.sellOrders.some((order) => order.reason === 'STAR_PERCENT_LOC_SELL'), false);
  assert.equal(plan.sellOrders.length, 1);
  assert.equal(plan.sellOrders[0].reason, 'LIMIT_15_DAY_SELL');
  assert.equal(plan.sellOrders[0].quantity, 10);
  assert.equal(plan.sellOrders.every((order) => Number(order.price) >= 70), true);
  assert.ok(plan.warnings.some((warning) => warning.startsWith('SELL_REJECT: Star sell blocked')));
  assert.ok(plan.warnings.some((warning) => warning.startsWith('SELL_REJECT: 15% assist sell remains active')));
  assert.deepEqual(plan.rejectReasons.map((reason) => reason.code), ['STAR_SELL_BELOW_AVERAGE']);
  assert.equal(plan.rejectReasons[0].details.assistSellMaintained, true);
  assert.equal(plan.rejectReasons[0].details.assistSellQuantity, 10);
});

test('halts after consecutive sell rejects exceed limit', () => {
  const plan = generateOrderPlan(baseInput({
    averagePrice: '70.00',
    confirmedAveragePriceAfterClose: '70.00',
    currentPrice: '68.00',
    currentRound: 13.6,
    strategyState: {
      state: 'SELL_REJECT',
      cycleId: 'TQQQ-20260621-001',
      sellRejectCount: 5
    }
  }));

  assert.equal(plan.nextState, 'MANUAL_HALT');
  assert.equal(plan.sellRejectCount, 6);
  assert.equal(plan.buyOrders.length, 0);
  assert.equal(plan.sellOrders.length, 0);
  assert.equal(plan.rejectReasons.some((reason) => reason.code === 'SELL_REJECT_LIMIT_EXCEEDED'), true);
  assert.match(plan.manualHaltReason, /Sell reject count 6 exceeded limit 5/);
});

test('records structured buy reject reasons', () => {
  const plan = generateOrderPlan(baseInput({
    holdingQuantity: 0,
    availableSellQuantity: 0,
    strategyState: {
      state: 'NORMAL_FRONT',
      cycleId: 'TQQQ-20260621-001'
    },
    dailyCandles: Array.from({ length: 10 }, (_, index) => ({
      date: `2026-01-${String(index + 1).padStart(2, '0')}`,
      open: 50 + index,
      close: 51 + index
    }))
  }));

  assert.equal(plan.nextState, 'BUY_REJECT');
  assert.equal(plan.buyOrders.length, 0);
  assert.equal(plan.rejectReasons.some((reason) => (
    reason.side === 'BUY' && reason.code === 'MA200_UNAVAILABLE_NEW_CYCLE'
  )), true);
});

test('keeps existing sell plan when buy is rejected', () => {
  const plan = generateOrderPlan(baseInput({
    currentPrice: '45.00',
    previousClose: '51.00',
    averagePrice: '40.00',
    confirmedAveragePriceAfterClose: '40.00',
    currentRound: 8,
    strategyState: {
      state: 'NORMAL_FRONT',
      cycleId: 'TQQQ-20260621-001'
    }
  }));

  assert.equal(plan.buyRejected, true);
  assert.equal(plan.sellMaintainedOnBuyReject, true);
  assert.equal(plan.buyOrders.length, 0);
  assert.equal(plan.sellOrders.length > 0, true);
  assert.equal(plan.rejectReasons.some((reason) => reason.side === 'BUY' && reason.code === 'CRASH_FILTER'), true);
});

test('records insufficient buying power as a separate buy reject reason', () => {
  const plan = generateOrderPlan(baseInput({
    holdingQuantity: 0,
    availableSellQuantity: 0,
    cash: '2000.00',
    buyingPower: '2000.00',
    dailyCandles: [],
    strategyState: {
      state: 'NORMAL_FRONT',
      cycleId: 'TQQQ-20260621-001'
    }
  }));

  assert.equal(plan.buyRejected, true);
  assert.equal(plan.buyOrders.length, 0);
  assert.equal(plan.rejectReasons.some((reason) => (
    reason.side === 'BUY' && reason.code === 'INSUFFICIENT_BUYING_POWER'
  )), true);
});

test('records insufficient average improvement as a separate buy reject reason', () => {
  const plan = generateOrderPlan(baseInput({
    currentPrice: '51.00',
    previousClose: '51.00',
    averagePrice: '50.00',
    confirmedAveragePriceAfterClose: '50.00',
    currentRound: 8,
    strategyState: {
      state: 'NORMAL_FRONT',
      cycleId: 'TQQQ-20260621-001'
    }
  }));

  assert.equal(plan.buyRejected, true);
  assert.equal(plan.buyOrders.length, 0);
  assert.equal(plan.rejectReasons.some((reason) => (
    reason.side === 'BUY' && reason.code === 'AVERAGE_IMPROVEMENT_INSUFFICIENT'
  )), true);
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

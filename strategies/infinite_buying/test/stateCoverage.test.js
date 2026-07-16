import test from 'node:test';
import assert from 'node:assert/strict';
import { riskConfig } from '../src/config/risk.config.js';
import { scheduleConfig } from '../src/config/schedule.config.js';
import { strategyConfig } from '../src/config/strategy.config.js';
import { generateOrderPlan } from '../src/strategy/orderPlanner.js';

test('covers order planning behavior for every strategy state', () => {
  const cases = [
    {
      state: 'READY',
      overrides: { holdingQuantity: 0, availableSellQuantity: 0, currentRound: 0 },
      expected: { buy: true, sell: false, nextState: 'NORMAL_FRONT' }
    },
    {
      state: 'NORMAL_FRONT',
      expected: { buy: true, sell: true, nextState: 'NORMAL_FRONT' }
    },
    {
      state: 'NORMAL_BACK',
      overrides: { currentRound: 11, currentPrice: '45.00', averagePrice: '50.00', confirmedAveragePriceAfterClose: '50.00' },
      expected: { buy: true, sell: true, nextState: 'SELL_REJECT' }
    },
    {
      state: 'BUY_REJECT',
      expected: { buy: false, sell: true, nextState: 'NORMAL_FRONT' }
    },
    {
      state: 'SELL_REJECT',
      expected: { buy: true, sell: true, nextState: 'NORMAL_FRONT' }
    },
    {
      state: 'BIG_BUY',
      expected: { buy: true, sell: true, nextState: 'NORMAL_FRONT' }
    },
    {
      state: 'SKIP',
      expected: { buy: false, sell: true, nextState: 'SKIP' }
    },
    {
      state: 'REVERSE',
      expected: { buy: false, sell: true, nextState: 'EXIT_WAIT', reverseSell: true }
    },
    {
      state: 'EXIT_WAIT',
      expected: { buy: false, sell: true, nextState: 'EXIT_WAIT', reverseSell: true }
    },
    {
      state: 'CLOSED',
      expected: { buy: false, sell: false, nextState: 'CLOSED' }
    },
    {
      state: 'MANUAL_HALT',
      expected: { buy: false, sell: false, nextState: 'MANUAL_HALT' }
    }
  ];

  for (const item of cases) {
    const plan = generateOrderPlan(baseInput({
      ...(item.overrides || {}),
      strategyState: {
        state: item.state,
        cycleId: 'TQQQ-20260715-001',
        manualHaltReason: item.state === 'MANUAL_HALT' ? 'manual review' : null
      }
    }));

    assert.equal(plan.buyOrders.length > 0, item.expected.buy, `${item.state} buy order expectation`);
    assert.equal(plan.sellOrders.length > 0, item.expected.sell, `${item.state} sell order expectation`);
    assert.equal(plan.nextState, item.expected.nextState, `${item.state} next state expectation`);
    if (item.expected.reverseSell) {
      assert.equal(plan.sellOrders.every((order) => order.reason === 'REVERSE_EXIT_LOC_SELL'), true);
    }
  }
});

test('keeps live order automation disabled by default', () => {
  assert.equal(strategyConfig.enableAutoOrder, false);
});

function baseInput(overrides = {}) {
  return {
    symbol: 'TQQQ',
    currentPrice: '45.00',
    previousClose: '46.00',
    averagePrice: '50.00',
    confirmedAveragePriceAfterClose: '50.00',
    holdingQuantity: 10,
    availableSellQuantity: 10,
    cash: '10000.00',
    buyingPower: '10000.00',
    strategyCapital: '10000.00',
    unitAmount: '250.00',
    totalRound: 20,
    currentRound: 8,
    enableBigBuy: false,
    enableReverseMode: true,
    dailyCandles: [],
    openOrders: [],
    filledOrders: [],
    strategyState: {
      state: 'NORMAL_FRONT',
      cycleId: 'TQQQ-20260715-001'
    },
    riskSettings: {
      ...riskConfig,
      enableTrendFilter: false,
      crashDropPercent: -20,
      reverseExitProfitPercent: 1,
      reverseExitQuantityRatio: 0.5,
      minCashReserveRatio: 0
    },
    schedule: scheduleConfig,
    marketCalendar: { isOpen: true, minutesUntilClose: 120 },
    now: new Date('2026-07-15T12:00:00Z'),
    ...overrides
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOrderPlan } from '../src/strategy/orderPlanner.js';
import { buildStrategyInput } from '../src/strategy/strategyEngine.js';
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

  assert.equal(plan.nextState, 'SKIP');
  assert.equal(plan.buyOrders.length, 0);
  assert.equal(plan.rejectReasons.some((reason) => (
    reason.side === 'BUY' && reason.code === 'MA200_UNAVAILABLE_NEW_CYCLE'
  )), true);
  assert.equal(plan.skipSignal, true);
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

test('marks big buy condition when enabled and average loss reaches trigger', () => {
  const plan = generateOrderPlan(baseInput({
    enableBigBuy: true,
    currentPrice: '50.00',
    averagePrice: '60.00',
    confirmedAveragePriceAfterClose: '60.00',
    currentRound: 8,
    riskSettings: {
      ...riskConfig,
      bigBuyTriggerLossPercent: -5
    }
  }));

  assert.equal(plan.nextState, 'BIG_BUY');
  assert.equal(plan.bigBuySignal, true);
  assert.equal(plan.buyOrders.length, 1);
  assert.equal(plan.buyOrders[0].reason, 'BIG_BUY_LOC_BUY');
  assert.equal(plan.buyOrders[0].quantity, 20);
  assert.equal(Number(plan.expectedCashUsage), 995);
  assert.ok(plan.warnings.some((warning) => warning.startsWith('BIG_BUY:')));
});

test('caps big buy budget by cumulative cycle limit', () => {
  const plan = generateOrderPlan(baseInput({
    enableBigBuy: true,
    currentPrice: '50.00',
    averagePrice: '60.00',
    confirmedAveragePriceAfterClose: '60.00',
    currentRound: 8,
    cash: '10000.00',
    buyingPower: '10000.00',
    strategyState: {
      state: 'NORMAL_FRONT',
      cycleId: 'TQQQ-20260621-001',
      bigBuyAmountInCycle: '2900.00'
    },
    riskSettings: {
      ...riskConfig,
      bigBuyTriggerLossPercent: -5,
      bigBuyMaxCashRatio: 0.2,
      bigBuyMaxCapitalRatio: 0.3
    }
  }));

  assert.equal(plan.nextState, 'BIG_BUY');
  assert.equal(plan.buyOrders[0].reason, 'BIG_BUY_LOC_BUY');
  assert.equal(plan.buyOrders[0].quantity, 2);
  assert.equal(Number(plan.expectedCashUsage), 99.5);
});

test('blocks big buy when cash ratio is below big buy minimum', () => {
  const plan = generateOrderPlan(baseInput({
    enableBigBuy: true,
    currentPrice: '50.00',
    averagePrice: '60.00',
    confirmedAveragePriceAfterClose: '60.00',
    holdingQuantity: 100,
    availableSellQuantity: 100,
    currentRound: 8,
    cash: '500.00',
    buyingPower: '500.00',
    riskSettings: {
      ...riskConfig,
      bigBuyTriggerLossPercent: -5,
      bigBuyMinCashRatio: 0.25,
      minCashReserveRatio: 0
    }
  }));

  assert.equal(plan.bigBuySignal, false);
  assert.equal(plan.nextState, 'NORMAL_FRONT');
  assert.equal(plan.buyOrders[0].reason, 'NORMAL_MODE_LOC_BUY');
});

test('blocks big buy during consecutive down days', () => {
  const downCandles = Array.from({ length: 5 }, (_, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    open: 100 - index,
    close: 99 - index
  }));
  const plan = generateOrderPlan(baseInput({
    enableBigBuy: true,
    currentPrice: '50.00',
    averagePrice: '60.00',
    confirmedAveragePriceAfterClose: '60.00',
    currentRound: 8,
    dailyCandles: downCandles,
    riskSettings: {
      ...riskConfig,
      bigBuyTriggerLossPercent: -5,
      enableTrendFilter: false
    }
  }));

  assert.equal(plan.bigBuySignal, false);
  assert.equal(plan.nextState, 'NORMAL_FRONT');
  assert.equal(plan.buyOrders[0].reason, 'NORMAL_MODE_LOC_BUY');
});

test('enters skip state when crash filter blocks buying', () => {
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

  assert.equal(plan.nextState, 'SKIP');
  assert.equal(plan.skipSignal, true);
  assert.equal(plan.buyOrders.length, 0);
  assert.ok(plan.warnings.some((warning) => warning.startsWith('SKIP:')));
});

test('enters skip state when big buy cumulative budget is exhausted', () => {
  const plan = generateOrderPlan(baseInput({
    enableBigBuy: true,
    currentPrice: '50.00',
    averagePrice: '60.00',
    confirmedAveragePriceAfterClose: '60.00',
    currentRound: 8,
    strategyState: {
      state: 'NORMAL_FRONT',
      cycleId: 'TQQQ-20260621-001',
      bigBuyAmountInCycle: '3000.00'
    },
    riskSettings: {
      ...riskConfig,
      bigBuyTriggerLossPercent: -5,
      bigBuyMaxCapitalRatio: 0.3
    }
  }));

  assert.equal(plan.nextState, 'SKIP');
  assert.equal(plan.skipSignal, true);
  assert.equal(plan.bigBuySignal, false);
  assert.equal(plan.buyOrders.length, 0);
  assert.equal(plan.sellOrders.length > 0, true);
});

test('blocks new buy orders while preserving sell orders in skip state', () => {
  const dailyCandles = Array.from({ length: 200 }, (_, index) => ({
    date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
    open: 100,
    close: 100
  }));
  const plan = generateOrderPlan(baseInput({
    currentPrice: '50.00',
    previousClose: '51.00',
    averagePrice: '60.00',
    confirmedAveragePriceAfterClose: '60.00',
    currentRound: 8,
    dailyCandles,
    riskSettings: {
      ...riskConfig,
      enableTrendFilter: true
    }
  }));

  assert.equal(plan.nextState, 'SKIP');
  assert.equal(plan.skipSignal, true);
  assert.equal(plan.buyOrders.length, 0);
  assert.equal(plan.sellOrders.length > 0, true);
});

test('blocks TQQQ new cycle when QQQ is below MA200', () => {
  const trendCandles = Array.from({ length: 200 }, (_, index) => ({
    date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
    open: 100,
    close: 100
  }));
  const plan = generateOrderPlan(baseInput({
    symbol: 'TQQQ',
    currentPrice: '120.00',
    previousClose: '121.00',
    averagePrice: '120.00',
    confirmedAveragePriceAfterClose: '120.00',
    holdingQuantity: 0,
    availableSellQuantity: 0,
    currentRound: 0,
    trendSymbol: 'QQQ',
    trendPrice: '80.00',
    trendCandles,
    dailyCandles: [],
    strategyState: {
      state: 'READY',
      cycleId: 'TQQQ-20260621-001'
    },
    riskSettings: {
      ...riskConfig,
      enableTrendFilter: true
    }
  }));

  assert.equal(plan.nextState, 'SKIP');
  assert.equal(plan.buyOrders.length, 0);
  assert.equal(plan.rejectReasons.some((reason) => reason.code === 'TREND_FILTER_NEW_CYCLE'), true);
  assert.ok(plan.warnings.some((warning) => warning.includes('QQQ price is below MA200')));
});

test('blocks SOXL new cycle when SOXX is below MA200', () => {
  const trendCandles = Array.from({ length: 200 }, (_, index) => ({
    date: `2026-02-${String((index % 28) + 1).padStart(2, '0')}`,
    open: 100,
    close: 100
  }));
  const plan = generateOrderPlan(baseInput({
    symbol: 'SOXL',
    currentPrice: '40.00',
    previousClose: '41.00',
    averagePrice: '40.00',
    confirmedAveragePriceAfterClose: '40.00',
    holdingQuantity: 0,
    availableSellQuantity: 0,
    currentRound: 0,
    trendSymbol: 'SOXX',
    trendPrice: '75.00',
    trendCandles,
    dailyCandles: [],
    strategyState: {
      state: 'READY',
      cycleId: 'SOXL-20260621-001'
    },
    riskSettings: {
      ...riskConfig,
      enableTrendFilter: true
    }
  }));

  assert.equal(plan.nextState, 'SKIP');
  assert.equal(plan.buyOrders.length, 0);
  assert.equal(plan.rejectReasons.some((reason) => reason.code === 'TREND_FILTER_NEW_CYCLE'), true);
  assert.ok(plan.warnings.some((warning) => warning.includes('SOXX price is below MA200')));
});

test('applies symbol risk preset for SOXL', () => {
  const input = buildStrategyInput(baseContext({
    symbol: 'SOXL',
    market: {
      currentPrice: '40.00',
      previousClose: '41.00'
    }
  }));

  assert.equal(input.riskSettings.crashDropPercent, -12);
  assert.equal(input.riskSettings.minCashReserveRatio, 0.25);
  assert.equal(input.riskSettings.maxLossPause, -35);
  assert.equal(input.riskSettings.maxLossManualHalt, -50);
  assert.equal(input.riskSettings.maxLossStop, -65);
  assert.equal(input.riskSettings.consecutiveDownDaysLookback, 6);
  assert.equal(input.riskSettings.consecutiveDownDaysLimit, 5);
  assert.equal(input.riskSettings.bigBuyMinCashRatio, 0.3);
});

test('allows market risk settings to override symbol preset', () => {
  const input = buildStrategyInput(baseContext({
    symbol: 'SOXL',
    market: {
      currentPrice: '40.00',
      previousClose: '41.00',
      riskSettings: {
        crashDropPercent: -9,
        minCashReserveRatio: 0.22
      }
    }
  }));

  assert.equal(input.riskSettings.crashDropPercent, -9);
  assert.equal(input.riskSettings.minCashReserveRatio, 0.22);
  assert.equal(input.riskSettings.maxLossPause, -35);
});

test('uses SOXL crash preset in generated plan', () => {
  const input = buildStrategyInput(baseContext({
    symbol: 'SOXL',
    state: {
      state: 'NORMAL_FRONT',
      holdingQuantity: 10,
      averagePrice: '45.00'
    },
    market: {
      currentPrice: '36.50',
      previousClose: '40.00',
      enableTrendFilter: false
    },
    portfolio: {
      averagePrice: '45.00',
      holdingQuantity: 10,
      availableSellQuantity: 10,
      cash: '5000.00',
      buyingPower: '5000.00'
    }
  }));
  const plan = generateOrderPlan(input);

  assert.equal(plan.rejectReasons.some((reason) => reason.code === 'CRASH_FILTER'), false);
});

test('falls back to target candles when reference trend data is unavailable', () => {
  const dailyCandles = Array.from({ length: 200 }, (_, index) => ({
    date: `2026-03-${String((index % 28) + 1).padStart(2, '0')}`,
    open: 100,
    close: 100
  }));
  const plan = generateOrderPlan(baseInput({
    symbol: 'TQQQ',
    currentPrice: '120.00',
    previousClose: '121.00',
    averagePrice: '120.00',
    confirmedAveragePriceAfterClose: '120.00',
    holdingQuantity: 0,
    availableSellQuantity: 0,
    currentRound: 0,
    trendSymbol: 'QQQ',
    trendCandles: [],
    dailyCandles,
    strategyState: {
      state: 'READY',
      cycleId: 'TQQQ-20260621-001'
    },
    riskSettings: {
      ...riskConfig,
      enableTrendFilter: true
    }
  }));

  assert.equal(plan.nextState, 'NORMAL_FRONT');
  assert.equal(plan.buyOrders.length, 1);
  assert.ok(plan.warnings.some((warning) => warning.includes('falling back to TQQQ MA200')));
});

test('enters exit wait from skip after reverse exit order is planned', () => {
  const dailyCandles = [
    { date: '2026-01-01', open: 60, high: 61, low: 59, close: 60 },
    { date: '2026-01-02', open: 56, high: 57, low: 55, close: 56 },
    { date: '2026-01-03', open: 51, high: 52, low: 50, close: 51 },
    { date: '2026-01-04', open: 53, high: 54, low: 52, close: 53 },
    { date: '2026-01-05', open: 54, high: 55, low: 53, close: 54 }
  ];
  const plan = generateOrderPlan(baseInput({
    enableReverseMode: true,
    currentPrice: '54.00',
    previousClose: '53.00',
    averagePrice: '60.00',
    confirmedAveragePriceAfterClose: '60.00',
    currentRound: 8,
    dailyCandles,
    strategyState: {
      state: 'SKIP',
      cycleId: 'TQQQ-20260621-001'
    },
    riskSettings: {
      ...riskConfig,
      reverseLookbackDays: 5,
      reverseReboundPercent: 3,
      enableTrendFilter: false
    }
  }));

  assert.equal(plan.nextState, 'EXIT_WAIT');
  assert.equal(plan.reverseSignal, true);
  assert.equal(plan.skipSignal, false);
  assert.equal(plan.buyOrders.length, 0);
  assert.equal(plan.sellOrders.length, 1);
  assert.equal(plan.sellOrders[0].reason, 'REVERSE_EXIT_LOC_SELL');
  assert.equal(plan.sellOrders[0].quantity, 10);
  assert.equal(Number(plan.sellOrders[0].price), 60);
  assert.ok(plan.warnings.some((warning) => warning.startsWith('REVERSE:')));
});

test('moves reverse state to exit wait after reverse sell order is planned', () => {
  const plan = generateOrderPlan(baseInput({
    currentPrice: '55.00',
    previousClose: '54.00',
    averagePrice: '60.00',
    confirmedAveragePriceAfterClose: '60.00',
    currentRound: 8,
    strategyState: {
      state: 'REVERSE',
      cycleId: 'TQQQ-20260621-001'
    },
    riskSettings: {
      ...riskConfig,
      reverseExitProfitPercent: 1,
      reverseExitQuantityRatio: 0.5,
      enableTrendFilter: false
    }
  }));

  assert.equal(plan.nextState, 'EXIT_WAIT');
  assert.equal(plan.reverseSignal, false);
  assert.equal(plan.buyOrders.length, 0);
  assert.equal(plan.sellOrders.length, 1);
  assert.equal(plan.sellOrders[0].reason, 'REVERSE_EXIT_LOC_SELL');
  assert.equal(plan.sellOrders[0].quantity, 5);
  assert.equal(Number(plan.sellOrders[0].price), 60.6);
});

test('maintains exit wait and reverse sell order until exit is filled', () => {
  const plan = generateOrderPlan(baseInput({
    currentPrice: '55.00',
    previousClose: '54.00',
    averagePrice: '60.00',
    confirmedAveragePriceAfterClose: '60.00',
    currentRound: 8,
    strategyState: {
      state: 'EXIT_WAIT',
      cycleId: 'TQQQ-20260621-001'
    },
    riskSettings: {
      ...riskConfig,
      reverseExitProfitPercent: 1,
      reverseExitQuantityRatio: 0.5,
      enableTrendFilter: false
    }
  }));

  assert.equal(plan.nextState, 'EXIT_WAIT');
  assert.equal(plan.buyOrders.length, 0);
  assert.equal(plan.sellOrders.length, 1);
  assert.equal(plan.sellOrders[0].reason, 'REVERSE_EXIT_LOC_SELL');
  assert.equal(plan.sellOrders[0].quantity, 5);
  assert.equal(Number(plan.sellOrders[0].price), 60.6);
});

test('closes exit states when no holding quantity remains', () => {
  const plan = generateOrderPlan(baseInput({
    holdingQuantity: 0,
    availableSellQuantity: 0,
    currentPrice: '60.00',
    averagePrice: '0.00',
    confirmedAveragePriceAfterClose: '0.00',
    strategyState: {
      state: 'REVERSE',
      cycleId: 'TQQQ-20260621-001'
    }
  }));

  assert.equal(plan.nextState, 'CLOSED');
  assert.equal(plan.buyOrders.length, 0);
  assert.equal(plan.sellOrders.length, 0);

  const exitWaitPlan = generateOrderPlan(baseInput({
    holdingQuantity: 0,
    availableSellQuantity: 0,
    currentPrice: '60.00',
    averagePrice: '0.00',
    confirmedAveragePriceAfterClose: '0.00',
    strategyState: {
      state: 'EXIT_WAIT',
      cycleId: 'TQQQ-20260621-001'
    }
  }));

  assert.equal(exitWaitPlan.nextState, 'CLOSED');
  assert.equal(exitWaitPlan.buyOrders.length, 0);
  assert.equal(exitWaitPlan.sellOrders.length, 0);
});

test('keeps skip state when rebound is below reverse trigger', () => {
  const dailyCandles = [
    { date: '2026-01-01', open: 60, high: 61, low: 59, close: 60 },
    { date: '2026-01-02', open: 55, high: 56, low: 54, close: 55 },
    { date: '2026-01-03', open: 51, high: 52, low: 50, close: 51 },
    { date: '2026-01-04', open: 51, high: 52, low: 50.5, close: 51 },
    { date: '2026-01-05', open: 51, high: 52, low: 51, close: 51.2 }
  ];
  const plan = generateOrderPlan(baseInput({
    enableReverseMode: true,
    currentPrice: '51.20',
    previousClose: '51.00',
    averagePrice: '60.00',
    confirmedAveragePriceAfterClose: '60.00',
    currentRound: 8,
    dailyCandles,
    strategyState: {
      state: 'SKIP',
      cycleId: 'TQQQ-20260621-001'
    },
    riskSettings: {
      ...riskConfig,
      reverseLookbackDays: 5,
      reverseReboundPercent: 3,
      enableTrendFilter: false
    }
  }));

  assert.equal(plan.nextState, 'SKIP');
  assert.equal(plan.reverseSignal, false);
  assert.equal(plan.skipSignal, true);
  assert.equal(plan.buyOrders.length, 0);
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
    enableBigBuy: false,
    enableReverseMode: true,
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

function baseContext(overrides = {}) {
  const symbol = overrides.symbol || 'TQQQ';
  const state = {
    symbol,
    state: 'READY',
    cycleId: `${symbol}-20260621-001`,
    totalRound: 20,
    currentRound: 0,
    unitAmount: '250.00',
    strategyCapital: '10000.00',
    realizedBuyAmountInCycle: '0.00',
    averagePrice: '50.00',
    confirmedAveragePriceAfterClose: '50.00',
    holdingQuantity: 0,
    ...(overrides.state || {})
  };

  return {
    symbol,
    state,
    market: {
      currentPrice: '50.00',
      previousClose: '50.00',
      dailyCandles: [],
      ...(overrides.market || {})
    },
    portfolio: {
      averagePrice: state.averagePrice,
      holdingQuantity: state.holdingQuantity,
      availableSellQuantity: state.holdingQuantity,
      cash: '10000.00',
      buyingPower: '10000.00',
      ...(overrides.portfolio || {})
    },
    orders: {
      openOrders: [],
      filledOrders: [],
      ...(overrides.orders || {})
    },
    marketCalendar: { isOpen: true, minutesUntilClose: 120 },
    now: new Date('2026-06-21T12:00:00Z')
  };
}

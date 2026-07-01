import test from 'node:test';
import assert from 'node:assert/strict';
import { runInfiniteBuyingBacktest } from '../src/backtest/backtestEngine.js';
import { runMa20Backtest } from '../../toss-etf-ma20-3pct-trader/src/backtest.js';

const fixture = 'strategies/infinite_buying/test/fixtures/sample-candles.csv';

test('runs infinite buying backtest from csv', () => {
  const result = runInfiniteBuyingBacktest({
    file: fixture,
    symbol: 'TQQQ',
    cash: 10000,
    strategyCapital: 10000
  });

  assert.equal(result.strategy, 'infinite_buying');
  assert.equal(result.symbol, 'TQQQ');
  assert.ok(result.metrics.finalEquity > 0);
  assert.ok(result.equityCurve.length > 0);
});

test('runs ma20 backtest from csv', () => {
  const result = runMa20Backtest({
    file: fixture,
    symbol: 'TQQQ',
    cash: 10000,
    orderBudget: 1000,
    maWindow: 5,
    buyThreshold: 1.01,
    sellThreshold: 0.99
  });

  assert.equal(result.strategy, 'ma20');
  assert.equal(result.symbol, 'TQQQ');
  assert.ok(result.metrics.finalEquity > 0);
  assert.ok(result.equityCurve.length > 0);
});

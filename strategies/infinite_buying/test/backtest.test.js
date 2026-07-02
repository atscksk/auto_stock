import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInfiniteBuyingBacktest, writeStateTransitions } from '../src/backtest/backtestEngine.js';
import {
  formatInfiniteBuyingComparisonTable,
  runInfiniteBuyingComparison
} from '../src/backtest/compare.js';
import { runMa20Backtest } from '../../toss-etf-ma20-3pct-trader/src/backtest.js';

const fixture = 'strategies/infinite_buying/test/fixtures/sample-candles.csv';
const cycleFixture = 'strategies/infinite_buying/test/fixtures/cycle-candles.csv';
const rejectFixture = 'strategies/infinite_buying/test/fixtures/reject-candles.csv';

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

test('tracks infinite buying cycle summaries', () => {
  const result = runInfiniteBuyingBacktest({
    file: cycleFixture,
    symbol: 'TQQQ',
    cash: 10000,
    strategyCapital: 10000,
    disableTrendFilter: true
  });

  assert.ok(result.cycleSummaries.length >= 1);
  assert.equal(result.cycleSummaries[0].status, 'OPEN');
  assert.ok(result.cycleSummaries[0].buyAmount > 0);
  assert.ok(result.cycleSummaries[0].sellAmount > 0);
  assert.ok(result.cycleSummaries[0].realizedPnl > 0);
  assert.ok(result.cycleSummaries[0].unrealizedPnl > 0);
  assert.ok(result.cycleSummaries[0].totalPnl > 0);
});

test('counts buy and sell reject diagnostics separately', () => {
  const result = runInfiniteBuyingBacktest({
    file: rejectFixture,
    symbol: 'TQQQ',
    cash: 10000,
    strategyCapital: 1000,
    disableTrendFilter: true
  });

  assert.ok(result.diagnostics.sellRejectedDays > 0);
  assert.ok(result.diagnostics.sellRejectReasonCount > 0);
  assert.equal(result.diagnostics.rejectReasonCounts.STAR_SELL_BELOW_AVERAGE > 0, true);
});

test('writes infinite buying state transition history as csv and jsonl', () => {
  const result = runInfiniteBuyingBacktest({
    file: rejectFixture,
    symbol: 'TQQQ',
    cash: 10000,
    strategyCapital: 1000,
    disableTrendFilter: true
  });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-stock-'));
  const csvPath = path.join(tempDir, 'state-transitions.csv');
  const jsonlPath = path.join(tempDir, 'state-transitions.jsonl');

  writeStateTransitions(csvPath, result.stateTransitions);
  writeStateTransitions(jsonlPath, result.stateTransitions);

  const csv = fs.readFileSync(csvPath, 'utf8');
  const jsonl = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));

  assert.match(csv, /^date,symbol,cycleId,fromState,plannedState,endState/);
  assert.equal(jsonl.length, result.stateTransitions.length);
  assert.equal(jsonl.some((item) => item.sellRejected), true);
});

test('applies fee rate to infinite buying backtest fills', () => {
  const withoutFee = runInfiniteBuyingBacktest({
    file: cycleFixture,
    symbol: 'TQQQ',
    cash: 10000,
    strategyCapital: 10000,
    disableTrendFilter: true
  });
  const withFee = runInfiniteBuyingBacktest({
    file: cycleFixture,
    symbol: 'TQQQ',
    cash: 10000,
    strategyCapital: 10000,
    disableTrendFilter: true,
    feeRatePercent: 1
  });

  assert.ok(withFee.diagnostics.totalFees > 0);
  assert.ok(withFee.metrics.finalEquity < withoutFee.metrics.finalEquity);
  assert.ok(withFee.trades.every((trade) => trade.fee > 0));
  assert.ok(withFee.cycleSummaries[0].fees > 0);
});

test('applies tax rate to infinite buying sell fills', () => {
  const withoutTax = runInfiniteBuyingBacktest({
    file: cycleFixture,
    symbol: 'TQQQ',
    cash: 10000,
    strategyCapital: 10000,
    disableTrendFilter: true
  });
  const withTax = runInfiniteBuyingBacktest({
    file: cycleFixture,
    symbol: 'TQQQ',
    cash: 10000,
    strategyCapital: 10000,
    disableTrendFilter: true,
    taxRatePercent: 1
  });

  assert.ok(withTax.diagnostics.totalTaxes > 0);
  assert.ok(withTax.metrics.finalEquity < withoutTax.metrics.finalEquity);
  assert.ok(withTax.trades.some((trade) => trade.side === 'SELL' && trade.tax > 0));
  assert.ok(withTax.cycleSummaries[0].taxes > 0);
});

test('formats infinite buying comparison table', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-stock-compare-'));
  fs.copyFileSync(cycleFixture, path.join(tempDir, 'TQQQ-2025-H1.csv'));
  fs.copyFileSync(rejectFixture, path.join(tempDir, 'SOXL-2025-H1.csv'));

  const rows = runInfiniteBuyingComparison({
    dataDir: tempDir,
    symbols: 'TQQQ,SOXL',
    periods: '2025-H1',
    cash: 10000,
    strategyCapital: 10000,
    disableTrendFilter: true
  });
  const table = formatInfiniteBuyingComparisonTable(rows);

  assert.equal(rows.length, 2);
  assert.match(table, /\| 종목 \| 기간 \| 상태 \|/);
  assert.match(table, /TQQQ/);
  assert.match(table, /SOXL/);
});

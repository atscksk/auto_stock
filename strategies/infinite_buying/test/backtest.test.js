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
const bigBuyFixture = 'strategies/infinite_buying/test/fixtures/big-buy-candles.csv';
const reverseExitFixture = 'strategies/infinite_buying/test/fixtures/reverse-exit-candles.csv';

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

test('records big buy signal in infinite buying backtest diagnostics', () => {
  const result = runInfiniteBuyingBacktest({
    file: bigBuyFixture,
    symbol: 'TQQQ',
    cash: 10000,
    strategyCapital: 10000,
    disableTrendFilter: true,
    enableBigBuy: true
  });

  assert.ok(result.diagnostics.bigBuySignalDays > 0);
  assert.ok(result.stateTransitions.some((item) => item.bigBuySignal));
});

test('includes reverse signal diagnostics in infinite buying backtest', () => {
  const result = runInfiniteBuyingBacktest({
    file: bigBuyFixture,
    symbol: 'TQQQ',
    cash: 10000,
    strategyCapital: 10000,
    disableTrendFilter: true,
    enableBigBuy: true
  });

  assert.equal(typeof result.diagnostics.reverseSignalDays, 'number');
});

test('closes cycle after reverse exit fill in infinite buying backtest', () => {
  const result = runInfiniteBuyingBacktest({
    file: reverseExitFixture,
    symbol: 'TQQQ',
    cash: 10000,
    strategyCapital: 10000,
    disableTrendFilter: true
  });

  assert.equal(result.diagnostics.reverseSignalDays, 1);
  assert.equal(result.diagnostics.reverseExitDays, 1);
  assert.equal(result.trades.some((trade) => trade.reason === 'REVERSE_EXIT_LOC_SELL'), true);
  assert.equal(result.cycleSummaries[0].status, 'CLOSED');
  assert.equal(result.finalState.quantity, 0);
  assert.equal(result.finalState.state, 'READY');
  assert.equal(result.stateTransitions.some((item) => item.reverseExitFilled), true);
  assert.equal(result.stateTransitions.some((item) => item.plannedState === 'EXIT_WAIT'), true);
});

test('uses QQQ trend file to block TQQQ new cycle in backtest', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-stock-trend-'));
  const targetPath = path.join(tempDir, 'TQQQ.csv');
  const trendPath = path.join(tempDir, 'QQQ.csv');
  fs.writeFileSync(targetPath, formatCandlesCsv(makeCandles({
    count: 205,
    startClose: 120,
    finalClose: 120
  })), 'utf8');
  fs.writeFileSync(trendPath, formatCandlesCsv(makeCandles({
    count: 205,
    startClose: 100,
    finalClose: 80,
    finalCloseDays: 5
  })), 'utf8');

  const result = runInfiniteBuyingBacktest({
    file: targetPath,
    trendFile: trendPath,
    trendSymbol: 'QQQ',
    symbol: 'TQQQ',
    cash: 10000,
    strategyCapital: 10000
  });

  assert.equal(result.trades.length, 0);
  assert.equal(result.diagnostics.rejectReasonCounts.TREND_FILTER_NEW_CYCLE > 0, true);
});

test('uses SOXX trend file to block SOXL new cycle in backtest', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-stock-soxl-trend-'));
  const targetPath = path.join(tempDir, 'SOXL.csv');
  const trendPath = path.join(tempDir, 'SOXX.csv');
  fs.writeFileSync(targetPath, formatCandlesCsv(makeCandles({
    count: 205,
    startClose: 40,
    finalClose: 40
  })), 'utf8');
  fs.writeFileSync(trendPath, formatCandlesCsv(makeCandles({
    count: 205,
    startClose: 100,
    finalClose: 75,
    finalCloseDays: 5
  })), 'utf8');

  const result = runInfiniteBuyingBacktest({
    file: targetPath,
    trendFile: trendPath,
    trendSymbol: 'SOXX',
    symbol: 'SOXL',
    cash: 10000,
    strategyCapital: 10000
  });

  assert.equal(result.trades.length, 0);
  assert.equal(result.diagnostics.rejectReasonCounts.TREND_FILTER_NEW_CYCLE > 0, true);
});

function makeCandles({ count, startClose, finalClose, finalCloseDays = 1 }) {
  const start = new Date('2025-01-01T00:00:00Z');
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10);
    const close = index >= count - finalCloseDays ? finalClose : startClose;
    return { date, open: close, high: close + 1, low: close - 1, close, volume: 1000 };
  });
}

function formatCandlesCsv(candles) {
  return [
    'Date,Open,High,Low,Close,Volume',
    ...candles.map((candle) => [
      candle.date,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume
    ].join(','))
  ].join('\n');
}

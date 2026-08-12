import test from 'node:test';
import assert from 'node:assert/strict';
import { ma20Strategy } from '../src/strategy.js';

test('uses MA20 breakout as the default buy threshold', () => {
  const candles = buildFlatCandles(19, 100);
  const result = ma20Strategy([
    ...candles,
    candle('2026-08-13', 101)
  ]);

  assert.equal(result.signal, 'BUY');
  assert.equal(result.close, 101);
  assert.equal(result.ma20, 100.05);
  assert.equal(result.buyLine, 100.05);
  assert.equal(result.closeToMaPct > 0, true);
});

test('allows the old plus three percent buy threshold through options', () => {
  const candles = buildFlatCandles(19, 100);
  const result = ma20Strategy([
    ...candles,
    candle('2026-08-13', 101)
  ], {
    buyThreshold: 1.03
  });

  assert.equal(result.signal, 'HOLD');
  assert.equal(result.buyGapPct < 0, true);
});

test('includes distance diagnostics for hold and sell signals', () => {
  const hold = ma20Strategy([
    ...buildFlatCandles(19, 100),
    candle('2026-08-13', 99)
  ]);
  const sell = ma20Strategy([
    ...buildFlatCandles(19, 100),
    candle('2026-08-13', 95)
  ]);

  assert.equal(hold.signal, 'HOLD');
  assert.equal(typeof hold.closeToMaPct, 'number');
  assert.equal(typeof hold.buyGapPct, 'number');
  assert.equal(typeof hold.sellGapPct, 'number');
  assert.equal(sell.signal, 'SELL');
  assert.equal(sell.sellGapPct <= 0, true);
});

function buildFlatCandles(count, closePrice) {
  return Array.from({ length: count }, (_, index) => candle(`2026-07-${String(index + 1).padStart(2, '0')}`, closePrice));
}

function candle(timestamp, closePrice) {
  return {
    timestamp,
    closePrice: String(closePrice)
  };
}

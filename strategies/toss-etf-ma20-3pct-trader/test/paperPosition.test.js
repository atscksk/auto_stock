import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePaperPosition } from '../src/paperPosition.js';

test('calculates paper position from dry-run ma20 orders', () => {
  const position = calculatePaperPosition([
    { mode: 'DRY_RUN', symbol: '069500', side: 'BUY', quantity: '2', price: '100000' },
    { mode: 'DRY_RUN', symbol: '069500', side: 'BUY', quantity: '1', price: '130000' },
    { mode: 'DRY_RUN', symbol: '069500', side: 'SELL', quantity: '1', price: '140000' },
    { mode: 'LIVE', symbol: '069500', side: 'BUY', quantity: '99', price: '1' },
    { mode: 'DRY_RUN', symbol: 'TQQQ', side: 'BUY', quantity: '99', price: '1' }
  ], '069500');

  assert.equal(position.quantity, 2);
  assert.equal(position.averagePrice, 110000);
  assert.equal(position.cost, 220000);
  assert.equal(position.realizedPnl, 30000);
  assert.equal(position.hasPosition, true);
});

test('does not create negative paper position on oversized sell', () => {
  const position = calculatePaperPosition([
    { mode: 'DRY_RUN', symbol: '069500', side: 'BUY', quantity: '2', price: '100000' },
    { mode: 'DRY_RUN', symbol: '069500', side: 'SELL', quantity: '5', price: '90000' }
  ], '069500');

  assert.equal(position.quantity, 0);
  assert.equal(position.averagePrice, 0);
  assert.equal(position.cost, 0);
  assert.equal(position.realizedPnl, -20000);
  assert.equal(position.hasPosition, false);
});

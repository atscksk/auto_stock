import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRuntimeContextWithMarketData,
  firstPositiveText
} from '../src/services/contextService.js';

test('skips zero values when selecting runtime price input', () => {
  assert.equal(firstPositiveText(undefined, '', '0.00', '50.00'), '50.00');
  assert.equal(firstPositiveText('0', '48.25', '50.00'), '48.25');
  assert.equal(firstPositiveText('51.10', '48.25'), '51.10');
});

test('hydrates missing runtime price from daily candles', async () => {
  const context = await buildRuntimeContextWithMarketData('TESTX', {}, {
    tossClient: {
      async getDailyCandles(symbol) {
        if (symbol === 'QQQ') return [];
        return [
          { timestamp: '2026-07-24T00:00:00Z', closePrice: '49.50' },
          { timestamp: '2026-07-25T00:00:00Z', closePrice: '51.25' }
        ];
      }
    },
    trendSymbol: 'QQQ'
  });

  assert.equal(context.market.currentPrice, '51.25');
  assert.equal(context.market.previousClose, '49.50');
  assert.equal(context.portfolio.averagePrice, '51.25');
});

test('blocks planning when price is missing and no market client is configured', async () => {
  await assert.rejects(
    () => buildRuntimeContextWithMarketData('TESTX', {}),
    /Current price is required/
  );
});

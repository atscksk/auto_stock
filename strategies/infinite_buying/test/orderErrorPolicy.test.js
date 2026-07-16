import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBackoffMs,
  classifyOrderError,
  withOrderRetry
} from '../src/services/orderErrorPolicy.js';
import { assertLiveOrderAmountLimit } from '../src/services/orderService.js';

test('classifies token, IP, and permission errors as non retryable', () => {
  assert.deepEqual(classifyOrderError(new Error('Token issue failed (status=403)')).code, 'TOKEN_ISSUE_FAILED');

  const ipError = new Error('Token issue failed (status=403) body={"error_description":"IP address not allowed"}');
  assert.equal(classifyOrderError(ipError).code, 'IP_NOT_ALLOWED');
  assert.equal(classifyOrderError({ status: 403, body: 'IP address not allowed' }).code, 'IP_NOT_ALLOWED');
  assert.equal(classifyOrderError({ status: 403, body: 'access_denied' }).code, 'PERMISSION_DENIED');

  assert.equal(classifyOrderError({ status: 401, message: 'unauthorized' }).retryable, false);
});

test('classifies duplicate client order id as non retryable', () => {
  const result = classifyOrderError({
    status: 409,
    body: 'same clientOrderId cannot be used with a different request body'
  });

  assert.equal(result.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(result.retryable, false);
});

test('classifies rate limit and temporary failures as retryable', () => {
  assert.equal(classifyOrderError({ status: 429, body: 'too many requests' }).code, 'RATE_LIMIT');
  assert.equal(classifyOrderError({ status: 429, body: 'too many requests' }).retryable, true);
  assert.equal(classifyOrderError({ status: 503, body: 'service unavailable' }).code, 'TEMPORARY_BROKER_ERROR');
  assert.equal(classifyOrderError(new Error('fetch failed ETIMEDOUT')).retryable, true);
});

test('calculates exponential backoff', () => {
  assert.equal(calculateBackoffMs(1, 100), 100);
  assert.equal(calculateBackoffMs(2, 100), 200);
  assert.equal(calculateBackoffMs(3, 100), 400);
});

test('retries retryable order errors and then succeeds', async () => {
  const delays = [];
  let attempts = 0;
  const result = await withOrderRetry(async () => {
    attempts += 1;
    if (attempts < 3) {
      const error = new Error('rate limit');
      error.status = 429;
      throw error;
    }
    return 'ok';
  }, {
    baseDelayMs: 50,
    sleep: async (ms) => delays.push(ms)
  });

  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [50, 100]);
});

test('does not retry non retryable order errors', async () => {
  let attempts = 0;

  await assert.rejects(
    () => withOrderRetry(async () => {
      attempts += 1;
      const error = new Error('access_denied');
      error.status = 403;
      throw error;
    }, {
      sleep: async () => {
        throw new Error('should not sleep');
      }
    }),
    (error) => error.classification.code === 'PERMISSION_DENIED'
  );

  assert.equal(attempts, 1);
});

test('blocks live buy orders when first order amount limit is missing or exceeded', () => {
  const orders = [
    { side: 'BUY', price: '100', quantity: 3 }
  ];

  assert.throws(
    () => assertLiveOrderAmountLimit(orders, 0),
    /IB_LIVE_ORDER_AMOUNT_LIMIT must be set/
  );
  assert.throws(
    () => assertLiveOrderAmountLimit(orders, 250),
    /exceeds IB_LIVE_ORDER_AMOUNT_LIMIT/
  );
  assert.doesNotThrow(() => assertLiveOrderAmountLimit(orders, 300));
  assert.doesNotThrow(() => assertLiveOrderAmountLimit([{ side: 'SELL', price: '100', quantity: 3 }], 0));
});

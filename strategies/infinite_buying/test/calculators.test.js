import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCurrentRound,
  calculateLimit15Price,
  calculateStarPercent,
  calculateStarPrice,
  calculateUnitAmount
} from '../src/strategy/calculators.js';
import { decideNormalState, getStateOrderPolicy, StateOrderPolicy, StrategyState } from '../src/strategy/stateMachine.js';

test('calculates unit amount and fractional T', () => {
  assert.equal(calculateUnitAmount('10000', 40), '250.00');
  assert.equal(calculateCurrentRound('2150.00', '250.00'), 8.6);
});

test('calculates star percent and prices', () => {
  assert.equal(calculateStarPercent(20, 8.6), '2.8000');
  assert.equal(calculateStarPrice('38.30', '2.8'), '39.37');
  assert.equal(calculateLimit15Price('59.10'), '67.97');
});

test('decides front and back half state', () => {
  assert.equal(decideNormalState(10, 20), StrategyState.NORMAL_FRONT);
  assert.equal(decideNormalState(10.1, 20), StrategyState.NORMAL_BACK);
});

test('defines allowed order types for every strategy state', () => {
  assert.deepEqual(Object.keys(StateOrderPolicy).sort(), Object.values(StrategyState).sort());

  assert.deepEqual(getStateOrderPolicy(StrategyState.READY), {
    buy: true,
    standardSell: false,
    reverseExitSell: false
  });
  assert.deepEqual(getStateOrderPolicy(StrategyState.NORMAL_FRONT), {
    buy: true,
    standardSell: true,
    reverseExitSell: false
  });
  assert.deepEqual(getStateOrderPolicy(StrategyState.BUY_REJECT), {
    buy: false,
    standardSell: true,
    reverseExitSell: false
  });
  assert.deepEqual(getStateOrderPolicy(StrategyState.SKIP), {
    buy: false,
    standardSell: true,
    reverseExitSell: false
  });
  assert.deepEqual(getStateOrderPolicy(StrategyState.REVERSE), {
    buy: false,
    standardSell: false,
    reverseExitSell: true
  });
  assert.deepEqual(getStateOrderPolicy(StrategyState.EXIT_WAIT), {
    buy: false,
    standardSell: false,
    reverseExitSell: true
  });
  assert.deepEqual(getStateOrderPolicy(StrategyState.CLOSED), {
    buy: false,
    standardSell: false,
    reverseExitSell: false
  });
  assert.deepEqual(getStateOrderPolicy(StrategyState.MANUAL_HALT), {
    buy: false,
    standardSell: false,
    reverseExitSell: false
  });
});

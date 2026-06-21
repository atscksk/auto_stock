import path from 'node:path';
import { calculateUnitAmount } from '../strategy/calculators.js';
import { StrategyState } from '../strategy/stateMachine.js';
import { readJson, writeJson } from './jsonStore.js';

const DATA_DIR = path.resolve('strategies/infinite_buying/data');

export function statePath(symbol) {
  return path.join(DATA_DIR, `${symbol}.state.json`);
}

export function loadState(symbol) {
  const strategyCapital = process.env.IB_STRATEGY_CAPITAL || '10000.00';
  return readJson(statePath(symbol), {
    symbol,
    state: StrategyState.READY,
    cycleId: `${symbol}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-001`,
    totalRound: 20,
    currentRound: 0,
    unitAmount: calculateUnitAmount(strategyCapital, 40),
    strategyCapital,
    realizedBuyAmountInCycle: '0.00',
    averagePrice: '0.00',
    confirmedAveragePriceAfterClose: '0.00',
    holdingQuantity: 0,
    brokerSyncedAt: null,
    bigBuyCount: 0,
    buyRejectCount: 0,
    sellRejectCount: 0,
    manualHaltReason: null
  });
}

export function saveState(symbol, state) {
  writeJson(statePath(symbol), state);
}

import { createClientOrderId } from '../utils/idempotency.js';
import { floorQuantity, multiply, round, toNumber } from '../utils/decimal.js';
import {
  calculateLimit15Price,
  calculateStarPercent,
  calculateStarPrice
} from './calculators.js';
import { evaluateCutoffPolicy } from './cutoffPolicy.js';
import { evaluateRiskFilters } from './riskFilters.js';
import { decideNormalState, isTradingHalted, StrategyState } from './stateMachine.js';

export function generateOrderPlan(input) {
  const generatedAt = new Date().toISOString();
  const warnings = [];
  const buyOrders = [];
  const sellOrders = [];
  const cancelOrders = [];

  const state = input.strategyState?.state || StrategyState.READY;
  const cutoff = evaluateCutoffPolicy({
    now: input.now || new Date(),
    marketCalendar: input.marketCalendar || {},
    schedule: input.schedule
  });

  const starPercent = calculateStarPercent(input.totalRound, input.currentRound);
  const starPrice = calculateStarPrice(input.averagePrice || input.currentPrice, starPercent);
  const limit15Price = calculateLimit15Price(input.confirmedAveragePriceAfterClose || input.averagePrice || input.currentPrice);

  if (isTradingHalted(state)) {
    return haltPlan({
      input,
      generatedAt,
      state,
      starPercent,
      starPrice,
      warnings,
      reason: input.strategyState?.manualHaltReason || `Strategy state is ${state}.`
    });
  }

  if (input.syncResult?.isSynced === false) {
    return haltPlan({
      input,
      generatedAt,
      state: StrategyState.MANUAL_HALT,
      starPercent,
      starPrice,
      warnings: [...warnings, ...(input.syncResult.differences || [])],
      reason: 'Broker and internal state are not synced.'
    });
  }

  if (cutoff.noTouch) {
    warnings.push('NO_TOUCH window: order creation, cancel, and amend are blocked.');
  }
  if (cutoff.marketOpen === false) {
    warnings.push('Market is closed. Dry-run plan only.');
  }
  if (Array.isArray(input.openOrders) && input.openOrders.length > 0) {
    warnings.push(`Open orders exist: ${input.openOrders.length}. New duplicate submissions are blocked by default.`);
  }

  const risk = evaluateRiskFilters({
    ...input,
    riskSettings: {
      ...input.riskSettings,
      enableCrashFilter: input.enableCrashFilter
    }
  });
  warnings.push(...risk.warnings);

  const nextState = decideNextState({
    currentRound: input.currentRound,
    totalRound: input.totalRound,
    risk,
    state
  });

  const canPlanOrders = cutoff.marketOpen !== false && !cutoff.noTouch && input.openOrders?.length === 0;
  if (canPlanOrders) {
    if (risk.buyAllowed && cutoff.canSubmitOrder) {
      buyOrders.push(...buildBuyOrders({ input, nextState, risk }));
    }
    if (risk.sellAllowed && Number(input.availableSellQuantity || input.holdingQuantity || 0) > 0 && cutoff.canSubmitOrder) {
      sellOrders.push(...buildSellOrders({ input, starPrice, limit15Price }));
    }
  }

  const expectedCashUsage = buyOrders
    .reduce((sum, order) => sum + Number(order.price) * Number(order.quantity), 0)
    .toFixed(2);

  return {
    symbol: input.symbol,
    generatedAt,
    state,
    nextState,
    starPercent,
    starPrice,
    limit15Price,
    buyOrders,
    sellOrders,
    cancelOrders,
    warnings,
    riskLevel: risk.riskLevel,
    expectedCashUsage,
    noTouch: cutoff.noTouch,
    manualHaltReason: null,
    cutoff
  };
}

function decideNextState({ currentRound, totalRound, risk, state }) {
  if (risk.blocks.includes('MAX_LOSS_MANUAL_HALT') || risk.blocks.includes('MAX_LOSS_STOP')) {
    return StrategyState.MANUAL_HALT;
  }
  if (!risk.buyAllowed && state !== StrategyState.READY) {
    return StrategyState.BUY_REJECT;
  }
  return decideNormalState(currentRound, totalRound);
}

function buildBuyOrders({ input, nextState, risk }) {
  if (nextState === StrategyState.MANUAL_HALT) return [];
  const unitAmount = Number(input.unitAmount);
  const maxUnits = Number(input.currentRound) <= Number(input.totalRound) / 2 ? 2 : 1;
  const budget = round(unitAmount * maxUnits * risk.buySizeMultiplier, 2);
  const cashAfterReserve = Math.max(0, Number(input.cash || 0) - Number(input.strategyCapital) * Number(input.riskSettings.minCashReserveRatio));
  const usableBudget = Math.min(Number(budget), cashAfterReserve, Number(input.buyingPower || input.cash || 0));
  const quantity = floorQuantity(usableBudget, input.currentPrice);
  if (quantity <= 0) return [];

  const buyPrice = round(Number(input.currentPrice) * 0.995, 2);
  return [{
    clientOrderId: createClientOrderId({
      cycleId: input.strategyState?.cycleId || `${input.symbol}-CYCLE`,
      symbol: input.symbol,
      side: 'BUY',
      sequence: 1,
      date: input.now || new Date()
    }),
    cycleId: input.strategyState?.cycleId || `${input.symbol}-CYCLE`,
    symbol: input.symbol,
    side: 'BUY',
    orderType: 'LIMIT',
    timeInForce: 'CLS',
    price: buyPrice,
    quantity,
    status: 'PLANNED',
    reason: 'NORMAL_MODE_LOC_BUY'
  }];
}

function buildSellOrders({ input, starPrice, limit15Price }) {
  const quantity = Math.floor(Number(input.availableSellQuantity || input.holdingQuantity || 0));
  if (quantity <= 0) return [];

  const cycleId = input.strategyState?.cycleId || `${input.symbol}-CYCLE`;
  const sellableForStar = Math.max(1, Math.floor(quantity * 0.7));
  const sellableFor15 = Math.max(0, quantity - sellableForStar);
  const orders = [{
    clientOrderId: createClientOrderId({
      cycleId,
      symbol: input.symbol,
      side: 'SELL',
      sequence: 1,
      date: input.now || new Date()
    }),
    cycleId,
    symbol: input.symbol,
    side: 'SELL',
    orderType: 'LIMIT',
    timeInForce: 'CLS',
    price: starPrice,
    quantity: sellableForStar,
    status: 'PLANNED',
    reason: 'STAR_PERCENT_LOC_SELL'
  }];

  if (sellableFor15 > 0 && toNumber(limit15Price) > toNumber(starPrice)) {
    orders.push({
      clientOrderId: createClientOrderId({
        cycleId,
        symbol: input.symbol,
        side: 'SELL',
        sequence: 2,
        date: input.now || new Date()
      }),
      cycleId,
      symbol: input.symbol,
      side: 'SELL',
      orderType: 'LIMIT',
      timeInForce: 'DAY',
      price: limit15Price,
      quantity: sellableFor15,
      status: 'PLANNED',
      reason: 'LIMIT_15_DAY_SELL'
    });
  }

  return orders;
}

function haltPlan({ input, generatedAt, state, starPercent, starPrice, warnings, reason }) {
  return {
    symbol: input.symbol,
    generatedAt,
    state,
    nextState: StrategyState.MANUAL_HALT,
    starPercent,
    starPrice,
    buyOrders: [],
    sellOrders: [],
    cancelOrders: [],
    warnings,
    riskLevel: 'HALT',
    expectedCashUsage: '0.00',
    noTouch: false,
    manualHaltReason: reason
  };
}

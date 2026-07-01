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
  const rejectReasons = [];
  const currentSellRejectCount = Number(input.strategyState?.sellRejectCount || 0);
  let buyRejected = false;
  let sellMaintainedOnBuyReject = false;
  let nextSellRejectCount = 0;
  let manualHaltReason = null;

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
      enableCrashFilter: input.enableCrashFilter,
      enableTrendFilter: input.enableTrendFilter
    }
  });
  warnings.push(...risk.warnings);
  rejectReasons.push(...buildBuyRejectReasons({ risk, warnings }));
  buyRejected = !risk.buyAllowed;

  let nextState = decideNextState({
    currentRound: input.currentRound,
    totalRound: input.totalRound,
    risk,
    state
  });

  const canPlanOrders = cutoff.marketOpen !== false && !cutoff.noTouch && input.openOrders?.length === 0;
  if (canPlanOrders) {
    if (risk.buyAllowed && cutoff.canSubmitOrder) {
      const buyPlan = buildBuyOrders({ input, nextState, risk });
      buyOrders.push(...buyPlan.orders);
      if (buyPlan.rejected) {
        buyRejected = true;
        rejectReasons.push(buyPlan.rejectReason);
        warnings.push(`BUY_REJECT: ${buyPlan.rejectReason.message}`);
      }
    }
    if (risk.sellAllowed && Number(input.availableSellQuantity || input.holdingQuantity || 0) > 0 && cutoff.canSubmitOrder) {
      const sellPlan = buildSellOrders({ input, starPercent, starPrice, limit15Price, warnings, rejectReasons });
      sellOrders.push(...sellPlan.orders);
      sellMaintainedOnBuyReject = buyRejected && sellOrders.length > 0;
      if (sellPlan.sellRejected && nextState !== StrategyState.MANUAL_HALT) {
        nextState = StrategyState.SELL_REJECT;
        nextSellRejectCount = currentSellRejectCount + 1;
      }
    }
  }

  const sellRejectLimit = Number(input.riskSettings?.sellRejectLimit || 5);
  if (nextSellRejectCount > sellRejectLimit) {
    nextState = StrategyState.MANUAL_HALT;
    manualHaltReason = `Sell reject count ${nextSellRejectCount} exceeded limit ${sellRejectLimit}. Manual review is required.`;
    buyOrders.length = 0;
    sellOrders.length = 0;
    warnings.push(`MANUAL_HALT: ${manualHaltReason}`);
    rejectReasons.push({
      code: 'SELL_REJECT_LIMIT_EXCEEDED',
      side: 'SELL',
      state: StrategyState.MANUAL_HALT,
      message: manualHaltReason,
      details: {
        sellRejectCount: nextSellRejectCount,
        sellRejectLimit
      }
    });
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
    rejectReasons,
    buyRejected,
    sellMaintainedOnBuyReject,
    riskLevel: risk.riskLevel,
    expectedCashUsage,
    noTouch: cutoff.noTouch,
    sellRejectCount: nextSellRejectCount,
    manualHaltReason,
    cutoff
  };
}

function buildBuyRejectReasons({ risk, warnings }) {
  if (!Array.isArray(risk.blocks) || risk.blocks.length === 0) return [];
  return risk.blocks.map((block) => ({
    code: block,
    side: 'BUY',
    state: buyRejectState(block),
    message: buyRejectMessage(block, warnings),
    details: {
      riskLevel: risk.riskLevel,
      buyAllowed: risk.buyAllowed
    }
  }));
}

function buyRejectState(block) {
  if (block === 'MAX_LOSS_STOP' || block === 'MAX_LOSS_MANUAL_HALT') return StrategyState.MANUAL_HALT;
  return StrategyState.BUY_REJECT;
}

function buyRejectMessage(block, warnings) {
  const warning = warnings.find((item) => item.includes(block) || warningMatchesBlock(item, block));
  if (warning) return warning;
  const labels = {
    CASH_RESERVE_BELOW_MINIMUM: 'Cash reserve is below minimum.',
    CRASH_FILTER: 'Crash filter blocked new buying.',
    MAX_LOSS_STOP: 'Maximum loss stop blocked new buying.',
    MAX_LOSS_MANUAL_HALT: 'Maximum loss manual halt blocked new buying.',
    MAX_LOSS_PAUSE: 'Maximum loss pause blocked new buying.',
    MA200_UNAVAILABLE_NEW_CYCLE: 'MA200 is unavailable for a new cycle.',
    TREND_FILTER_NEW_CYCLE: 'Trend filter blocked a new cycle.'
  };
  return labels[block] || block;
}

function warningMatchesBlock(warning, block) {
  const patterns = {
    CASH_RESERVE_BELOW_MINIMUM: 'Cash reserve',
    CRASH_FILTER: 'below previous close',
    MAX_LOSS_STOP: 'stop threshold',
    MAX_LOSS_MANUAL_HALT: 'manual halt threshold',
    MAX_LOSS_PAUSE: 'pause threshold',
    MA200_UNAVAILABLE_NEW_CYCLE: 'MA200 unavailable',
    TREND_FILTER_NEW_CYCLE: 'Trend filter active'
  };
  return patterns[block] ? warning.includes(patterns[block]) : false;
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
  if (nextState === StrategyState.MANUAL_HALT) return { orders: [], rejected: false, rejectReason: null };
  const unitAmount = Number(input.unitAmount);
  const maxUnits = Number(input.currentRound) <= Number(input.totalRound) / 2 ? 2 : 1;
  const budget = round(unitAmount * maxUnits * risk.buySizeMultiplier, 2);
  const cashAfterReserve = Math.max(0, Number(input.cash || 0) - Number(input.strategyCapital) * Number(input.riskSettings.minCashReserveRatio));
  const usableBudget = Math.min(Number(budget), cashAfterReserve, Number(input.buyingPower || input.cash || 0));
  if (usableBudget <= 0) {
    return buyReject({
      code: 'INSUFFICIENT_BUYING_POWER',
      message: 'No usable buying power remains after cash reserve and budget checks.',
      details: { budget, cashAfterReserve, buyingPower: Number(input.buyingPower || input.cash || 0) }
    });
  }

  const buyPrice = round(Number(input.currentPrice) * 0.995, 2);
  const averagePrice = toNumber(input.averagePrice || 0);
  const holdingQuantity = Number(input.holdingQuantity || 0);
  if (holdingQuantity > 0 && averagePrice > 0) {
    const improvementPercent = ((averagePrice - buyPrice) / averagePrice) * 100;
    const minImprovement = Number(input.riskSettings.minAverageImprovementPercent || 0);
    if (improvementPercent <= minImprovement) {
      return buyReject({
        code: 'AVERAGE_IMPROVEMENT_INSUFFICIENT',
        message: `Buy blocked because average price improvement ${improvementPercent.toFixed(2)}% is not above minimum ${minImprovement.toFixed(2)}%.`,
        details: { averagePrice, buyPrice, improvementPercent: round(improvementPercent, 4), minImprovement }
      });
    }
  }

  const quantity = floorQuantity(usableBudget, input.currentPrice);
  if (quantity <= 0) {
    return buyReject({
      code: 'INSUFFICIENT_BUY_QUANTITY',
      message: 'Buy blocked because usable budget cannot buy at least one share.',
      details: { usableBudget, currentPrice: Number(input.currentPrice) }
    });
  }

  return { orders: [{
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
  }], rejected: false, rejectReason: null };
}

function buyReject({ code, message, details }) {
  return {
    orders: [],
    rejected: true,
    rejectReason: {
      code,
      side: 'BUY',
      state: StrategyState.BUY_REJECT,
      message,
      details
    }
  };
}

function buildSellOrders({ input, starPercent, starPrice, limit15Price, warnings, rejectReasons }) {
  const quantity = Math.floor(Number(input.availableSellQuantity || input.holdingQuantity || 0));
  if (quantity <= 0) return { orders: [], sellRejected: false };

  const cycleId = input.strategyState?.cycleId || `${input.symbol}-CYCLE`;
  const averagePrice = toNumber(input.averagePrice || input.currentPrice);
  const starSellWouldRealizeLoss = toNumber(starPercent) < 0 || toNumber(starPrice) < averagePrice;
  const orders = [];
  let sellRejected = false;
  let sellableFor15 = quantity;
  let sequence = 1;
  let starRejectReason = null;
  let assistSellMaintained = false;
  let assistSellQuantity = 0;

  if (starSellWouldRealizeLoss) {
    sellRejected = true;
    const message = `Star sell blocked because star price ${starPrice} is below average price ${averagePrice}.`;
    warnings.push(`SELL_REJECT: ${message}`);
    starRejectReason = {
      code: 'STAR_SELL_BELOW_AVERAGE',
      side: 'SELL',
      state: StrategyState.SELL_REJECT,
      message,
      details: {
        starPercent,
        starPrice,
        averagePrice
      }
    };
  } else {
    const sellableForStar = Math.max(1, Math.floor(quantity * 0.7));
    sellableFor15 = Math.max(0, quantity - sellableForStar);
    orders.push({
      clientOrderId: createClientOrderId({
        cycleId,
        symbol: input.symbol,
        side: 'SELL',
        sequence,
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
    });
    sequence += 1;
  }

  if (sellableFor15 > 0 && toNumber(limit15Price) > Math.max(toNumber(starPrice), averagePrice)) {
    if (starSellWouldRealizeLoss) {
      assistSellMaintained = true;
      assistSellQuantity = sellableFor15;
    }
    orders.push({
      clientOrderId: createClientOrderId({
        cycleId,
        symbol: input.symbol,
        side: 'SELL',
        sequence,
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

  if (starRejectReason) {
    starRejectReason.details.assistSellMaintained = assistSellMaintained;
    starRejectReason.details.assistSellQuantity = assistSellQuantity;
    starRejectReason.details.assistSellPrice = assistSellMaintained ? limit15Price : null;
    if (assistSellMaintained) {
      warnings.push(`SELL_REJECT: 15% assist sell remains active for ${assistSellQuantity} shares at ${limit15Price}.`);
    } else {
      warnings.push(`SELL_REJECT: 15% assist sell skipped because assist price ${limit15Price} is not above average price ${averagePrice}.`);
    }
    rejectReasons.push(starRejectReason);
  }

  return { orders, sellRejected };
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
    rejectReasons: [],
    buyRejected: false,
    sellMaintainedOnBuyReject: false,
    riskLevel: 'HALT',
    expectedCashUsage: '0.00',
    noTouch: false,
    sellRejectCount: Number(input.strategyState?.sellRejectCount || 0),
    manualHaltReason: reason
  };
}

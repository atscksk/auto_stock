import { createClientOrderId } from '../utils/idempotency.js';
import { floorQuantity, multiply, round, toNumber } from '../utils/decimal.js';
import {
  calculateAverageLossPercent,
  calculateDayDropPercent,
  calculateLimit15Price,
  calculateStarPercent,
  calculateStarPrice,
  countDownDays
} from './calculators.js';
import { evaluateCutoffPolicy } from './cutoffPolicy.js';
import { evaluateRiskFilters } from './riskFilters.js';
import { decideNormalState, getStateOrderPolicy, isTradingHalted, StrategyState } from './stateMachine.js';
import { evaluateTrendMa200 } from './trendFilter.js';

export function generateOrderPlan(input) {
  const generatedAt = new Date().toISOString();
  const warnings = [];
  const buyOrders = [];
  const sellOrders = [];
  const cancelOrders = [];
  const rejectReasons = [];
  const currentSellRejectCount = Number(input.strategyState?.sellRejectCount || 0);
  let buyRejected = false;
  let bigBuySignal = false;
  let skipSignal = false;
  let reverseSignal = false;
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
    state,
    holdingQuantity: input.holdingQuantity
  });
  const reverse = evaluateReverseCondition({ input, state, nextState });
  reverseSignal = reverse.triggered;
  if (reverseSignal && nextState !== StrategyState.MANUAL_HALT) {
    nextState = StrategyState.REVERSE;
    warnings.push(`REVERSE: ${reverse.message}`);
  }
  const skip = reverseSignal
    ? { triggered: false, message: 'Reverse mode has priority over skip.' }
    : evaluateSkipCondition({ input, risk, nextState });
  skipSignal = skip.triggered;
  if (skipSignal && nextState !== StrategyState.MANUAL_HALT) {
    nextState = StrategyState.SKIP;
    warnings.push(`SKIP: ${skip.message}`);
  }
  const bigBuy = skipSignal
    ? { triggered: false, message: 'Skip state has priority over big buy.' }
    : evaluateBigBuyCondition({ input, risk });
  bigBuySignal = bigBuy.triggered;
  if (bigBuySignal && nextState !== StrategyState.MANUAL_HALT && nextState !== StrategyState.SKIP) {
    nextState = StrategyState.BIG_BUY;
    warnings.push(`BIG_BUY: ${bigBuy.message}`);
  }

  const canPlanOrders = cutoff.marketOpen !== false && !cutoff.noTouch && input.openOrders?.length === 0;
  if (canPlanOrders) {
    let orderPolicy = adjustOrderPolicyForCurrentState(getStateOrderPolicy(nextState), state);
    if (orderPolicy.buy && risk.buyAllowed && cutoff.canSubmitOrder) {
      const buyPlan = buildBuyOrders({ input, nextState, risk });
      buyOrders.push(...buyPlan.orders);
      if (buyPlan.rejected) {
        buyRejected = true;
        rejectReasons.push(buyPlan.rejectReason);
        warnings.push(`BUY_REJECT: ${buyPlan.rejectReason.message}`);
      }
    }
    orderPolicy = adjustOrderPolicyForCurrentState(getStateOrderPolicy(nextState), state);
    if (
      (orderPolicy.standardSell || orderPolicy.reverseExitSell)
      && risk.sellAllowed
      && Number(input.availableSellQuantity || input.holdingQuantity || 0) > 0
      && cutoff.canSubmitOrder
    ) {
      const sellPlan = buildSellOrders({ input, nextState, orderPolicy, starPercent, starPrice, limit15Price, warnings, rejectReasons });
      sellOrders.push(...sellPlan.orders);
      if (sellPlan.exitWait) {
        nextState = StrategyState.EXIT_WAIT;
      }
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
    bigBuySignal,
    skipSignal,
    reverseSignal,
    sellMaintainedOnBuyReject,
    riskLevel: risk.riskLevel,
    expectedCashUsage,
    noTouch: cutoff.noTouch,
    sellRejectCount: nextSellRejectCount,
    manualHaltReason,
    cutoff
  };
}

function adjustOrderPolicyForCurrentState(nextPolicy, currentState) {
  if (currentState === StrategyState.BUY_REJECT) {
    return {
      ...nextPolicy,
      buy: false
    };
  }

  return nextPolicy;
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

function decideNextState({ currentRound, totalRound, risk, state, holdingQuantity }) {
  if (risk.blocks.includes('MAX_LOSS_MANUAL_HALT') || risk.blocks.includes('MAX_LOSS_STOP')) {
    return StrategyState.MANUAL_HALT;
  }
  if (state === StrategyState.REVERSE) {
    if (Number(holdingQuantity || 0) <= 0) return StrategyState.CLOSED;
    return StrategyState.REVERSE;
  }
  if (state === StrategyState.EXIT_WAIT) {
    if (Number(holdingQuantity || 0) <= 0) return StrategyState.CLOSED;
    return StrategyState.EXIT_WAIT;
  }
  if (!risk.buyAllowed && state !== StrategyState.READY) {
    return StrategyState.BUY_REJECT;
  }
  return decideNormalState(currentRound, totalRound);
}

function evaluateBigBuyCondition({ input, risk }) {
  if (input.enableBigBuy !== true) return { triggered: false, message: 'Big buy is disabled.' };
  if (!risk.buyAllowed) return { triggered: false, message: 'Risk filters blocked buying.' };

  const blocked = evaluateBigBuyBlocks(input);
  if (blocked) return { triggered: false, message: blocked.message, blocked: true, blockCode: blocked.code };

  const holdingQuantity = Number(input.holdingQuantity || 0);
  const averagePrice = toNumber(input.averagePrice || 0);
  const currentPrice = toNumber(input.currentPrice || 0);
  if (holdingQuantity <= 0 || averagePrice <= 0 || currentPrice <= 0) {
    return { triggered: false, message: 'Big buy requires an existing position and valid prices.' };
  }

  const lossPercent = ((currentPrice - averagePrice) / averagePrice) * 100;
  const triggerLossPercent = Number(input.riskSettings?.bigBuyTriggerLossPercent ?? -5);
  if (lossPercent > triggerLossPercent) {
    return {
      triggered: false,
      message: `Average loss ${lossPercent.toFixed(2)}% is above big buy trigger ${triggerLossPercent.toFixed(2)}%.`
    };
  }

  return {
    triggered: true,
    lossPercent,
    triggerLossPercent,
    message: `Average loss ${lossPercent.toFixed(2)}% reached big buy trigger ${triggerLossPercent.toFixed(2)}%.`
  };
}

function evaluateReverseCondition({ input, state, nextState }) {
  if (input.enableReverseMode === false) return { triggered: false, message: 'Reverse mode is disabled.' };
  if (nextState === StrategyState.MANUAL_HALT) return { triggered: false, message: 'Manual halt has priority.' };
  if (state !== StrategyState.SKIP) return { triggered: false, message: 'Reverse mode starts only after skip state.' };

  const holdingQuantity = Number(input.holdingQuantity || 0);
  const currentPrice = toNumber(input.currentPrice || 0);
  if (holdingQuantity <= 0 || currentPrice <= 0) {
    return { triggered: false, message: 'Reverse mode requires an existing position and a valid current price.' };
  }

  const recentLow = calculateRecentLowBeforeCurrent(input.dailyCandles, Number(input.riskSettings?.reverseLookbackDays || 5));
  if (recentLow == null || recentLow <= 0) {
    return { triggered: false, message: 'Reverse mode requires recent low data.' };
  }

  const reboundPercent = ((currentPrice - recentLow) / recentLow) * 100;
  const triggerPercent = Number(input.riskSettings?.reverseReboundPercent ?? 3);
  if (reboundPercent < triggerPercent) {
    return {
      triggered: false,
      reboundPercent,
      triggerPercent,
      recentLow,
      message: `Rebound ${reboundPercent.toFixed(2)}% is below reverse trigger ${triggerPercent.toFixed(2)}%.`
    };
  }

  return {
    triggered: true,
    reboundPercent,
    triggerPercent,
    recentLow,
    message: `Rebound ${reboundPercent.toFixed(2)}% from recent low ${recentLow.toFixed(2)} reached reverse trigger ${triggerPercent.toFixed(2)}%.`
  };
}

function evaluateSkipCondition({ input, risk, nextState }) {
  if (nextState === StrategyState.MANUAL_HALT) return { triggered: false, message: 'Manual halt has priority.' };
  if (input.strategyState?.state === StrategyState.SKIP && Number(input.holdingQuantity || 0) > 0) {
    return {
      triggered: true,
      code: 'SKIP_MAINTAINED',
      message: 'Skip state is maintained until reverse trigger.'
    };
  }

  const skipBlocks = [
    'CASH_RESERVE_BELOW_MINIMUM',
    'CRASH_FILTER',
    'MAX_LOSS_PAUSE',
    'TREND_FILTER_NEW_CYCLE',
    'MA200_UNAVAILABLE_NEW_CYCLE'
  ];
  const block = risk.blocks.find((item) => skipBlocks.includes(item));
  if (block) {
    return {
      triggered: true,
      code: block,
      message: `${block} triggered skip state.`
    };
  }

  const currentPrice = toNumber(input.currentPrice || 0);
  if ((input.dailyCandles?.length || input.trendCandles?.length) && input.riskSettings.enableTrendFilter !== false) {
    const trend = evaluateTrendMa200(input);
    if (trend.available && currentPrice > 0 && trend.price < trend.ma200) {
      return {
        triggered: true,
        code: 'SKIP_BELOW_MA200',
        message: `${trend.symbol} price ${trend.price} is below MA200 ${trend.ma200.toFixed(2)}.`
      };
    }
  }

  if (input.enableBigBuy === true) {
    const bigBuyCondition = evaluateBigBuyCondition({ input, risk });
    const remainingBigBuyBudget = calculateRemainingBigBuyBudget(input);
    if (bigBuyCondition.triggered && remainingBigBuyBudget <= 0) {
      return {
        triggered: true,
        code: 'SKIP_BIG_BUY_LIMIT_EXHAUSTED',
        message: 'Big buy cumulative budget is exhausted.'
      };
    }
  }

  return { triggered: false, message: 'Skip condition not met.' };
}

function evaluateBigBuyBlocks(input) {
  const currentPrice = toNumber(input.currentPrice || 0);
  const previousClose = toNumber(input.previousClose || 0);
  const averagePrice = toNumber(input.averagePrice || 0);
  const totalEquity = Number(input.cash || 0) + Number(input.holdingQuantity || 0) * currentPrice;
  const cashRatio = totalEquity > 0 ? Number(input.cash || 0) / totalEquity : 0;
  const minCashRatio = Number(input.riskSettings.bigBuyMinCashRatio ?? 0.25);
  if (cashRatio < minCashRatio) {
    return {
      code: 'BIG_BUY_CASH_RATIO_BELOW_MINIMUM',
      message: `Cash ratio ${formatPercent(cashRatio)} is below big buy minimum ${formatPercent(minCashRatio)}.`
    };
  }

  const dayDrop = calculateDayDropPercent(currentPrice, previousClose);
  if (input.riskSettings.enableCrashFilter !== false && dayDrop <= Number(input.riskSettings.crashDropPercent)) {
    return {
      code: 'BIG_BUY_CRASH_FILTER',
      message: `Day drop ${dayDrop.toFixed(2)}% blocks big buy.`
    };
  }

  const averageLoss = calculateAverageLossPercent(currentPrice, averagePrice);
  if (averageLoss <= Number(input.riskSettings.maxLossPause)) {
    return {
      code: 'BIG_BUY_MAX_LOSS_PAUSE',
      message: `Average loss ${averageLoss.toFixed(2)}% blocks big buy.`
    };
  }

  if (input.dailyCandles?.length || input.trendCandles?.length) {
    if (input.dailyCandles?.length) {
      const downDays = countDownDays(input.dailyCandles, input.riskSettings.consecutiveDownDaysLookback);
      if (downDays >= Number(input.riskSettings.consecutiveDownDaysLimit)) {
        return {
          code: 'BIG_BUY_CONSECUTIVE_DOWN_DAYS',
          message: `Recent down days ${downDays}/${input.riskSettings.consecutiveDownDaysLookback} blocks big buy.`
        };
      }
    }

    if (input.riskSettings.enableTrendFilter !== false) {
      const trend = evaluateTrendMa200(input);
      if (trend.available && trend.price < trend.ma200) {
        return {
          code: 'BIG_BUY_BELOW_MA200',
          message: `${trend.symbol} price ${trend.price} is below MA200 ${trend.ma200.toFixed(2)}.`
        };
      }
    }
  }

  return null;
}

function formatPercent(value) {
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function buildBuyOrders({ input, nextState, risk }) {
  const unitAmount = Number(input.unitAmount);
  const maxUnits = Number(input.currentRound) <= Number(input.totalRound) / 2 ? 2 : 1;
  const baseBudget = unitAmount * maxUnits * risk.buySizeMultiplier;
  const remainingBigBuyBudget = calculateRemainingBigBuyBudget(input);
  const bigBuyBudget = nextState === StrategyState.BIG_BUY
    ? Math.min(
      Number(input.cash || 0) * Number(input.riskSettings.bigBuyMaxCashRatio || 0.2) * risk.buySizeMultiplier,
      remainingBigBuyBudget
    )
    : 0;
  const budget = round(nextState === StrategyState.BIG_BUY ? bigBuyBudget : baseBudget, 2);
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
    reason: nextState === StrategyState.BIG_BUY ? 'BIG_BUY_LOC_BUY' : 'NORMAL_MODE_LOC_BUY'
  }], rejected: false, rejectReason: null };
}

function calculateRemainingBigBuyBudget(input) {
  const maxCapitalBudget = Number(input.strategyCapital || 0) * Number(input.riskSettings.bigBuyMaxCapitalRatio || 0.3);
  const usedBudget = Number(input.bigBuyAmountInCycle || input.strategyState?.bigBuyAmountInCycle || 0);
  return Math.max(0, maxCapitalBudget - usedBudget);
}

function calculateRecentLowBeforeCurrent(dailyCandles = [], lookbackDays = 5) {
  if (!Array.isArray(dailyCandles) || dailyCandles.length < 2) return null;
  const priorCandles = dailyCandles.slice(0, -1).slice(-Math.max(1, lookbackDays));
  const lows = priorCandles
    .map((candle) => Number(candle.low ?? candle.close))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!lows.length) return null;
  return Math.min(...lows);
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

function buildSellOrders({ input, nextState, orderPolicy, starPercent, starPrice, limit15Price, warnings, rejectReasons }) {
  const quantity = Math.floor(Number(input.availableSellQuantity || input.holdingQuantity || 0));
  if (quantity <= 0) return { orders: [], sellRejected: false };

  const cycleId = input.strategyState?.cycleId || `${input.symbol}-CYCLE`;
  const averagePrice = toNumber(input.averagePrice || input.currentPrice);
  if (orderPolicy.reverseExitSell || nextState === StrategyState.REVERSE || nextState === StrategyState.EXIT_WAIT) {
    return buildReverseSellOrders({ input, cycleId, quantity, averagePrice });
  }
  if (!orderPolicy.standardSell) return { orders: [], sellRejected: false };

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

function buildReverseSellOrders({ input, cycleId, quantity, averagePrice }) {
  const exitProfitPercent = Number(input.riskSettings?.reverseExitProfitPercent ?? 0);
  const quantityRatio = Math.min(1, Math.max(0, Number(input.riskSettings?.reverseExitQuantityRatio ?? 1)));
  const sellQuantity = Math.max(1, Math.floor(quantity * quantityRatio));
  const exitPrice = round(averagePrice * (1 + exitProfitPercent / 100), 2);

  return {
    orders: [{
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
      price: exitPrice,
      quantity: sellQuantity,
      status: 'PLANNED',
      reason: 'REVERSE_EXIT_LOC_SELL'
    }],
    sellRejected: false,
    exitWait: true
  };
}

function haltPlan({ input, generatedAt, state, starPercent, starPrice, warnings, reason }) {
  return {
    symbol: input.symbol,
    generatedAt,
    state,
    nextState: state === StrategyState.CLOSED ? StrategyState.CLOSED : StrategyState.MANUAL_HALT,
    starPercent,
    starPrice,
    buyOrders: [],
    sellOrders: [],
    cancelOrders: [],
    warnings,
    rejectReasons: [],
    buyRejected: false,
    bigBuySignal: false,
    skipSignal: false,
    reverseSignal: false,
    sellMaintainedOnBuyReject: false,
    riskLevel: 'HALT',
    expectedCashUsage: '0.00',
    noTouch: false,
    sellRejectCount: Number(input.strategyState?.sellRejectCount || 0),
    manualHaltReason: reason
  };
}

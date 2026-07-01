import {
  calculateBacktestMetrics,
  filterCandlesByDate,
  loadDailyCandlesFromCsv,
  printBacktestReport
} from '../../../../shared/historicalData.js';
import { calculateUnitAmount } from '../strategy/calculators.js';
import { createPlan } from '../strategy/strategyEngine.js';
import { StrategyState } from '../strategy/stateMachine.js';

export function runInfiniteBuyingBacktest(options) {
  const candles = filterCandlesByDate(loadDailyCandlesFromCsv(options.file), options);
  if (candles.length < 2) throw new Error('Backtest requires at least two candles.');

  const symbol = options.symbol || 'TQQQ';
  const initialCash = Number(options.cash || options.strategyCapital || 10000);
  const strategyCapital = Number(options.strategyCapital || initialCash);
  const unitAmount = calculateUnitAmount(strategyCapital, 40);

  let cash = initialCash;
  let quantity = 0;
  let averagePrice = 0;
  let realizedBuyAmountInCycle = 0;
  let currentRound = 0;
  let cycleIndex = 1;
  let stateName = StrategyState.READY;
  let sellRejectCount = 0;
  const trades = [];
  const equityCurve = [];
  const dailyPlans = [];
  const diagnostics = createDiagnostics({ candles: candles.length });

  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index];
    const previous = candles[index - 1];
    const previousPrevious = candles[index - 2] || previous;
    const cycleId = `${symbol}-BT-${String(cycleIndex).padStart(3, '0')}`;
    const context = {
      symbol,
      state: {
        symbol,
        state: stateName,
        cycleId,
        totalRound: 20,
        currentRound,
        sellRejectCount,
        unitAmount,
        strategyCapital: String(strategyCapital),
        realizedBuyAmountInCycle: realizedBuyAmountInCycle.toFixed(2),
        averagePrice: averagePrice.toFixed(2),
        confirmedAveragePriceAfterClose: averagePrice.toFixed(2),
        holdingQuantity: quantity
      },
      market: {
        currentPrice: String(previous.close),
        previousClose: String(previousPrevious.close),
        dailyCandles: candles.slice(Math.max(0, index - 221), index),
        enableTrendFilter: options.disableTrendFilter ? false : undefined
      },
      portfolio: {
        averagePrice: averagePrice > 0 ? String(averagePrice) : String(previous.close),
        holdingQuantity: quantity,
        availableSellQuantity: quantity,
        cash: String(cash),
        buyingPower: String(cash)
      },
      orders: {
        openOrders: [],
        filledOrders: []
      },
      marketCalendar: {
        isOpen: true,
        minutesUntilClose: 120
      },
      now: new Date(`${candle.date}T20:00:00Z`)
    };

    const plan = createPlan(context);
    sellRejectCount = Number(plan.sellRejectCount || 0);
    recordPlanDiagnostics(diagnostics, plan);
    dailyPlans.push({
      date: candle.date,
      state: plan.nextState,
      buyOrders: plan.buyOrders.length,
      sellOrders: plan.sellOrders.length,
      buyRejected: plan.buyRejected,
      sellMaintainedOnBuyReject: plan.sellMaintainedOnBuyReject,
      warnings: plan.warnings,
      rejectReasons: plan.rejectReasons
    });

    for (const order of plan.sellOrders) {
      diagnostics.plannedSellOrders += 1;
      if (quantity <= 0) break;
      const fill = shouldFillSell(order, candle);
      if (!fill) {
        diagnostics.unfilledSellOrders += 1;
        continue;
      }
      diagnostics.filledSellOrders += 1;
      const fillQuantity = Math.min(quantity, Number(order.quantity));
      const fillPrice = Number(order.price);
      const amount = fillQuantity * fillPrice;
      const realizedPnl = amount - fillQuantity * averagePrice;
      cash += amount;
      quantity -= fillQuantity;
      trades.push({
        date: candle.date,
        side: 'SELL',
        quantity: fillQuantity,
        price: roundMoney(fillPrice),
        amount: roundMoney(amount),
        realizedPnl: roundMoney(realizedPnl),
        reason: order.reason
      });

      if (quantity === 0) {
        averagePrice = 0;
        realizedBuyAmountInCycle = 0;
        currentRound = 0;
        sellRejectCount = 0;
        stateName = StrategyState.CLOSED;
        cycleIndex += 1;
      }
    }

    for (const order of plan.buyOrders) {
      diagnostics.plannedBuyOrders += 1;
      if (!shouldFillBuy(order, candle)) {
        diagnostics.unfilledBuyOrders += 1;
        continue;
      }
      const fillPrice = Number(candle.close);
      const requestedQuantity = Number(order.quantity);
      const affordableQuantity = Math.floor(cash / fillPrice);
      const fillQuantity = Math.min(requestedQuantity, affordableQuantity);
      if (fillQuantity <= 0) {
        diagnostics.unfilledBuyOrders += 1;
        continue;
      }
      diagnostics.filledBuyOrders += 1;

      const amount = fillQuantity * fillPrice;
      averagePrice = quantity > 0
        ? ((averagePrice * quantity) + amount) / (quantity + fillQuantity)
        : fillPrice;
      quantity += fillQuantity;
      cash -= amount;
      realizedBuyAmountInCycle += amount;
      currentRound = Number((realizedBuyAmountInCycle / Number(unitAmount)).toFixed(4));
      stateName = plan.nextState;

      trades.push({
        date: candle.date,
        side: 'BUY',
        quantity: fillQuantity,
        price: roundMoney(fillPrice),
        amount: roundMoney(amount),
        reason: order.reason
      });
    }

    if (quantity === 0 && stateName === StrategyState.CLOSED) {
      stateName = StrategyState.READY;
      sellRejectCount = 0;
    } else {
      stateName = plan.nextState;
    }

    equityCurve.push({
      date: candle.date,
      equity: cash + quantity * candle.close,
      deployed: quantity * candle.close
    });
  }

  const metrics = calculateBacktestMetrics({
    initialEquity: initialCash,
    allocatedCapital: strategyCapital,
    equityCurve,
    trades,
    candles
  });
  return {
    strategy: 'infinite_buying',
    symbol,
    from: options.from,
    to: options.to,
    options: {
      disableTrendFilter: Boolean(options.disableTrendFilter)
    },
    metrics,
    trades,
    equityCurve,
    dailyPlans,
    diagnostics,
    finalState: {
      cash: roundMoney(cash),
      quantity,
      averagePrice: roundMoney(averagePrice),
      currentRound,
      sellRejectCount,
      realizedBuyAmountInCycle: roundMoney(realizedBuyAmountInCycle),
      state: stateName
    }
  };
}

export function printInfiniteBuyingBacktest(result) {
  printBacktestReport(result);
  console.log(`[계획 수] ${result.dailyPlans.length}`);
  printDiagnostics(result);
}

function shouldFillBuy(order, candle) {
  return order.timeInForce === 'CLS' && Number(candle.close) <= Number(order.price);
}

function shouldFillSell(order, candle) {
  if (order.timeInForce === 'CLS') return Number(candle.close) >= Number(order.price);
  return Number(candle.high) >= Number(order.price);
}

function roundMoney(value) {
  return Number(Number(value).toFixed(2));
}

function createDiagnostics({ candles }) {
  return {
    candles,
    plannedBuyOrders: 0,
    plannedSellOrders: 0,
    filledBuyOrders: 0,
    filledSellOrders: 0,
    unfilledBuyOrders: 0,
    unfilledSellOrders: 0,
    daysWithWarnings: 0,
    stateCounts: {},
    warningCounts: {},
    rejectReasonCounts: {},
    buyRejectedDays: 0,
    sellMaintainedOnBuyRejectDays: 0
  };
}

function recordPlanDiagnostics(diagnostics, plan) {
  diagnostics.stateCounts[plan.nextState] = (diagnostics.stateCounts[plan.nextState] || 0) + 1;
  if (plan.buyRejected) diagnostics.buyRejectedDays += 1;
  if (plan.sellMaintainedOnBuyReject) diagnostics.sellMaintainedOnBuyRejectDays += 1;

  if (plan.warnings?.length) diagnostics.daysWithWarnings += 1;
  for (const warning of plan.warnings || []) {
    diagnostics.warningCounts[warning] = (diagnostics.warningCounts[warning] || 0) + 1;
  }
  for (const reason of plan.rejectReasons || []) {
    diagnostics.rejectReasonCounts[reason.code] = (diagnostics.rejectReasonCounts[reason.code] || 0) + 1;
  }
}

function printDiagnostics({ diagnostics, options }) {
  if (!diagnostics) return;

  console.log(`[캔들 수] ${diagnostics.candles}`);
  console.log(`[계획 주문] 매수=${diagnostics.plannedBuyOrders}, 매도=${diagnostics.plannedSellOrders}`);
  console.log(`[체결 주문] 매수=${diagnostics.filledBuyOrders}, 매도=${diagnostics.filledSellOrders}`);
  console.log(`[미체결 주문] 매수=${diagnostics.unfilledBuyOrders}, 매도=${diagnostics.unfilledSellOrders}`);
  console.log(`[경고 발생일] ${diagnostics.daysWithWarnings}`);
  console.log(`[매수거부 발생일] ${diagnostics.buyRejectedDays}`);
  console.log(`[매수거부 중 매도 유지일] ${diagnostics.sellMaintainedOnBuyRejectDays}`);

  const stateSummary = Object.entries(diagnostics.stateCounts)
    .map(([state, count]) => `${state}=${count}`)
    .join(', ');
  if (stateSummary) console.log(`[상태 집계] ${stateSummary}`);

  const warnings = Object.entries(diagnostics.warningCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (warnings.length) {
    console.log('[주요 경고]');
    for (const [warning, count] of warnings) console.log(`- ${count}회 ${translateMessage(warning)}`);
  }

  const rejectReasons = Object.entries(diagnostics.rejectReasonCounts)
    .sort((a, b) => b[1] - a[1]);
  if (rejectReasons.length) {
    console.log('[거부 사유]');
    for (const [reason, count] of rejectReasons) console.log(`- ${count}회 ${translateRejectReason(reason)}`);
  }

  const hasMa200Unavailable = Object.keys(diagnostics.warningCounts)
    .some((warning) => warning.includes('MA200 unavailable'));
  if (hasMa200Unavailable && !options?.disableTrendFilter) {
    console.log('[힌트] MA200 추세 필터는 최소 200개 이상의 이전 캔들이 필요합니다. 테스트 시작일보다 앞선 워밍업 데이터를 추가하거나, 짧은 기간 시뮬레이션에서는 --disableTrendFilter를 사용하세요.');
  } else if (diagnostics.plannedBuyOrders > 0 && diagnostics.filledBuyOrders === 0) {
    console.log('[힌트] 매수 주문 계획은 있었지만 체결되지 않았습니다. 무한매수는 LOC 매수를 사용하므로 종가가 계획 매수가 이하일 때만 체결로 봅니다.');
  } else if (diagnostics.plannedBuyOrders === 0 && diagnostics.filledBuyOrders === 0) {
    console.log('[힌트] 매수 주문 계획이 생성되지 않았습니다. 위의 경고와 상태 집계를 확인하세요.');
  }
}

function translateRejectReason(reason) {
  const labels = {
    STAR_SELL_BELOW_AVERAGE: '별표 매도가가 평균단가보다 낮아 매도거부',
    SELL_REJECT_LIMIT_EXCEEDED: '연속 매도거부 한도 초과',
    CASH_RESERVE_BELOW_MINIMUM: '현금 보존 비율 부족으로 매수거부',
    CRASH_FILTER: '급락 필터로 매수거부',
    MAX_LOSS_STOP: '최대 손실 중단 기준으로 매수거부',
    MAX_LOSS_MANUAL_HALT: '최대 손실 수동중단 기준으로 매수거부',
    MAX_LOSS_PAUSE: '최대 손실 일시정지 기준으로 매수거부',
    MA200_UNAVAILABLE_NEW_CYCLE: 'MA200 계산 불가로 신규 사이클 매수거부',
    TREND_FILTER_NEW_CYCLE: '추세 필터로 신규 사이클 매수거부',
    INSUFFICIENT_BUYING_POWER: '현금/매수가능금 부족으로 매수거부',
    INSUFFICIENT_BUY_QUANTITY: '1주 매수 가능 금액 부족으로 매수거부',
    AVERAGE_IMPROVEMENT_INSUFFICIENT: '평균단가 개선 효과 부족으로 매수거부'
  };
  return labels[reason] || reason;
}

function translateMessage(message) {
  const sellRejectMatch = message.match(/^SELL_REJECT: Star sell blocked because star price ([\d.]+) is below average price ([\d.]+)\.$/);
  if (sellRejectMatch) {
    return `SELL_REJECT: 별표 매도가 ${sellRejectMatch[1]}가 평균단가 ${sellRejectMatch[2]}보다 낮아 차단됨`;
  }
  const haltMatch = message.match(/^MANUAL_HALT: Sell reject count (\d+) exceeded limit (\d+)\. Manual review is required\.$/);
  if (haltMatch) {
    return `MANUAL_HALT: 연속 매도거부 ${haltMatch[1]}회로 한도 ${haltMatch[2]}회를 초과했습니다. 수동 확인이 필요합니다.`;
  }
  const assistMaintainedMatch = message.match(/^SELL_REJECT: 15% assist sell remains active for (\d+) shares at ([\d.]+)\.$/);
  if (assistMaintainedMatch) {
    return `SELL_REJECT: 15% 보조 매도 ${assistMaintainedMatch[1]}주를 ${assistMaintainedMatch[2]} 가격으로 유지합니다.`;
  }
  const assistSkippedMatch = message.match(/^SELL_REJECT: 15% assist sell skipped because assist price ([\d.]+) is not above average price ([\d.]+)\.$/);
  if (assistSkippedMatch) {
    return `SELL_REJECT: 15% 보조 매도가 ${assistSkippedMatch[1]}가 평균단가 ${assistSkippedMatch[2]}보다 높지 않아 생략됨`;
  }
  const averageImprovementMatch = message.match(/^BUY_REJECT: Buy blocked because average price improvement (-?[\d.]+)% is not above minimum (-?[\d.]+)%\.$/);
  if (averageImprovementMatch) {
    return `BUY_REJECT: 평균단가 개선 효과 ${averageImprovementMatch[1]}%가 최소 기준 ${averageImprovementMatch[2]}%보다 높지 않아 매수 차단`;
  }
  if (message.startsWith('BUY_REJECT: No usable buying power')) {
    return 'BUY_REJECT: 현금 보존 기준과 주문 예산을 적용한 뒤 사용할 매수가능금이 없습니다.';
  }
  if (message.startsWith('BUY_REJECT: Buy blocked because usable budget cannot buy at least one share.')) {
    return 'BUY_REJECT: 사용 가능한 예산으로 1주도 매수할 수 없어 차단됨';
  }
  const dropMatch = message.match(/^Current price is (-?[\d.]+)% below previous close\.$/);
  if (dropMatch) {
    return `현재가가 전일 종가 대비 ${dropMatch[1]}% 하락했습니다.`;
  }
  if (message.includes('MA200 unavailable')) {
    return 'MA200 계산 불가: 기존 보유가 없으면 신규 사이클 매수를 차단합니다.';
  }
  return message;
}

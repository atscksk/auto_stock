import { config } from './config.js';
import { ma20Strategy } from './strategy.js';
import { buildQuantityOrder } from '../../../shared/orderBuilder.js';
import { notifySafely } from '../../../shared/notificationService.js';
import { decideOrderCandidate } from '../../../shared/risk.js';
import { buildPortfolioSnapshot, getFirstAccountSeq, logger, tossClient } from './runtime.js';
import { nextWeekdayKstCompact, todayKstCompact } from './dates.js';
import { readJsonLines } from './jsonl.js';

export async function runSignalJob() {
  logger.ensureLogFiles();

  const accountSeq = await getFirstAccountSeq();
  const candles = await tossClient.getDailyCandles(config.symbol, 40);
  if (candles.length < config.minCandles) {
    throw new Error(`Not enough candles. required=${config.minCandles}, actual=${candles.length}`);
  }

  const signal = ma20Strategy(candles, {
    maWindow: config.maWindow,
    buyThreshold: config.buyThreshold,
    sellThreshold: config.sellThreshold
  });

  const holdings = await tossClient.getHoldings(accountSeq, config.symbol);
  const holding = (holdings?.items || []).find((item) => item.symbol === config.symbol);
  const holdingQuantity = Number(holding?.quantity || 0);
  const hasPosition = Number.isFinite(holdingQuantity) && holdingQuantity > 0;

  logger.logPortfolio(buildPortfolioSnapshot({
    mode: config.mode,
    symbol: config.symbol,
    accountSeq,
    holdings,
    holding,
    hasPosition,
    holdingQuantity
  }));

  logger.logSignal({
    mode: config.mode,
    symbol: config.symbol,
    accountSeq,
    hasPosition,
    holdingQuantity,
    dryRunBuyingPowerKrw: config.mode === 'DRY_RUN' ? config.dryRunBuyingPowerKrw : null,
    ...signal
  });

  const price = signal.close;
  const buyQuantity = Number.isFinite(price) && price > 0 ? Math.floor(config.orderBudgetKrw / price) : 0;
  const targetQuantity = signal.signal === 'SELL' ? Math.floor(holdingQuantity) : buyQuantity;

  const candidate = decideOrderCandidate({
    signal: signal.signal,
    hasPosition,
    quantity: targetQuantity,
    mode: 'DRY_RUN',
    liveConfirm: 'NO',
    buyingPower: config.mode === 'DRY_RUN' ? config.dryRunBuyingPowerKrw : null,
    orderBudget: config.orderBudgetKrw,
    price
  });

  if (!candidate.shouldOrder) {
    console.log(`No order plan: ${candidate.reason}`);
    await notifySafely({
      type: 'SIGNAL_NO_ORDER',
      title: 'MA20 signal produced no order plan',
      severity: 'INFO',
      strategy: 'ma20',
      symbol: config.symbol,
      message: candidate.reason,
      details: { signal: signal.signal, close: signal.close, reason: signal.reason }
    });
    return;
  }

  const order = buildQuantityOrder({
    strategyId: 'ma20',
    symbol: config.symbol,
    side: candidate.side,
    quantity: targetQuantity,
    price,
    orderType: config.orderType
  });

  if (hasExistingPlan(order.clientOrderId)) {
    console.log(`No order plan: duplicate clientOrderId ${order.clientOrderId}`);
    await notifySafely({
      type: 'SIGNAL_DUPLICATE_PLAN',
      title: 'MA20 duplicate order plan skipped',
      severity: 'WARN',
      strategy: 'ma20',
      symbol: config.symbol,
      message: `Duplicate clientOrderId ${order.clientOrderId}`
    });
    return;
  }

  const plan = {
    status: 'PLANNED',
    strategyId: 'ma20',
    planDate: todayKstCompact(),
    executeAfterDate: nextWeekdayKstCompact(),
    modeAtPlan: config.mode,
    symbol: config.symbol,
    side: candidate.side,
    quantity: order.quantity,
    price: order.price,
    orderType: order.orderType,
    clientOrderId: order.clientOrderId,
    reason: signal.reason
  };

  logger.logOrderPlan(plan);
  console.log(`Order plan saved: ${order.clientOrderId}`);
  await notifySafely({
    type: 'ORDER_PLAN_SAVED',
    title: 'MA20 order plan saved',
    severity: 'INFO',
    strategy: 'ma20',
    symbol: config.symbol,
    message: `${candidate.side} ${order.quantity} ${config.symbol}`,
    details: {
      clientOrderId: order.clientOrderId,
      price: order.price,
      reason: signal.reason
    }
  });
}

function hasExistingPlan(clientOrderId) {
  return readJsonLines(logger.logFiles.orderPlans).some((plan) => plan.clientOrderId === clientOrderId);
}

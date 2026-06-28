import fs from 'node:fs';
import { config } from './config.js';
import { notifySafely } from '../../../shared/notificationService.js';
import { assertLiveOrderAllowed, decideOrderCandidate } from '../../../shared/risk.js';
import { getFirstAccountSeq, logger, paperBroker, tossClient } from './runtime.js';
import { todayKstCompact } from './dates.js';
import { readJsonLines } from './jsonl.js';

export async function runOrderJob() {
  logger.ensureLogFiles();

  const plan = findDuePlan();
  if (!plan) {
    console.log('No due order plan.');
    await notifySafely({
      type: 'ORDER_NO_DUE_PLAN',
      title: 'MA20 no due order plan',
      severity: 'INFO',
      strategy: 'ma20',
      symbol: config.symbol,
      message: 'No due order plan.'
    });
    return;
  }

  if (hasDuplicateClientOrderId(plan.clientOrderId)) {
    console.log(`No order: duplicate clientOrderId ${plan.clientOrderId}`);
    await notifySafely({
      type: 'ORDER_DUPLICATE_SKIPPED',
      title: 'MA20 duplicate order skipped',
      severity: 'WARN',
      strategy: 'ma20',
      symbol: plan.symbol,
      message: `Duplicate clientOrderId ${plan.clientOrderId}`
    });
    return;
  }

  const accountSeq = await getFirstAccountSeq();
  const holdings = await tossClient.getHoldings(accountSeq, plan.symbol);
  const holding = (holdings?.items || []).find((item) => item.symbol === plan.symbol);
  const holdingQuantity = Number(holding?.quantity || 0);
  const hasPosition = Number.isFinite(holdingQuantity) && holdingQuantity > 0;

  let quantity = Number(plan.quantity);
  let buyingPower = null;
  if (plan.side === 'BUY') {
    buyingPower = await tossClient.getBuyingPower(accountSeq);
    if (config.mode === 'DRY_RUN' && config.dryRunBuyingPowerKrw != null) {
      buyingPower = config.dryRunBuyingPowerKrw;
    }
  }
  if (plan.side === 'SELL') {
    const sellableQuantity = await tossClient.getSellableQuantity(accountSeq, plan.symbol);
    if (Number.isFinite(sellableQuantity)) {
      quantity = Math.min(quantity, Math.floor(sellableQuantity));
    }
  }

  const candidate = decideOrderCandidate({
    signal: plan.side,
    hasPosition,
    quantity,
    mode: config.mode,
    liveConfirm: config.liveConfirm,
    buyingPower,
    orderBudget: config.orderBudgetKrw,
    price: Number(plan.price)
  });

  if (!candidate.shouldOrder) {
    console.log(`No order: ${candidate.reason}`);
    await notifySafely({
      type: 'ORDER_BLOCKED',
      title: 'MA20 order blocked by risk guard',
      severity: 'WARN',
      strategy: 'ma20',
      symbol: plan.symbol,
      message: candidate.reason
    });
    return;
  }

  const order = {
    clientOrderId: plan.clientOrderId,
    symbol: plan.symbol,
    side: plan.side,
    orderType: plan.orderType,
    quantity: String(quantity),
    ...(plan.orderType === 'LIMIT' ? { price: String(plan.price) } : {})
  };

  if (config.mode === 'DRY_RUN') {
    paperBroker.savePaperOrder({
      mode: config.mode,
      symbol: plan.symbol,
      side: plan.side,
      quantity,
      price: plan.price,
      clientOrderId: plan.clientOrderId,
      reason: `Executed planned order from ${plan.planDate}: ${plan.reason}`
    });
    console.log(`DRY_RUN planned paper order saved: ${plan.clientOrderId}`);
    await notifySafely({
      type: 'PAPER_ORDER_SAVED',
      title: 'MA20 paper order saved',
      severity: 'INFO',
      strategy: 'ma20',
      symbol: plan.symbol,
      message: `${plan.side} ${quantity} ${plan.symbol}`,
      details: {
        clientOrderId: plan.clientOrderId,
        price: plan.price
      }
    });
    return;
  }

  assertLiveOrderAllowed({ mode: config.mode, liveConfirm: config.liveConfirm, candidate });
  const result = await tossClient.createOrder(accountSeq, order, {
    mode: config.mode,
    liveConfirm: config.liveConfirm,
    riskPassed: true
  });
  logger.logOrder({
    mode: config.mode,
    symbol: plan.symbol,
    side: plan.side,
    quantity: order.quantity,
    price: order.price,
    clientOrderId: order.clientOrderId,
    planDate: plan.planDate,
    result
  });
  console.log(`LIVE planned order completed: ${plan.clientOrderId}`);
  await notifySafely({
    type: 'LIVE_ORDER_COMPLETED',
    title: 'MA20 live order completed',
    severity: 'INFO',
    strategy: 'ma20',
    symbol: plan.symbol,
    message: `${plan.side} ${quantity} ${plan.symbol}`,
    details: {
      clientOrderId: plan.clientOrderId,
      price: plan.price
    }
  });
}

function findDuePlan() {
  const today = todayKstCompact();
  return readJsonLines(logger.logFiles.orderPlans)
    .filter((plan) => plan.status === 'PLANNED')
    .filter((plan) => plan.symbol === config.symbol)
    .filter((plan) => String(plan.executeAfterDate) <= today)
    .find((plan) => !hasDuplicateClientOrderId(plan.clientOrderId));
}

function hasDuplicateClientOrderId(clientOrderId) {
  if (!fs.existsSync(logger.logFiles.orders)) return false;
  return readJsonLines(logger.logFiles.orders).some((order) => order.clientOrderId === clientOrderId);
}

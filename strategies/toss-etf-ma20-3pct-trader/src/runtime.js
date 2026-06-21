import path from 'node:path';
import { config, projectRoot } from './config.js';
import { createJsonlLogger } from '../../../shared/logger.js';
import { createPaperBroker } from '../../../shared/paperBroker.js';
import { createTossClient } from '../../../shared/tossClient.js';

export const logger = createJsonlLogger({ logDir: path.join(projectRoot, 'logs') });
export const tossClient = createTossClient({
  clientId: config.tossClientId,
  clientSecret: config.tossClientSecret
});
export const paperBroker = createPaperBroker({ logOrder: logger.logOrder });

export async function getFirstAccountSeq() {
  await tossClient.getAccessToken();
  const accounts = await tossClient.getAccounts();
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error('No available account was returned.');
  }

  const accountSeq = accounts[0]?.accountSeq;
  if (accountSeq == null) throw new Error('The first account is missing accountSeq.');
  return accountSeq;
}

export function buildPortfolioSnapshot({ mode, symbol, accountSeq, holdings, holding, hasPosition, holdingQuantity }) {
  return {
    mode,
    symbol,
    accountSeq,
    hasPosition,
    quantity: String(holding?.quantity ?? holdingQuantity ?? 0),
    lastPrice: holding?.lastPrice ?? null,
    averagePurchasePrice: holding?.averagePurchasePrice ?? null,
    marketValue: holding?.marketValue?.amount ?? null,
    purchaseAmount: holding?.marketValue?.purchaseAmount ?? null,
    profitLossAmount: holding?.profitLoss?.amount ?? null,
    profitLossRate: holding?.profitLoss?.rate ?? null,
    dailyProfitLossAmount: holding?.dailyProfitLoss?.amount ?? null,
    dailyProfitLossRate: holding?.dailyProfitLoss?.rate ?? null,
    totalPurchaseAmountKrw: holdings?.totalPurchaseAmount?.krw ?? null,
    totalMarketValueKrw: holdings?.marketValue?.amount?.krw ?? null,
    totalProfitLossAmountKrw: holdings?.profitLoss?.amount?.krw ?? null,
    totalProfitLossRate: holdings?.profitLoss?.rate ?? null
  };
}

export function runJob(fn, stage) {
  fn().catch((error) => {
    console.error(`Error: ${error.message}`);
    logger.logError(error, { stage });
    process.exit(1);
  });
}

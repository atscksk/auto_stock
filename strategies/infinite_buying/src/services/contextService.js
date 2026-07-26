import { loadState } from '../storage/stateStore.js';

export function buildRuntimeContext(symbol, args = {}) {
  const state = loadState(symbol);
  const currentPrice = firstPositiveText(args.currentPrice, process.env.IB_CURRENT_PRICE);
  const previousClose = firstPositiveText(args.previousClose, process.env.IB_PREVIOUS_CLOSE, currentPrice);
  const holdingQuantity = Number(args.holdingQuantity ?? process.env.IB_HOLDING_QUANTITY ?? state.holdingQuantity ?? 0);
  const averagePrice = firstPositiveText(args.averagePrice, process.env.IB_AVERAGE_PRICE, state.averagePrice, currentPrice);
  const cash = args.cash || process.env.IB_CASH || state.strategyCapital || '10000.00';

  return {
    symbol,
    state: {
      ...state,
      currentRound: args.currentRound ?? process.env.IB_CURRENT_ROUND ?? state.currentRound,
      realizedBuyAmountInCycle: args.realizedBuyAmount ?? process.env.IB_REALIZED_BUY_AMOUNT ?? state.realizedBuyAmountInCycle,
      averagePrice,
      holdingQuantity
    },
    market: {
      currentPrice,
      previousClose,
      dailyCandles: loadCandlesFromEnv(currentPrice, previousClose)
    },
    portfolio: {
      averagePrice,
      holdingQuantity,
      availableSellQuantity: Number(args.availableSellQuantity ?? process.env.IB_AVAILABLE_SELL_QUANTITY ?? holdingQuantity),
      cash,
      buyingPower: args.buyingPower || process.env.IB_BUYING_POWER || cash
    },
    orders: {
      openOrders: [],
      filledOrders: []
    },
    marketCalendar: {
      isOpen: parseBool(args.marketOpen ?? process.env.IB_MARKET_OPEN, true),
      minutesUntilClose: args.minutesUntilClose ?? process.env.IB_MINUTES_UNTIL_CLOSE
    },
    now: args.date ? new Date(args.date) : new Date()
  };
}

export async function buildRuntimeContextWithMarketData(symbol, args = {}, { tossClient, accountSeq, trendSymbol } = {}) {
  const context = buildRuntimeContext(symbol, args);
  if (hasPositivePrice(context.market.currentPrice)) return context;
  if (!tossClient) throw new Error('Current price is required. Provide --currentPrice/IB_CURRENT_PRICE or configure Toss API credentials.');

  const dailyCandles = await tossClient.getDailyCandles(symbol, 220);
  const sorted = sortCandles(dailyCandles);
  const latest = sorted.at(-1);
  const previous = sorted.at(-2);
  const currentPrice = firstPositiveText(closeOf(latest));
  const previousClose = firstPositiveText(args.previousClose, process.env.IB_PREVIOUS_CLOSE, closeOf(previous), currentPrice);
  if (!hasPositivePrice(currentPrice)) {
    throw new Error(`Current price is unavailable for ${symbol}. Order planning is blocked.`);
  }

  context.market.currentPrice = currentPrice;
  context.market.previousClose = previousClose;
  context.market.dailyCandles = sorted;
  context.portfolio.averagePrice = firstPositiveText(context.portfolio.averagePrice, currentPrice);
  context.state.averagePrice = firstPositiveText(context.state.averagePrice, context.portfolio.averagePrice);

  const referenceSymbol = trendSymbol || context.market.trendSymbol;
  if (referenceSymbol) {
    try {
      context.market.trendSymbol = referenceSymbol;
      context.market.trendCandles = sortCandles(await tossClient.getDailyCandles(referenceSymbol, 220));
    } catch (error) {
      context.market.trendCandles = [];
    }
  }

  if (accountSeq) {
    await hydratePortfolioFromAccount({ context, tossClient, accountSeq, symbol });
  }

  return context;
}

function loadCandlesFromEnv(currentPrice, previousClose) {
  if (!process.env.IB_USE_SYNTHETIC_CANDLES) return [];
  const candles = [];
  for (let index = 210; index > 0; index -= 1) {
    const close = Number(previousClose) * (1 + (210 - index) * 0.0005);
    candles.push({
      date: new Date(Date.now() - index * 86400000).toISOString(),
      open: close * 0.995,
      close
    });
  }
  candles.push({ date: new Date().toISOString(), open: Number(previousClose), close: Number(currentPrice) });
  return candles;
}

function parseBool(value, fallback) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'y'].includes(String(value).toLowerCase());
}

export function firstPositiveText(...values) {
  const value = values.find((item) => Number(item) > 0);
  return value == null ? undefined : String(value);
}

export function hasPositivePrice(value) {
  return Number(value) > 0;
}

async function hydratePortfolioFromAccount({ context, tossClient, accountSeq, symbol }) {
  const holdings = await tossClient.getHoldings(accountSeq, symbol);
  const holding = (holdings?.items || []).find((item) => String(item.symbol).toUpperCase() === String(symbol).toUpperCase());
  const quantity = Number(holding?.quantity || 0);
  if (Number.isFinite(quantity)) {
    context.portfolio.holdingQuantity = quantity;
    context.portfolio.availableSellQuantity = quantity;
    context.state.holdingQuantity = quantity;
  }

  const averagePrice = firstPositiveText(
    holding?.averagePurchasePrice,
    holding?.averagePrice,
    context.portfolio.averagePrice
  );
  if (averagePrice) {
    context.portfolio.averagePrice = averagePrice;
    context.state.averagePrice = averagePrice;
  }
}

function sortCandles(candles = []) {
  return [...candles].sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp));
}

function closeOf(candle) {
  return candle?.close ?? candle?.closePrice;
}

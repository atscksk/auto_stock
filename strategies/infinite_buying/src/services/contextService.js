import { loadState } from '../storage/stateStore.js';

export function buildRuntimeContext(symbol, args = {}) {
  const state = loadState(symbol);
  const currentPrice = args.currentPrice || process.env.IB_CURRENT_PRICE || state.averagePrice || '50.00';
  const previousClose = args.previousClose || process.env.IB_PREVIOUS_CLOSE || currentPrice;
  const holdingQuantity = Number(args.holdingQuantity ?? process.env.IB_HOLDING_QUANTITY ?? state.holdingQuantity ?? 0);
  const averagePrice = args.averagePrice || process.env.IB_AVERAGE_PRICE || state.averagePrice || currentPrice;
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

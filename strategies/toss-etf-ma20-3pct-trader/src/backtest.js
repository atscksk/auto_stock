import { ma20Strategy } from './strategy.js';
import {
  calculateBacktestMetrics,
  filterCandlesByDate,
  loadDailyCandlesFromCsv,
  printBacktestReport
} from '../../../shared/historicalData.js';

export function runMa20Backtest(options) {
  const candles = filterCandlesByDate(loadDailyCandlesFromCsv(options.file), options);
  const maWindow = Number(options.maWindow || 20);
  const buyThreshold = Number(options.buyThreshold || 1.03);
  const sellThreshold = Number(options.sellThreshold || 0.97);
  const orderBudget = Number(options.orderBudget || 300000);
  const initialCash = Number(options.cash || 10000000);
  const symbol = options.symbol || 'UNKNOWN';

  let cash = initialCash;
  let quantity = 0;
  let averagePrice = 0;
  const trades = [];
  const equityCurve = [];

  for (let index = 0; index < candles.length; index += 1) {
    const history = candles.slice(0, index + 1);
    const candle = candles[index];
    const signal = ma20Strategy(history, { maWindow, buyThreshold, sellThreshold });
    const close = Number(candle.close);

    if (signal.signal === 'BUY' && quantity === 0) {
      const buyQuantity = Math.floor(Math.min(orderBudget, cash) / close);
      if (buyQuantity > 0) {
        const amount = buyQuantity * close;
        cash -= amount;
        quantity += buyQuantity;
        averagePrice = close;
        trades.push({
          date: candle.date,
          side: 'BUY',
          quantity: buyQuantity,
          price: roundMoney(close),
          amount: roundMoney(amount),
          reason: signal.reason
        });
      }
    }

    if (signal.signal === 'SELL' && quantity > 0) {
      const amount = quantity * close;
      const cost = quantity * averagePrice;
      const realizedPnl = amount - cost;
      cash += amount;
      trades.push({
        date: candle.date,
        side: 'SELL',
        quantity,
        price: roundMoney(close),
        amount: roundMoney(amount),
        realizedPnl: roundMoney(realizedPnl),
        reason: signal.reason
      });
      quantity = 0;
      averagePrice = 0;
    }

    equityCurve.push({
      date: candle.date,
      equity: cash + quantity * close,
      deployed: quantity * close
    });
  }

  const metrics = calculateBacktestMetrics({
    initialEquity: initialCash,
    allocatedCapital: orderBudget,
    equityCurve,
    trades,
    candles
  });
  return {
    strategy: 'ma20',
    symbol,
    from: options.from,
    to: options.to,
    metrics,
    trades,
    equityCurve,
    finalState: {
      cash: roundMoney(cash),
      quantity,
      averagePrice: roundMoney(averagePrice)
    }
  };
}

export function printMa20Backtest(result) {
  printBacktestReport(result);
}

function roundMoney(value) {
  return Number(Number(value).toFixed(2));
}

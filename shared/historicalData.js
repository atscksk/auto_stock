import fs from 'node:fs';

export function loadDailyCandlesFromCsv(filePath) {
  if (!filePath) throw new Error('--file is required.');
  const text = fs.readFileSync(filePath, 'utf8');
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error(`No rows found in ${filePath}.`);

  return rows
    .map(normalizeCandle)
    .filter(Boolean)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function filterCandlesByDate(candles, { from, to } = {}) {
  return candles.filter((candle) => {
    if (from && candle.date < from) return false;
    if (to && candle.date > to) return false;
    return true;
  });
}

export function calculateBacktestMetrics({
  initialEquity,
  allocatedCapital,
  equityCurve,
  trades,
  candles
}) {
  const finalEquity = equityCurve.at(-1)?.equity ?? initialEquity;
  const profit = finalEquity - initialEquity;
  let peak = initialEquity;
  let maxDrawdownPercent = 0;

  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity);
    if (peak > 0) {
      const drawdown = ((point.equity - peak) / peak) * 100;
      maxDrawdownPercent = Math.min(maxDrawdownPercent, drawdown);
    }
  }

  const closedSellTrades = trades.filter((trade) => trade.side === 'SELL');
  const winningSells = closedSellTrades.filter((trade) => Number(trade.realizedPnl || 0) > 0);
  const deployedValues = equityCurve
    .map((point) => Number(point.deployed || 0))
    .filter((value) => Number.isFinite(value));
  const maxDeployed = deployedValues.length ? Math.max(...deployedValues) : 0;
  const avgDeployed = deployedValues.length
    ? deployedValues.reduce((sum, value) => sum + value, 0) / deployedValues.length
    : 0;
  const buyAndHoldReturnPercent = calculateBuyAndHoldReturnPercent(candles);

  return {
    initialEquity: roundMoney(initialEquity),
    finalEquity: roundMoney(finalEquity),
    profit: roundMoney(profit),
    totalReturnPercent: roundPercent((profit / initialEquity) * 100),
    allocatedCapital: allocatedCapital ? roundMoney(allocatedCapital) : null,
    allocatedReturnPercent: allocatedCapital ? roundPercent((profit / allocatedCapital) * 100) : null,
    maxDeployed: roundMoney(maxDeployed),
    avgDeployed: roundMoney(avgDeployed),
    buyAndHoldReturnPercent,
    maxDrawdownPercent: roundPercent(maxDrawdownPercent),
    tradeCount: trades.length,
    buyCount: trades.filter((trade) => trade.side === 'BUY').length,
    sellCount: closedSellTrades.length,
    winRatePercent: closedSellTrades.length > 0
      ? roundPercent((winningSells.length / closedSellTrades.length) * 100)
      : 0
  };
}

export function printBacktestReport({ strategy, symbol, from, to, metrics, finalState, trades }) {
  console.log(`[전략] ${strategy}`);
  console.log(`[종목] ${symbol}`);
  if (from || to) console.log(`[기간] ${from || 'START'} ~ ${to || 'END'}`);
  console.log(`[초기 자산] ${metrics.initialEquity}`);
  console.log(`[최종 자산] ${metrics.finalEquity}`);
  console.log(`[전체 수익률] ${metrics.totalReturnPercent}%`);
  if (metrics.allocatedCapital != null) {
    console.log(`[전략 배정금] ${metrics.allocatedCapital}`);
    console.log(`[배정금 대비 수익률] ${metrics.allocatedReturnPercent}%`);
  }
  console.log(`[최대 투입 평가액] ${metrics.maxDeployed}`);
  console.log(`[평균 투입 평가액] ${metrics.avgDeployed}`);
  if (metrics.buyAndHoldReturnPercent != null) {
    console.log(`[단순보유 수익률] ${metrics.buyAndHoldReturnPercent}%`);
    console.log(`[단순보유 대비 초과수익] ${roundPercent(metrics.totalReturnPercent - metrics.buyAndHoldReturnPercent)}%`);
  }
  console.log(`[최대 낙폭] ${metrics.maxDrawdownPercent}%`);
  console.log(`[거래 수] 전체=${metrics.tradeCount}, 매수=${metrics.buyCount}, 매도=${metrics.sellCount}`);
  console.log(`[승률] ${metrics.winRatePercent}%`);
  if (finalState) console.log(`[최종 상태] ${JSON.stringify(finalState)}`);
  if (trades.length) {
    console.log('[최근 거래]');
    for (const trade of trades.slice(-5)) {
      console.log(`- ${trade.date} ${translateSide(trade.side)} ${trade.quantity} @ ${trade.price} ${translateReason(trade.reason)}`.trim());
    }
  }
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('#'));
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => normalizeKey(header));
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function splitCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function normalizeCandle(row) {
  const date = normalizeDate(row.date || row.timestamp || row.time);
  const open = toFiniteNumber(row.open || row.openprice);
  const high = toFiniteNumber(row.high || row.highprice);
  const low = toFiniteNumber(row.low || row.lowprice);
  const close = toFiniteNumber(row.close || row.closeprice || row.adjclose || row.adj_close);
  const volume = toFiniteNumber(row.volume);

  if (!date || [open, high, low, close].some((value) => value == null)) return null;
  return {
    date,
    timestamp: date,
    open,
    high,
    low,
    close,
    closePrice: close,
    openPrice: open,
    highPrice: high,
    lowPrice: low,
    volume
  };
}

function normalizeDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeKey(key) {
  return String(key).trim().toLowerCase().replace(/[\s_]/g, '');
}

function toFiniteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
}

function calculateBuyAndHoldReturnPercent(candles) {
  if (!Array.isArray(candles) || candles.length < 2) return null;
  const firstClose = Number(candles[0].close);
  const lastClose = Number(candles.at(-1).close);
  if (!Number.isFinite(firstClose) || firstClose <= 0 || !Number.isFinite(lastClose)) return null;
  return roundPercent(((lastClose - firstClose) / firstClose) * 100);
}

function roundMoney(value) {
  return Number(Number(value).toFixed(2));
}

function roundPercent(value) {
  return Number(Number(value).toFixed(2));
}

function translateSide(side) {
  if (side === 'BUY') return '매수';
  if (side === 'SELL') return '매도';
  return side;
}

function translateReason(reason) {
  const labels = {
    NORMAL_MODE_LOC_BUY: '일반 모드 LOC 매수',
    BIG_BUY_LOC_BUY: '큰수매수 LOC 매수',
    STAR_PERCENT_LOC_SELL: '별표% LOC 매도',
    REVERSE_EXIT_LOC_SELL: '리버스모드 LOC 매도',
    LIMIT_15_DAY_SELL: '15% DAY 보조 매도',
    'close >= MA20 * BUY_THRESHOLD': '종가가 MA20 매수 기준 이상',
    'close <= MA20 * SELL_THRESHOLD': '종가가 MA20 매도 기준 이하'
  };
  return labels[reason] || reason || '';
}

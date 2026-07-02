import fs from 'node:fs';
import path from 'node:path';
import { runInfiniteBuyingBacktest } from './backtestEngine.js';

const DEFAULT_SYMBOLS = ['TQQQ', 'SOXL'];
const DEFAULT_PERIODS = ['2025-H1', '2025-H2', '2026-H1'];

export function runInfiniteBuyingComparison(options = {}) {
  const symbols = parseList(options.symbols, DEFAULT_SYMBOLS);
  const periods = parseList(options.periods, DEFAULT_PERIODS);
  const dataDir = options.dataDir || 'data';
  const rows = [];

  for (const symbol of symbols) {
    for (const period of periods) {
      const file = path.join(dataDir, `${symbol}-${period}.csv`);
      if (!fs.existsSync(file)) {
        rows.push({
          symbol,
          period,
          file,
          status: 'MISSING'
        });
        continue;
      }

      const result = runInfiniteBuyingBacktest({
        ...options,
        file,
        symbol,
        cash: options.cash || 10000,
        strategyCapital: options.strategyCapital || options.cash || 10000
      });
      rows.push(toComparisonRow({ symbol, period, file, result }));
    }
  }

  return rows;
}

export function formatInfiniteBuyingComparisonTable(rows) {
  const headers = [
    '종목',
    '기간',
    '상태',
    '전략 수익률',
    '배정금 수익률',
    '단순보유 수익률',
    '초과수익',
    '최대낙폭',
    '거래수',
    '매수거부',
    '매도거부',
    '수수료',
    '세금'
  ];
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`
  ];

  for (const row of rows) {
    lines.push(`| ${[
      row.symbol,
      row.period,
      row.status,
      percentCell(row.totalReturnPercent),
      percentCell(row.allocatedReturnPercent),
      percentCell(row.buyAndHoldReturnPercent),
      percentCell(row.excessReturnPercent),
      percentCell(row.maxDrawdownPercent),
      valueCell(row.tradeCount),
      valueCell(row.buyRejectReasonCount),
      valueCell(row.sellRejectReasonCount),
      valueCell(row.totalFees),
      valueCell(row.totalTaxes)
    ].join(' | ')} |`);
  }

  return `${lines.join('\n')}\n`;
}

function toComparisonRow({ symbol, period, file, result }) {
  const { metrics, diagnostics } = result;
  return {
    symbol,
    period,
    file,
    status: 'OK',
    totalReturnPercent: metrics.totalReturnPercent,
    allocatedReturnPercent: metrics.allocatedReturnPercent,
    buyAndHoldReturnPercent: metrics.buyAndHoldReturnPercent,
    excessReturnPercent: roundPercent(metrics.totalReturnPercent - metrics.buyAndHoldReturnPercent),
    maxDrawdownPercent: metrics.maxDrawdownPercent,
    tradeCount: metrics.tradeCount,
    buyRejectReasonCount: diagnostics.buyRejectReasonCount,
    sellRejectReasonCount: diagnostics.sellRejectReasonCount,
    totalFees: roundMoney(diagnostics.totalFees),
    totalTaxes: roundMoney(diagnostics.totalTaxes)
  };
}

function parseList(value, fallback) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function percentCell(value) {
  return value == null || Number.isNaN(Number(value)) ? '-' : `${value}%`;
}

function valueCell(value) {
  return value == null ? '-' : String(value);
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function roundPercent(value) {
  return Number(Number(value || 0).toFixed(2));
}

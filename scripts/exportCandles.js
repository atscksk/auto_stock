import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { createTossClient } from '../shared/tossClient.js';

dotenv.config();

const args = parseArgs();
const symbol = requiredArg('symbol');
const from = args.from || '2026-01-01';
const to = args.to || '2026-06-30';
const interval = args.interval || '1d';
const adjusted = args.adjusted !== 'false';
const out = args.out || `data/${symbol}-${from}-${to}-${interval}.csv`;

const client = createTossClient({
  clientId: process.env.TOSS_CLIENT_ID,
  clientSecret: process.env.TOSS_CLIENT_SECRET,
  baseUrl: process.env.TOSS_API_BASE_URL || 'https://openapi.tossinvest.com'
});

const candles = await collectCandles({ client, symbol, from, to, interval, adjusted });
writeCandlesCsv(out, candles);

console.log(`[symbol] ${symbol}`);
console.log(`[interval] ${interval}`);
console.log(`[period] ${from} ~ ${to}`);
console.log(`[adjusted] ${adjusted}`);
console.log(`[candles] ${candles.length}`);
console.log(`[out] ${out}`);

async function collectCandles({ client, symbol, from, to, interval, adjusted }) {
  const collected = [];
  let before = toExclusiveIso(to);
  let page = 0;

  while (true) {
    page += 1;
    const result = await client.getCandles({
      symbol,
      interval,
      count: 200,
      before,
      adjusted
    });

    if (result.candles.length === 0) break;
    collected.push(...result.candles);

    const oldestDate = toDateOnly(result.candles.at(-1)?.timestamp);
    if (!result.nextBefore || oldestDate < from) break;
    before = result.nextBefore;

    if (page > 100) throw new Error('Too many candle pages. Aborting pagination.');
  }

  return dedupeCandles(collected)
    .filter((candle) => {
      const date = toDateOnly(candle.timestamp);
      return date >= from && date <= to;
    })
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function writeCandlesCsv(filePath, candles) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  const lines = [
    'Date,Open,High,Low,Close,Volume,Currency',
    ...candles.map((candle) => [
      toDateOnly(candle.timestamp),
      candle.openPrice,
      candle.highPrice,
      candle.lowPrice,
      candle.closePrice,
      candle.volume,
      candle.currency
    ].map(csvValue).join(','))
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function dedupeCandles(candles) {
  const byTimestamp = new Map();
  for (const candle of candles) byTimestamp.set(candle.timestamp, candle);
  return [...byTimestamp.values()];
}

function toDateOnly(timestamp) {
  if (!timestamp) return '';
  return String(timestamp).slice(0, 10);
}

function toExclusiveIso(dateText) {
  const date = new Date(`${dateText}T23:59:59.999Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${dateText}`);
  return date.toISOString();
}

function csvValue(value) {
  if (value == null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function requiredArg(name) {
  const value = args[name];
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

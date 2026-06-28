import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const workspaceRoot = path.resolve(projectRoot, '..', '..');

dotenv.config({ path: path.join(workspaceRoot, '.env') });
dotenv.config({ path: path.join(projectRoot, '.env'), override: true });

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Required environment variable is missing: ${name}`);
  return value;
}

function numberEnv(name, defaultValue) {
  const raw = process.env[name] ?? String(defaultValue);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number.`);
  return value;
}

function positiveNumberEnv(name, defaultValue) {
  const value = numberEnv(name, defaultValue);
  if (value <= 0) throw new Error(`${name} must be positive.`);
  return value;
}

function optionalPositiveNumberEnv(name) {
  const raw = process.env[name];
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number when provided.`);
  }
  return value;
}

const mode = process.env.MODE || 'DRY_RUN';
if (!['DRY_RUN', 'LIVE'].includes(mode)) {
  throw new Error('MODE must be DRY_RUN or LIVE.');
}

const liveConfirm = process.env.LIVE_CONFIRM || 'NO';
if (mode === 'LIVE' && liveConfirm !== 'YES') {
  throw new Error('LIVE mode requires LIVE_CONFIRM=YES.');
}

const symbol = process.env.SYMBOL || '069500';
if (!/^[A-Za-z0-9.-]+$/.test(symbol)) {
  throw new Error('SYMBOL allows only letters, numbers, dot, and hyphen.');
}

const orderType = process.env.ORDER_TYPE || 'LIMIT';
if (!['LIMIT', 'MARKET'].includes(orderType)) {
  throw new Error('ORDER_TYPE must be LIMIT or MARKET.');
}

const maWindow = positiveNumberEnv('MA_WINDOW', 20);
const minCandles = positiveNumberEnv('MIN_CANDLES', 20);

export const config = {
  tossClientId: required('TOSS_CLIENT_ID'),
  tossClientSecret: required('TOSS_CLIENT_SECRET'),
  mode,
  liveConfirm,
  symbol,
  orderBudgetKrw: positiveNumberEnv('ORDER_BUDGET_KRW', 300000),
  orderType,
  priceSlippageRate: numberEnv('PRICE_SLIPPAGE_RATE', 0.001),
  minCandles,
  maWindow,
  buyThreshold: positiveNumberEnv('BUY_THRESHOLD', 1.03),
  sellThreshold: positiveNumberEnv('SELL_THRESHOLD', 0.97),
  dryRunBuyingPowerKrw: optionalPositiveNumberEnv('DRY_RUN_BUYING_POWER_KRW'),
  logLevel: process.env.LOG_LEVEL || 'info',
  strategyId: 'ma20'
};

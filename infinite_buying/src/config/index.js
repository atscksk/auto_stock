import dotenv from 'dotenv';
import { strategyConfig } from './strategy.config.js';
import { riskConfig } from './risk.config.js';
import { scheduleConfig } from './schedule.config.js';

dotenv.config();

export const appConfig = {
  mode: process.env.TRADING_MODE || process.env.MODE || 'paper',
  enableAutoOrder: parseBool(process.env.ENABLE_AUTO_ORDER, strategyConfig.enableAutoOrder),
  liveConfirm: process.env.LIVE_CONFIRM || 'NO',
  toss: {
    clientId: process.env.TOSS_CLIENT_ID,
    clientSecret: process.env.TOSS_CLIENT_SECRET,
    baseUrl: process.env.TOSS_API_BASE_URL || 'https://openapi.tossinvest.com',
    accountSeq: process.env.TOSS_ACCOUNT_SEQ
  },
  strategy: strategyConfig,
  risk: riskConfig,
  schedule: scheduleConfig
};

function parseBool(value, fallback) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'y'].includes(String(value).toLowerCase());
}

import { parseArgs } from './args.js';
import { runSummaryJob } from '../jobs/summaryJob.js';
import { notifyDailySummary } from '../services/strategyNotificationService.js';

const args = parseArgs();
const symbol = String(args.symbol || process.env.IB_SYMBOL || 'TQQQ').toUpperCase();
const summary = runSummaryJob({ symbol });

console.log('[daily summary]');
console.log(JSON.stringify(summary, null, 2));

await notifyDailySummary({ symbol, summary });

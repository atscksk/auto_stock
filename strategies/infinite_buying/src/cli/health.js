import { parseArgs } from './args.js';
import { runHealthJob } from '../jobs/healthJob.js';

const args = parseArgs();
const symbol = args.symbol ? String(args.symbol).toUpperCase() : process.env.IB_SYMBOL;
const details = await runHealthJob({ symbol });

console.log('[health] OK');
console.log(JSON.stringify(details, null, 2));

import { parseArgs } from './args.js';
import { printInfiniteBuyingBacktest, runInfiniteBuyingBacktest } from '../backtest/backtestEngine.js';

const args = parseArgs();
const result = runInfiniteBuyingBacktest(args);
printInfiniteBuyingBacktest(result);

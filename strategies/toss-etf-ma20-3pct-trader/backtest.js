import { parseArgs } from '../infinite_buying/src/cli/args.js';
import { printMa20Backtest, runMa20Backtest } from './src/backtest.js';

const args = parseArgs();
const result = runMa20Backtest(args);
printMa20Backtest(result);

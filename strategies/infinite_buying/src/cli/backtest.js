import { parseArgs } from './args.js';
import {
  printInfiniteBuyingBacktest,
  runInfiniteBuyingBacktest,
  writeStateTransitions
} from '../backtest/backtestEngine.js';

const args = parseArgs();
const result = runInfiniteBuyingBacktest(args);
printInfiniteBuyingBacktest(result);
writeStateTransitions(args.stateTransitionsOut, result.stateTransitions);

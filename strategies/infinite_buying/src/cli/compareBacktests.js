import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from './args.js';
import {
  formatInfiniteBuyingComparisonTable,
  runInfiniteBuyingComparison
} from '../backtest/compare.js';

const args = parseArgs();
const rows = runInfiniteBuyingComparison(args);
const table = formatInfiniteBuyingComparisonTable(rows);

console.log(table.trimEnd());

if (args.out) {
  const outputPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, table, 'utf8');
}

import { runSignalJob } from './src/signalJob.js';
import { runJob } from './src/runtime.js';

runJob(runSignalJob, 'signal');

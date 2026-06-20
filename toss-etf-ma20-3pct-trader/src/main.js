import { runSignalJob } from './signalJob.js';
import { runJob } from './runtime.js';

runJob(runSignalJob, 'signal');

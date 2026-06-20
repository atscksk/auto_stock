import { runOrderJob } from './src/orderJob.js';
import { runJob } from './src/runtime.js';

runJob(runOrderJob, 'order');

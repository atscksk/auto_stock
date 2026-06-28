import os from 'node:os';
import { notifySafely } from '../shared/notificationService.js';

const details = {
  hostname: os.hostname(),
  uptimeSeconds: Math.floor(os.uptime()),
  loadAverage: os.loadavg().map((value) => Number(value.toFixed(2))),
  rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
  heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
};

await notifySafely({
  type: 'HEARTBEAT',
  title: 'Auto Stock heartbeat',
  severity: 'INFO',
  strategy: process.env.HEALTH_STRATEGY,
  symbol: process.env.HEALTH_SYMBOL || process.env.IB_SYMBOL || process.env.SYMBOL,
  message: 'scheduled job host is alive',
  details
});

console.log('[health] OK');
console.log(JSON.stringify(details, null, 2));

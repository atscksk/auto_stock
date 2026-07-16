import os from 'node:os';
import { notifySafely } from '../../../../shared/notificationService.js';
import { loadRuntimeState, markStrategyRun } from '../storage/runtimeStore.js';

export async function runHealthJob({ symbol } = {}) {
  const memory = process.memoryUsage();
  const runtime = loadRuntimeState();
  const details = {
    hostname: os.hostname(),
    uptimeSeconds: Math.floor(os.uptime()),
    loadAverage: os.loadavg().map((value) => Number(value.toFixed(2))),
    rssMb: Math.round(memory.rss / 1024 / 1024),
    heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
    lastRuns: runtime.lastRuns || {}
  };

  await notifySafely({
    type: 'HEARTBEAT',
    title: 'Auto Stock heartbeat',
    severity: 'INFO',
    strategy: 'infinite_buying',
    symbol,
    message: 'scheduled job host is alive',
    details
  });

  markStrategyRun('infinite:health');
  return details;
}

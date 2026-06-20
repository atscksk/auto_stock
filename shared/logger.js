import fs from 'node:fs';
import path from 'node:path';
import { nowIso, sanitizeForLog } from './utils.js';

export function createJsonlLogger({ logDir = 'logs' } = {}) {
  const resolvedLogDir = path.resolve(logDir);
  const logFiles = {
    signals: path.join(resolvedLogDir, 'signals.jsonl'),
    orderPlans: path.join(resolvedLogDir, 'order-plans.jsonl'),
    orders: path.join(resolvedLogDir, 'orders.jsonl'),
    portfolio: path.join(resolvedLogDir, 'portfolio.jsonl'),
    errors: path.join(resolvedLogDir, 'errors.jsonl')
  };

  function ensureLogFiles() {
    fs.mkdirSync(resolvedLogDir, { recursive: true });
    for (const filePath of Object.values(logFiles)) {
      if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '');
    }
  }

  function appendJsonLine(filePath, object) {
    ensureLogFiles();
    fs.appendFileSync(filePath, `${JSON.stringify(sanitizeObject(object))}\n`, 'utf8');
  }

  function logSignal(object) {
    appendJsonLine(logFiles.signals, { timestamp: nowIso(), ...object });
  }

  function logOrderPlan(object) {
    appendJsonLine(logFiles.orderPlans, { timestamp: nowIso(), ...object });
  }

  function logOrder(object) {
    appendJsonLine(logFiles.orders, { timestamp: nowIso(), ...object });
  }

  function logPortfolio(object) {
    appendJsonLine(logFiles.portfolio, { timestamp: nowIso(), ...object });
  }

  function logError(error, context = {}) {
    appendJsonLine(logFiles.errors, {
      timestamp: nowIso(),
      context,
      name: error?.name,
      message: sanitizeForLog(error?.message || String(error)),
      status: error?.status,
      body: sanitizeForLog(error?.body)
    });
  }

  return {
    logFiles,
    ensureLogFiles,
    appendJsonLine,
    logSignal,
    logOrderPlan,
    logOrder,
    logPortfolio,
    logError
  };
}

function sanitizeObject(value) {
  if (Array.isArray(value)) return value.map(sanitizeObject);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (/secret|token|authorization/i.test(key)) return [key, '[REDACTED]'];
        return [key, sanitizeObject(item)];
      })
    );
  }
  return typeof value === 'string' ? sanitizeForLog(value) : value;
}

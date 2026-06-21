import { ymd } from './time.js';

export function createClientOrderId({ cycleId, symbol, side, sequence, date = new Date() }) {
  const suffix = String(sequence).padStart(3, '0');
  return `${cycleId}-${symbol}-${ymd(date)}-${side}-${suffix}`;
}

const DEFAULT_SCALE = 10000n;

export function toDecimal(value, scale = DEFAULT_SCALE) {
  if (typeof value === 'bigint') return { units: value, scale };
  if (value == null || value === '') return { units: 0n, scale };
  const text = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new Error(`Invalid decimal value: ${value}`);
  }
  const negative = text.startsWith('-');
  const normalized = negative ? text.slice(1) : text;
  const [whole, fraction = ''] = normalized.split('.');
  const scaleDigits = String(scale).length - 1;
  const padded = `${fraction}${'0'.repeat(scaleDigits)}`.slice(0, scaleDigits);
  const units = BigInt(whole || '0') * scale + BigInt(padded || '0');
  return { units: negative ? -units : units, scale };
}

export function add(a, b) {
  const left = toDecimal(a);
  const right = toDecimal(b);
  return fromUnits(left.units + right.units);
}

export function subtract(a, b) {
  const left = toDecimal(a);
  const right = toDecimal(b);
  return fromUnits(left.units - right.units);
}

export function multiply(a, b) {
  const left = toDecimal(a);
  const right = toDecimal(b);
  return fromUnits((left.units * right.units) / DEFAULT_SCALE);
}

export function divide(a, b, precision = 4) {
  const left = toDecimal(a);
  const right = toDecimal(b);
  if (right.units === 0n) throw new Error('Cannot divide by zero.');
  const scaled = (left.units * DEFAULT_SCALE) / right.units;
  return round(fromUnits(scaled), precision);
}

export function round(value, precision = 2) {
  const decimal = toDecimal(value);
  const factor = 10n ** BigInt(4 - precision);
  const half = factor / 2n;
  const rounded = decimal.units >= 0n
    ? ((decimal.units + half) / factor) * factor
    : ((decimal.units - half) / factor) * factor;
  return fromUnits(rounded, precision);
}

export function floorQuantity(amount, price) {
  const amountDecimal = toDecimal(amount);
  const priceDecimal = toDecimal(price);
  if (priceDecimal.units <= 0n) return 0;
  return Number(amountDecimal.units / priceDecimal.units);
}

export function toNumber(value) {
  const decimal = toDecimal(value);
  return Number(decimal.units) / Number(decimal.scale);
}

export function fromUnits(units, precision = 4) {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const whole = absolute / DEFAULT_SCALE;
  const fraction = String(absolute % DEFAULT_SCALE).padStart(4, '0').slice(0, precision);
  const suffix = precision > 0 ? `.${fraction}` : '';
  return `${negative ? '-' : ''}${whole}${suffix}`;
}

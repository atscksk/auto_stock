export function nowIso() {
  return new Date().toISOString();
}

export function ymd(date = new Date()) {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

export function minutesUntilMarketClose(now = new Date(), marketCalendar = {}) {
  if (marketCalendar.minutesUntilClose != null) return Number(marketCalendar.minutesUntilClose);
  if (!marketCalendar.closeTime) return null;
  return Math.floor((new Date(marketCalendar.closeTime).getTime() - now.getTime()) / 60000);
}

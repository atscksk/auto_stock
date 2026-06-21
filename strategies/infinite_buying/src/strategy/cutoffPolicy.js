import { minutesUntilMarketClose } from '../utils/time.js';

export function evaluateCutoffPolicy({ now = new Date(), marketCalendar = {}, schedule }) {
  const minutesUntilClose = minutesUntilMarketClose(now, marketCalendar);
  if (marketCalendar.isOpen === false) {
    return {
      marketOpen: false,
      minutesUntilClose,
      canCancel: false,
      canSubmitOrder: false,
      noTouch: false,
      reason: 'MARKET_CLOSED'
    };
  }

  if (minutesUntilClose == null) {
    return {
      marketOpen: marketCalendar.isOpen !== false,
      minutesUntilClose,
      canCancel: true,
      canSubmitOrder: true,
      noTouch: false,
      reason: 'CLOSE_TIME_UNKNOWN'
    };
  }

  const noTouch = minutesUntilClose <= schedule.noTouchMinutesBeforeClose;
  return {
    marketOpen: true,
    minutesUntilClose,
    canCancel: minutesUntilClose > schedule.cancelCutoffMinutesBeforeClose,
    canSubmitOrder: minutesUntilClose > schedule.orderCutoffMinutesBeforeClose,
    noTouch,
    reason: noTouch ? 'NO_TOUCH' : 'TRADABLE_WINDOW'
  };
}

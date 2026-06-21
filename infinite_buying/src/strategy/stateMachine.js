export const StrategyState = Object.freeze({
  READY: 'READY',
  NORMAL_FRONT: 'NORMAL_FRONT',
  NORMAL_BACK: 'NORMAL_BACK',
  BUY_REJECT: 'BUY_REJECT',
  SELL_REJECT: 'SELL_REJECT',
  BIG_BUY: 'BIG_BUY',
  SKIP: 'SKIP',
  REVERSE: 'REVERSE',
  EXIT_WAIT: 'EXIT_WAIT',
  CLOSED: 'CLOSED',
  MANUAL_HALT: 'MANUAL_HALT'
});

export function decideNormalState(currentRound, totalRound) {
  return Number(currentRound) <= Number(totalRound) / 2
    ? StrategyState.NORMAL_FRONT
    : StrategyState.NORMAL_BACK;
}

export function isTradingHalted(state) {
  return state === StrategyState.MANUAL_HALT || state === StrategyState.CLOSED;
}

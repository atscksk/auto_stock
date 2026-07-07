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

export const StateOrderPolicy = Object.freeze({
  [StrategyState.READY]: {
    buy: true,
    standardSell: false,
    reverseExitSell: false
  },
  [StrategyState.NORMAL_FRONT]: {
    buy: true,
    standardSell: true,
    reverseExitSell: false
  },
  [StrategyState.NORMAL_BACK]: {
    buy: true,
    standardSell: true,
    reverseExitSell: false
  },
  [StrategyState.BUY_REJECT]: {
    buy: false,
    standardSell: true,
    reverseExitSell: false
  },
  [StrategyState.SELL_REJECT]: {
    buy: true,
    standardSell: true,
    reverseExitSell: false
  },
  [StrategyState.BIG_BUY]: {
    buy: true,
    standardSell: true,
    reverseExitSell: false
  },
  [StrategyState.SKIP]: {
    buy: false,
    standardSell: true,
    reverseExitSell: false
  },
  [StrategyState.REVERSE]: {
    buy: false,
    standardSell: false,
    reverseExitSell: true
  },
  [StrategyState.EXIT_WAIT]: {
    buy: false,
    standardSell: false,
    reverseExitSell: true
  },
  [StrategyState.CLOSED]: {
    buy: false,
    standardSell: false,
    reverseExitSell: false
  },
  [StrategyState.MANUAL_HALT]: {
    buy: false,
    standardSell: false,
    reverseExitSell: false
  }
});

export function getStateOrderPolicy(state) {
  return StateOrderPolicy[state] || StateOrderPolicy[StrategyState.MANUAL_HALT];
}

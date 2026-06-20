export function decideOrderCandidate(input) {
  const {
    signal,
    hasPosition,
    quantity,
    mode,
    liveConfirm,
    buyingPower,
    orderBudget,
    price
  } = input;

  if (!['BUY', 'SELL'].includes(signal)) {
    return noOrder('HOLD signal.');
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return noOrder('Order quantity is zero or negative.');
  }

  if (signal === 'BUY') {
    if (hasPosition) return noOrder('Position already exists.');
    const requiredAmount = quantity * price;
    if (Number.isFinite(buyingPower) && buyingPower < requiredAmount) {
      return noOrder(`Insufficient buying power. required=${requiredAmount}, available=${buyingPower}`);
    }
    if (Number.isFinite(orderBudget) && orderBudget < requiredAmount) {
      return noOrder(`Order exceeds budget. required=${requiredAmount}, budget=${orderBudget}`);
    }
  }

  if (signal === 'SELL' && !hasPosition) {
    return noOrder('No position to sell.');
  }

  if (mode === 'LIVE' && liveConfirm !== 'YES') {
    return noOrder('LIVE order requires LIVE_CONFIRM=YES.');
  }

  return {
    shouldOrder: true,
    side: signal,
    reason: mode === 'DRY_RUN'
      ? 'DRY_RUN order candidate. Live order API will not be called.'
      : 'LIVE risk check passed.'
  };
}

export function assertLiveOrderAllowed({ mode, liveConfirm, candidate }) {
  if (mode !== 'LIVE') throw new Error('Live order blocked because MODE is not LIVE.');
  if (liveConfirm !== 'YES') throw new Error('Live order blocked because LIVE_CONFIRM is not YES.');
  if (!candidate?.shouldOrder) throw new Error('Live order blocked because risk check did not pass.');
}

function noOrder(reason) {
  return { shouldOrder: false, side: null, reason };
}

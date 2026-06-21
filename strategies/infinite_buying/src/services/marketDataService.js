export async function getMarketSnapshot({ tossClient, symbol, currentPrice, previousClose }) {
  if (!tossClient) {
    return {
      currentPrice,
      previousClose,
      dailyCandles: []
    };
  }

  const dailyCandles = await tossClient.getDailyCandles(symbol, 220);
  const latest = [...dailyCandles].sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp)).at(-1);
  return {
    currentPrice: currentPrice || latest?.close || latest?.closePrice,
    previousClose: previousClose || latest?.close || latest?.closePrice,
    dailyCandles
  };
}

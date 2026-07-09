import type { PricePoint, StockInput, Technicals } from "@/lib/types";

function sma(closes: number[], period: number): number {
  const n = Math.min(period, closes.length);
  const slice = closes.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / n;
}

export function rsi14(closes: number[]): number {
  const period = 14;
  if (closes.length < period + 1) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const chg = closes[i] - closes[i - 1];
    if (chg >= 0) gain += chg;
    else loss -= chg;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

export function computeTechnicals(stock: StockInput, series: PricePoint[]): Technicals {
  const closes = series.map((p) => p.c);
  const last = closes[closes.length - 1];
  const high52w = Math.max(...closes);
  const low52w = Math.min(...closes);

  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(closes[i] / closes[i - 1] - 1);
  const recent = rets.slice(-30);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const variance = recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length;
  const dailyVol = Math.sqrt(variance);
  const realizedVol30dPct = dailyVol * Math.sqrt(252) * 100;
  const atrPct = (recent.reduce((a, b) => a + Math.abs(b), 0) / recent.length) * 100 * 1.4;

  // Weekly sigma from pre-dip volatility so the dip itself doesn't dilute the yardstick.
  const preDip = rets.slice(-90, -5);
  const pdMean = preDip.reduce((a, b) => a + b, 0) / preDip.length;
  const pdVar = preDip.reduce((a, b) => a + (b - pdMean) ** 2, 0) / preDip.length;
  const weeklySigmaPct = Math.sqrt(pdVar * 5) * 100;
  const dipZScore = weeklySigmaPct > 0 ? Math.abs(stock.dipPctWeek) / weeklySigmaPct : 0;

  // Support: densest close cluster below price over the prior nine months.
  // At fresh 52-week lows there is no shelf — flag it instead of inventing one.
  const lookback = closes.slice(0, -5);
  const below = lookback.filter((c) => c < last * 0.995);
  const supportDefined = below.length >= 5;
  const supportLevel = supportDefined ? percentileNear(below, last) : last * 0.9;
  const above = lookback.filter((c) => c > last * 1.02);
  const resistanceLevel = above.length ? Math.min(...above.slice(-120)) : high52w;

  return {
    rsi14: rsi14(closes),
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    high52w,
    low52w,
    drawdownFrom52wHighPct: (last / high52w - 1) * 100,
    rangePosition: high52w === low52w ? 0.5 : (last - low52w) / (high52w - low52w),
    atrPct,
    realizedVol30dPct,
    dipZScore,
    supportLevel,
    supportDefined,
    resistanceLevel,
  };
}

/** Highest historical close level that sits below the current price — the shelf buyers defended. */
function percentileNear(below: number[], last: number): number {
  const sorted = [...below].sort((a, b) => b - a);
  const top = sorted.slice(0, Math.max(5, Math.floor(sorted.length * 0.1)));
  const shelf = top.reduce((a, b) => a + b, 0) / top.length;
  return Math.min(shelf, last * 0.985);
}

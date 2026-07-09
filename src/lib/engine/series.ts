import type { PricePoint, StockInput } from "@/lib/types";

/** Deterministic PRNG so every session renders the identical tape. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromTicker(ticker: string): number {
  let h = 2166136261;
  for (let i = 0; i < ticker.length; i++) {
    h ^= ticker.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Gaussian via Box–Muller. */
function gauss(rng: () => number): number {
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const SNAPSHOT_DATE = new Date("2026-07-08T16:00:00");
const TRADING_DAYS = 252;
const DIP_WINDOW = 5;

function tradingDates(count: number, end: Date): string[] {
  const out: string[] = [];
  const d = new Date(end);
  while (out.length < count) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) out.unshift(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

/**
 * Builds a one-year daily close series that terminates exactly at the quoted
 * price, with the observed dip injected over the final week. The pre-dip leg
 * is a noisy geometric bridge so trend, volatility and drawdown statistics are
 * internally consistent with the stock's beta.
 */
export function buildSeries(stock: StockInput): PricePoint[] {
  const rng = mulberry32(seedFromTicker(stock.ticker));
  const dates = tradingDates(TRADING_DAYS, SNAPSHOT_DATE);

  const preDipPrice = stock.price / (1 + stock.dipPctWeek / 100);
  // Yearly drift before the dip: quality names grind up, impaired names bleed.
  const yearDrift =
    stock.fundamentals.revGrowthFwdPct / 100 + (stock.fundamentals.moat - 3) * 0.06 + (rng() - 0.5) * 0.1;
  const startPrice = preDipPrice / (1 + yearDrift);
  const dailyVol = 0.011 * Math.max(stock.beta, 0.4);

  const bridgeLen = TRADING_DAYS - DIP_WINDOW;
  const closes: number[] = [];
  let logP = Math.log(startPrice);
  const logStep = (Math.log(preDipPrice) - Math.log(startPrice)) / bridgeLen;
  for (let i = 0; i < bridgeLen; i++) {
    logP += logStep + gauss(rng) * dailyVol;
    // Pull gently back toward the bridge so the endpoint stays honest.
    const anchor = Math.log(startPrice) + logStep * (i + 1);
    logP += (anchor - logP) * 0.08;
    closes.push(Math.exp(logP));
  }
  // Force exact pre-dip anchor.
  closes[bridgeLen - 1] = preDipPrice;

  // Final week: distribute the week's dip so the last session equals dipPctDay
  // and the series lands exactly on the quoted price.
  const dayFactor = 1 + stock.dipPctDay / 100;
  const priorFactor = (1 + stock.dipPctWeek / 100) / dayFactor;
  const perDay = Math.pow(priorFactor, 1 / (DIP_WINDOW - 1));
  let p = preDipPrice;
  for (let i = 0; i < DIP_WINDOW - 1; i++) {
    const wobble = 1 + gauss(rng) * dailyVol * 0.4;
    p *= perDay * wobble;
    closes.push(p);
  }
  closes[closes.length - 1] = stock.price / dayFactor;
  closes.push(stock.price);

  return closes.map((c, i) => ({ d: dates[i], c: Number(c.toFixed(2)) }));
}

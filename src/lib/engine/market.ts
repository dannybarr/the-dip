import { UNIVERSE } from "@/data/universe";
import { analyze } from "./analyst";
import type { Analysis, Verdict } from "@/lib/types";

let cache: Analysis[] | null = null;

/** All coverage-universe analyses, computed once per session (deterministic). */
export function getAnalyses(): Analysis[] {
  if (!cache) {
    cache = UNIVERSE.map(analyze).sort((a, b) => b.dipScore - a.dipScore);
  }
  return cache;
}

export function getAnalysis(ticker: string): Analysis | undefined {
  return getAnalyses().find((a) => a.stock.ticker.toUpperCase() === ticker.toUpperCase());
}

export const VERDICT_ORDER: Verdict[] = [
  "BUY_THE_DIP",
  "ACCUMULATE",
  "WATCHLIST",
  "FALLING_KNIFE",
  "AVOID",
];

export interface IndexQuote {
  symbol: string;
  label: string;
  value: number;
  changePct: number;
}

/** Broad-market context strip. Same simulated snapshot as the universe. */
export const MARKET_INDICES: IndexQuote[] = [
  { symbol: "SPX", label: "S&P 500", value: 6412.18, changePct: -1.24 },
  { symbol: "NDX", label: "Nasdaq 100", value: 23188.4, changePct: -1.87 },
  { symbol: "DJI", label: "Dow Jones", value: 45102.66, changePct: -0.72 },
  { symbol: "RUT", label: "Russell 2000", value: 2384.51, changePct: -1.61 },
  { symbol: "VIX", label: "VIX", value: 21.84, changePct: 14.2 },
  { symbol: "US10Y", label: "US 10Y", value: 4.31, changePct: 0.9 },
];

export const SNAPSHOT_LABEL = "08 JUL 2026 · 16:00 ET";
export const DATA_MODE = "SIMULATED SNAPSHOT";

export function marketBreadth() {
  const all = getAnalyses();
  const buyable = all.filter((a) => a.verdict === "BUY_THE_DIP" || a.verdict === "ACCUMULATE").length;
  const avgScore = Math.round(all.reduce((s, a) => s + a.dipScore, 0) / all.length);
  const avgDip = all.reduce((s, a) => s + a.stock.dipPctWeek, 0) / all.length;
  return { covered: all.length, buyable, avgScore, avgDip };
}

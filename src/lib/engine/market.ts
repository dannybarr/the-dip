import { SIMULATED_UNIVERSE } from "@/data/simulated";
import { analyze, type MarketContext } from "./analyst";
import { buildSeries } from "./series";
import { buildLiveUniverse } from "./live";
import { buildMarketFactor } from "./decompose";
import { getIndexQuote, hasFmpKey } from "./providers/fmp";
import type { Analysis, PricePoint, StockInput, Verdict } from "@/lib/types";

export type DataMode = "LIVE" | "SIMULATED";

export interface IndexQuote {
  symbol: string;
  label: string;
  value: number;
  changePct: number;
}

export interface MarketData {
  analyses: Analysis[];
  indices: IndexQuote[];
  dataMode: DataMode;
  /** Human label for the "as of" timestamp. */
  asOf: string;
  /** Present when live was attempted but the desk fell back to the snapshot. */
  fallbackReason?: string;
}

export const VERDICT_ORDER: Verdict[] = [
  "BUY_THE_DIP",
  "ACCUMULATE",
  "WATCHLIST",
  "FALLING_KNIFE",
  "AVOID",
];

// ---------------------------------------------------------------------------
// Simulated snapshot — the deterministic fallback when no live feed is present.
// ---------------------------------------------------------------------------
const SIMULATED_INDICES: IndexQuote[] = [
  { symbol: "SPX", label: "S&P 500", value: 6412.18, changePct: -1.24 },
  { symbol: "NDX", label: "Nasdaq 100", value: 23188.4, changePct: -1.87 },
  { symbol: "DJI", label: "Dow Jones", value: 45102.66, changePct: -0.72 },
  { symbol: "RUT", label: "Russell 2000", value: 2384.51, changePct: -1.61 },
  { symbol: "VIX", label: "VIX", value: 21.84, changePct: 14.2 },
  { symbol: "US10Y", label: "US 10Y", value: 4.31, changePct: 0.9 },
];

const SIMULATED_LABEL = "08 JUL 2026 · 16:00 ET";

/**
 * Builds the market/peer context the catalyst decomposition needs, from a set
 * of named series. The market factor is a cap-weighted basket of the members
 * themselves: on the free tier a real index series (SPY) may not resolve, and a
 * mega-cap basket carries the same systematic factor these names load on. When
 * caps are unknown it degrades to equal weight.
 */
function buildContext(members: { input: StockInput; series: PricePoint[] }[]): MarketContext {
  const universe = new Map<string, PricePoint[]>(
    members.map((m) => [m.input.ticker, m.series]),
  );
  const market = buildMarketFactor(
    members.map((m) => ({ series: m.series, weight: m.input.marketCapB > 0 ? m.input.marketCapB : 1 })),
  );
  return { market, universe };
}

let simulatedCache: Analysis[] | null = null;
function simulatedAnalyses(): Analysis[] {
  if (!simulatedCache) {
    // Synthesise each name's series once, then decompose against the basket of
    // them, so simulated mode exercises the same code path as live.
    const members = SIMULATED_UNIVERSE.map((input) => ({ input, series: buildSeries(input) }));
    const context = buildContext(members);
    simulatedCache = members
      .map((m) => analyze(m.input, m.series, context))
      .sort((a, b) => b.signalScore - a.signalScore);
  }
  return simulatedCache;
}

export function getSimulatedMarket(reason?: string): MarketData {
  return {
    analyses: simulatedAnalyses(),
    indices: SIMULATED_INDICES,
    dataMode: "SIMULATED",
    asOf: SIMULATED_LABEL,
    fallbackReason: reason,
  };
}

// ---------------------------------------------------------------------------
// Live market-context strip — ETF/index proxies, best-effort.
// ---------------------------------------------------------------------------
const INDEX_PROXIES: { symbol: string; label: string }[] = [
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "Nasdaq 100" },
  { symbol: "DIA", label: "Dow Jones" },
  { symbol: "IWM", label: "Russell 2000" },
];

async function loadIndices(): Promise<IndexQuote[]> {
  const quotes = await Promise.all(
    INDEX_PROXIES.map(async (ix) => {
      try {
        const q = await getIndexQuote(ix.symbol);
        if (!q) return null;
        return { symbol: ix.symbol, label: ix.label, value: q.price, changePct: q.changePercentage };
      } catch {
        return null;
      }
    }),
  );
  return quotes.filter((q): q is IndexQuote => q !== null);
}

function nowLabel(): string {
  return new Date()
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    .toUpperCase()
    .replace(",", " ·");
}

// ---------------------------------------------------------------------------
// Primary loader — live with graceful fallback to the simulated snapshot.
// ---------------------------------------------------------------------------
export async function loadMarket(): Promise<MarketData> {
  if (!hasFmpKey()) return getSimulatedMarket("No market-data provider connected");
  let live;
  try {
    live = await buildLiveUniverse();
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Live feed unavailable";
    return getSimulatedMarket(reason);
  }
  const context = buildContext(live.map((s) => ({ input: s.input, series: s.series })));
  const analyses = live
    .map((s) => analyze(s.input, s.series, context))
    .sort((a, b) => b.signalScore - a.signalScore);
  // Live index quotes only — never substitute the simulated strip in live
  // mode, or the context bar would show stale numbers labelled as live. A
  // failure here defaults to an empty array rather than dropping a good
  // live universe back to the simulated snapshot: the index strip is
  // context, not the underwriting data.
  const indices = await loadIndices().catch(() => [] as IndexQuote[]);
  return {
    analyses,
    indices,
    dataMode: "LIVE",
    asOf: `${nowLabel()} ET`,
  };
}

// ---------------------------------------------------------------------------
// Derived market breadth — pure, computed from whichever analyses are loaded.
// ---------------------------------------------------------------------------
export interface Breadth {
  covered: number;
  buyable: number;
  avgScore: number;
  avgDip: number;
}

export function computeBreadth(analyses: Analysis[]): Breadth {
  if (analyses.length === 0) return { covered: 0, buyable: 0, avgScore: 0, avgDip: 0 };
  const buyable = analyses.filter((a) => a.verdict === "BUY_THE_DIP" || a.verdict === "ACCUMULATE").length;
  const avgScore = Math.round(analyses.reduce((s, a) => s + a.dipScore, 0) / analyses.length);
  const avgDip = analyses.reduce((s, a) => s + a.stock.dipPctWeek, 0) / analyses.length;
  return { covered: analyses.length, buyable, avgScore, avgDip };
}

import type { Fundamentals, StockInput } from "@/lib/types";
import { COVERAGE, type CoverageOverlay } from "@/data/coverage";
import { mulberry32, seedFromTicker } from "@/lib/engine/series";

/**
 * The Dip's simulated fallback — used when the live provider is unavailable
 * or rate-limited. It covers the SAME 24 tickers as the live universe
 * (src/data/coverage.ts) so a fallback never silently swaps the roster out
 * from under a watchlisted position.
 *
 * Each entry merges the desk's authored overlay (catalyst, moat,
 * balance-sheet rating, 5y P/E norm, forward growth, short interest,
 * bull/bear case, desk note, peers) with a deterministic, per-ticker
 * synthetic quant snapshot: price, day/week dip, beta, volume and the
 * quantitative fundamentals a live feed would otherwise supply. The seed is
 * derived from the ticker, so the same name always renders the same
 * simulated tape across a session and across runs.
 */

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Fixed salt for the per-field seed below. Any salt value produces a
 *  deterministic universe; this one is pinned because it's been verified to
 *  spread the 24 names across at least four verdict buckets (see
 *  src/test/engine.test.ts), matching how a real screen surfaces names
 *  across the whole quality spectrum rather than clustering them. */
const SEED_SALT = "s115";

/** Independent, deterministic draw per (ticker, field) — decorrelates the
 *  synthetic fields from one another so 24 tickers spread naturally across
 *  the quality/valuation spectrum instead of tracking a single shared
 *  per-ticker random walk. */
function pick(ticker: string, field: string, lo: number, hi: number): number {
  const rng = mulberry32(seedFromTicker(`${ticker}::${field}::${SEED_SALT}`));
  return lo + rng() * (hi - lo);
}

interface SectorTemplate {
  grossMarginPct: [number, number];
  opMarginPct: [number, number];
  roicPct: [number, number];
  fcfYieldPct: [number, number];
  evEbitda: [number, number];
  netDebtToEbitda: [number, number];
}

const DEFAULT_TEMPLATE: SectorTemplate = {
  grossMarginPct: [20, 55],
  opMarginPct: [5, 25],
  roicPct: [5, 22],
  fcfYieldPct: [0, 7],
  evEbitda: [8, 18],
  netDebtToEbitda: [-0.5, 2],
};

// Wide, sector-shaped bounds. The floor of each range is deliberately low —
// a real dip screen surfaces names across the whole quality spectrum, from
// franchise-grade compounders to genuinely marginal businesses, and the
// scoring engine needs that spread to discriminate between them.
const SECTOR_TEMPLATES: Record<string, SectorTemplate> = {
  Technology: {
    grossMarginPct: [45, 85],
    opMarginPct: [10, 40],
    roicPct: [6, 35],
    fcfYieldPct: [0, 6],
    evEbitda: [10, 28],
    netDebtToEbitda: [-1.5, 1.5],
  },
  "Communication Services": {
    grossMarginPct: [35, 70],
    opMarginPct: [8, 35],
    roicPct: [5, 30],
    fcfYieldPct: [0, 6],
    evEbitda: [8, 22],
    netDebtToEbitda: [-1, 2],
  },
  "Consumer Cyclical": {
    grossMarginPct: [10, 50],
    opMarginPct: [0, 20],
    roicPct: [1, 25],
    fcfYieldPct: [0, 7],
    evEbitda: [6, 18],
    netDebtToEbitda: [-0.5, 4],
  },
  "Financial Services": {
    grossMarginPct: [10, 60],
    opMarginPct: [0, 35],
    roicPct: [1, 20],
    fcfYieldPct: [0, 9],
    evEbitda: [5, 14],
    netDebtToEbitda: [0, 4],
  },
  Healthcare: {
    grossMarginPct: [18, 70],
    opMarginPct: [3, 25],
    roicPct: [3, 22],
    fcfYieldPct: [0, 8],
    evEbitda: [7, 18],
    netDebtToEbitda: [0.5, 3],
  },
  Energy: {
    grossMarginPct: [10, 35],
    opMarginPct: [3, 20],
    roicPct: [2, 16],
    fcfYieldPct: [1, 9],
    evEbitda: [4, 9],
    netDebtToEbitda: [0.5, 3],
  },
  Industrials: {
    grossMarginPct: [10, 35],
    opMarginPct: [2, 18],
    roicPct: [3, 20],
    fcfYieldPct: [0, 7],
    evEbitda: [7, 16],
    netDebtToEbitda: [0.5, 3],
  },
  "Consumer Defensive": {
    grossMarginPct: [15, 35],
    opMarginPct: [1, 10],
    roicPct: [3, 18],
    fcfYieldPct: [1, 8],
    evEbitda: [5, 12],
    netDebtToEbitda: [0.5, 2.5],
  },
};

function buildFundamentals(overlay: CoverageOverlay): Fundamentals {
  const t = SECTOR_TEMPLATES[overlay.sector] ?? DEFAULT_TEMPLATE;
  const tk = overlay.ticker;
  const peForward = round2(overlay.pe5yAvg * pick(tk, "peForward", 0.72, 0.95));
  const sectorPe = round2(overlay.pe5yAvg * pick(tk, "sectorPe", 0.6, 1.05));

  return {
    peForward,
    pe5yAvg: overlay.pe5yAvg,
    sectorPe,
    evEbitda: round2(pick(tk, "evEbitda", ...t.evEbitda)),
    fcfYieldPct: round2(pick(tk, "fcfYieldPct", ...t.fcfYieldPct)),
    grossMarginPct: round2(pick(tk, "grossMarginPct", ...t.grossMarginPct)),
    opMarginPct: round2(pick(tk, "opMarginPct", ...t.opMarginPct)),
    revGrowthFwdPct: overlay.revGrowthFwdPct,
    epsGrowthFwdPct: overlay.epsGrowthFwdPct,
    roicPct: round2(pick(tk, "roicPct", ...t.roicPct)),
    netDebtToEbitda: round2(pick(tk, "netDebtToEbitda", ...t.netDebtToEbitda)),
    moat: overlay.moat,
    balanceSheet: overlay.balanceSheet,
  };
}

function buildStock(overlay: CoverageOverlay): StockInput {
  const tk = overlay.ticker;

  const price = round2(pick(tk, "price", 40, 600));
  const dipPctDay = round2(-pick(tk, "dipPctDay", 3, 9));
  const dipPctWeek = round2(-pick(tk, "dipPctWeek", 6, 15));
  const beta = round2(pick(tk, "beta", 0.9, 1.8));
  const volumeRatio = round2(pick(tk, "volumeRatio", 1.5, 3.5));
  const marketCapB = round2(pick(tk, "marketCapB", 5, 900));
  const avgVolM = round2(pick(tk, "avgVolM", 1, 40));

  return {
    ticker: overlay.ticker,
    name: overlay.name,
    sector: overlay.sector,
    industry: overlay.industry,
    marketCapB,
    price,
    dipPctDay,
    dipPctWeek,
    beta,
    avgVolM,
    volumeRatio,
    shortInterestPct: overlay.shortInterestPct,
    catalyst: overlay.catalyst,
    fundamentals: buildFundamentals(overlay),
    bullCase: overlay.bullCase,
    bearCase: overlay.bearCase,
    deskNote: overlay.deskNote,
    peers: overlay.peers,
  };
}

/** Simulated fallback universe: same 24 tickers as COVERAGE, so live and
 *  simulated modes never present a different roster. */
export const SIMULATED_UNIVERSE: StockInput[] = COVERAGE.map(buildStock);

/** Core domain types for The Dip research platform. */
import type { DipDecomposition } from "@/lib/engine/decompose";

export type CatalystType =
  | "earnings_miss"
  | "guidance_cut"
  | "macro"
  | "sector_sympathy"
  | "analyst_downgrade"
  | "regulatory"
  | "competitive_threat"
  | "structural_decline"
  | "cost_shock"
  | "no_news";

export const CATALYST_LABELS: Record<CatalystType, string> = {
  earnings_miss: "Earnings Miss",
  guidance_cut: "Guidance Cut",
  macro: "Macro / Rates",
  sector_sympathy: "Sector Sympathy",
  analyst_downgrade: "Analyst Downgrade",
  regulatory: "Regulatory / Legal",
  competitive_threat: "Competitive Threat",
  structural_decline: "Structural Decline",
  cost_shock: "Input Cost Shock",
  no_news: "No News / Flow-Driven",
};

export interface Catalyst {
  type: CatalystType;
  headline: string;
  detail: string;
  date: string; // ISO date
  /** 0–10: how much long-term earnings power is impaired */
  severity: number;
  /** 0–10: how likely the driver is temporary and mean-reverting */
  transience: number;
}

export interface Fundamentals {
  peForward: number;
  pe5yAvg: number;
  sectorPe: number;
  evEbitda: number;
  fcfYieldPct: number;
  grossMarginPct: number;
  opMarginPct: number;
  revGrowthFwdPct: number;
  epsGrowthFwdPct: number;
  roicPct: number;
  netDebtToEbitda: number;
  /** 1–5 competitive moat rating */
  moat: number;
  /** 1–5 balance-sheet strength rating */
  balanceSheet: number;
}

export interface StockInput {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  marketCapB: number;
  price: number;
  /** negative % move today */
  dipPctDay: number;
  /** negative % move over trailing 5 sessions (inclusive of today) */
  dipPctWeek: number;
  beta: number;
  avgVolM: number;
  /** today's volume vs 90-day average */
  volumeRatio: number;
  shortInterestPct: number;
  catalyst: Catalyst;
  fundamentals: Fundamentals;
  bullCase: string[];
  bearCase: string[];
  deskNote: string;
  peers: string[];
}

export interface PricePoint {
  /** ISO date */
  d: string;
  c: number;
  /**
   * Session open. Optional: real tape carries it, the synthetic series used in
   * simulated mode does not. Present, it separates overnight gaps (how news
   * arrives) from intraday drift (how flow behaves).
   */
  o?: number;
}

export interface Technicals {
  rsi14: number;
  sma50: number;
  sma200: number;
  high52w: number;
  low52w: number;
  drawdownFrom52wHighPct: number;
  /** position of last close inside 52w range, 0..1 */
  rangePosition: number;
  atrPct: number;
  realizedVol30dPct: number;
  /** weekly dip expressed in weekly-sigma units */
  dipZScore: number;
  supportLevel: number;
  /** false when price sits at 52-week lows with no defended shelf beneath it */
  supportDefined: boolean;
  resistanceLevel: number;
}

export type Verdict =
  | "BUY_THE_DIP"
  | "ACCUMULATE"
  | "WATCHLIST"
  | "FALLING_KNIFE"
  | "AVOID";

export const VERDICT_META: Record<
  Verdict,
  { label: string; action: string; tone: "buy" | "scale" | "hold" | "warn" | "sell" }
> = {
  BUY_THE_DIP: { label: "Buy the Dip", action: "Deploy capital. Asymmetry favors entry.", tone: "buy" },
  ACCUMULATE: { label: "Accumulate", action: "Scale in across the entry zone in tranches.", tone: "scale" },
  WATCHLIST: { label: "Watchlist", action: "Wait for confirmation or a better price.", tone: "hold" },
  FALLING_KNIFE: { label: "Falling Knife", action: "Do not catch. Re-underwrite after stabilization.", tone: "warn" },
  AVOID: { label: "Avoid", action: "Structurally impaired. Cheapness is not a thesis.", tone: "sell" },
};

export type PillarKey =
  | "quality"
  | "valuation"
  | "dipCharacter"
  | "catalyst"
  | "technical"
  | "flow";

export const PILLAR_META: Record<PillarKey, { label: string; weight: number; blurb: string }> = {
  quality:      { label: "Business Quality",  weight: 0.22, blurb: "Moat, returns on capital, margins, balance sheet" },
  catalyst:     { label: "Catalyst Character", weight: 0.22, blurb: "Measured cause of the fall: market, sector or company-specific" },
  valuation:    { label: "Valuation Reset",   weight: 0.18, blurb: "Discount vs own history, sector and growth" },
  dipCharacter: { label: "Dip Character",     weight: 0.18, blurb: "Speed, depth vs volatility, capitulation signature" },
  technical:    { label: "Technical Setup",   weight: 0.12, blurb: "Oversold readings, proximity to major support" },
  flow:         { label: "Flow & Sentiment",  weight: 0.08, blurb: "Volume signature, short interest, crowding" },
};

/**
 * Where a pillar's inputs come from, which decides whether it belongs in the
 * backtestable Signal Score or the hand-authored Overlay View.
 * - `signal`: derived from live price/fundamentals, point-in-time, testable.
 * - `overlay`: hand-authored desk judgment, a static snapshot, not testable.
 * - `mixed`: blends both (e.g. live P/E measured against an authored 5y norm).
 */
export type PillarProvenance = "signal" | "overlay" | "mixed";

export interface PillarScore {
  key: PillarKey;
  score: number; // 0–100
  note: string;
  provenance: PillarProvenance;
}

export interface TradePlan {
  entryLow: number;
  entryHigh: number;
  stop: number;
  target1: number;
  target2: number;
  riskRewardRatio: number;
  horizon: string;
  suggestedSizePct: number;
  maxPortfolioRiskPct: number;
  winProbabilityPct: number;
  expectedValuePct: number;
}

export interface Analysis {
  stock: StockInput;
  series: PricePoint[];
  technicals: Technicals;
  pillars: PillarScore[];
  /** Composite of all pillars. Retained for continuity of display. */
  dipScore: number;
  /**
   * Composite of the price-derived (`signal` + `mixed`) pillars only. This is
   * the number the backtest can honestly validate and the one the verdict is
   * driven by. Overlay pillars inform context and can veto down, never up.
   */
  signalScore: number;
  /** Composite of the hand-authored (`overlay`) pillars. Context, not a signal. */
  overlayScore: number;
  verdict: Verdict;
  conviction: "HIGH" | "MODERATE" | "LOW";
  thesis: string;
  riskFlags: string[];
  plan: TradePlan;
  /** True when the name is in a genuine weekly dip (dipPctWeek < 0). The dip
   *  engine's thesis and trade plan are only meaningful when this holds. */
  isDip: boolean;
  /** How this dip decomposes into market, sector and company-specific parts.
   *  Absent when no universe context was supplied to the engine. */
  decomposition?: DipDecomposition;
}

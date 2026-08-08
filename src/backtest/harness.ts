/**
 * Walk-forward backtest harness for the Signal Score.
 *
 * The one question that decides whether this engine is real: does a higher
 * Signal Score at the moment of a dip actually predict better forward returns?
 * Everything else is presentation.
 *
 * Honesty rules baked in here:
 *  - Point-in-time only. At each historical date the score is computed from
 *    closes up to and including that date, never after. It reuses the exact
 *    production `analyze()` path, so the backtest cannot silently diverge from
 *    what the live app scores.
 *  - No overlay, no TTM fundamentals. Only the price-derived Signal Score is
 *    measured, because only it has an honest point-in-time history. The
 *    hand-authored overlay is a look-ahead snapshot and is deliberately excluded.
 *  - Known biases are reported, not hidden: these are 24 hand-picked survivors,
 *    so there is survivorship bias and no claim to significance is made. See
 *    the report footer produced by `formatReport`.
 */
import type { PricePoint, StockInput } from "@/lib/types";
import { COVERAGE } from "@/data/coverage";
import { analyze, type MarketContext } from "@/lib/engine/analyst";
import { buildMarketFactor, type DipCause } from "@/lib/engine/decompose";

export interface TickerHistory {
  ticker: string;
  /** Oldest → newest. Must carry close; open enables the gap signal; volume the flow signal. */
  bars: { d: string; c: number; o?: number; v?: number }[];
  marketCapB: number;
}

export interface BacktestConfig {
  /** Forward-return horizons to measure, in sessions. */
  horizons: number[];
  /** Minimum series length before a date is eligible (decomposition needs ~150). */
  minHistory: number;
  /** Evaluate a name only when it is in a genuine weekly dip. */
  requireDip: boolean;
}

export const DEFAULT_CONFIG: BacktestConfig = {
  horizons: [5, 20, 60],
  minHistory: 150,
  requireDip: true,
};

export interface Observation {
  ticker: string;
  date: string;
  signalScore: number;
  cause: DipCause;
  dipPctWeek: number;
  /** Forward return %, keyed by horizon. Null when the horizon runs off the end. */
  forward: Record<number, number | null>;
}

const overlayFor = new Map(COVERAGE.map((c) => [c.ticker, c]));

/** Trailing % move over n sessions inclusive of the latest close. */
function trailingMove(closes: number[], n: number): number {
  if (closes.length <= n) return 0;
  const a = closes[closes.length - 1];
  const b = closes[closes.length - 1 - n];
  return b === 0 ? 0 : (a / b - 1) * 100;
}

/**
 * Reconstructs the price-derived fields of a StockInput from a truncated bar
 * window. Fundamentals/overlay fields are filled from coverage but do not
 * affect the Signal Score, which reads only the price-derived pillars.
 */
function stockAt(h: TickerHistory, bars: TickerHistory["bars"]): StockInput {
  const closes = bars.map((b) => b.c);
  const price = closes[closes.length - 1];
  const overlay = overlayFor.get(h.ticker);

  const vols = bars.map((b) => b.v).filter((v): v is number => typeof v === "number" && v > 0);
  const avgVol = vols.length ? vols.slice(-90).reduce((a, b) => a + b, 0) / Math.min(90, vols.length) : 0;
  const todayVol = bars[bars.length - 1].v ?? 0;

  return {
    ticker: h.ticker,
    name: overlay?.name ?? h.ticker,
    sector: overlay?.sector ?? "",
    industry: overlay?.industry ?? "",
    marketCapB: h.marketCapB,
    price,
    dipPctDay: trailingMove(closes, 1),
    dipPctWeek: trailingMove(closes, 5),
    beta: 1,
    avgVolM: avgVol / 1e6,
    volumeRatio: avgVol > 0 ? todayVol / avgVol : 1,
    // Overlay fields below feed only the non-signal pillars, which the backtest
    // does not measure. They are present so analyze() has a complete input.
    shortInterestPct: overlay?.shortInterestPct ?? 0,
    catalyst: overlay?.catalyst ?? { type: "no_news", headline: "", detail: "", date: "", severity: 5, transience: 5 },
    fundamentals: {
      peForward: overlay?.pe5yAvg ?? 20,
      pe5yAvg: overlay?.pe5yAvg ?? 20,
      sectorPe: (overlay?.pe5yAvg ?? 20) * 0.9,
      evEbitda: 12,
      fcfYieldPct: 0,
      grossMarginPct: 0,
      opMarginPct: 0,
      revGrowthFwdPct: overlay?.revGrowthFwdPct ?? 0,
      epsGrowthFwdPct: overlay?.epsGrowthFwdPct ?? 0,
      roicPct: 0,
      netDebtToEbitda: 0,
      moat: overlay?.moat ?? 3,
      balanceSheet: overlay?.balanceSheet ?? 3,
    },
    bullCase: overlay?.bullCase ?? [],
    bearCase: overlay?.bearCase ?? [],
    deskNote: overlay?.deskNote ?? "",
    peers: overlay?.peers ?? [],
  };
}

/**
 * Runs the walk-forward evaluation. Returns one Observation per (ticker, date)
 * that was in a dip, carrying its point-in-time Signal Score and realised
 * forward returns.
 */
export function runBacktest(histories: TickerHistory[], config: BacktestConfig = DEFAULT_CONFIG): Observation[] {
  const observations: Observation[] = [];
  const byTicker = new Map(histories.map((h) => [h.ticker, h]));

  // Align every history to a shared, sorted date axis so point-in-time
  // truncation uses the same "as of" date across the universe.
  const allDates = [...new Set(histories.flatMap((h) => h.bars.map((b) => b.d)))].sort();
  const closeAt = new Map<string, Map<string, number>>();
  for (const h of histories) closeAt.set(h.ticker, new Map(h.bars.map((b) => [b.d, b.c])));

  const maxHorizon = Math.max(...config.horizons);

  for (let di = config.minHistory; di < allDates.length - 1; di++) {
    const asOf = allDates[di];

    // Truncate every name to the as-of date, then build the market/peer context
    // from those truncated series — exactly what the live loader does, but as of
    // a past date.
    const truncated: { input: StockInput; series: PricePoint[]; h: TickerHistory }[] = [];
    for (const h of histories) {
      const bars = h.bars.filter((b) => b.d <= asOf);
      if (bars.length < config.minHistory) continue;
      const series: PricePoint[] = bars.map((b) => ({ d: b.d, c: b.c, o: b.o }));
      truncated.push({ input: stockAt(h, bars), series, h });
    }
    if (truncated.length < 3) continue;

    const context: MarketContext = {
      universe: new Map(truncated.map((t) => [t.input.ticker, t.series])),
      market: buildMarketFactor(
        truncated.map((t) => ({ series: t.series, weight: t.input.marketCapB > 0 ? t.input.marketCapB : 1 })),
      ),
    };

    for (const t of truncated) {
      if (config.requireDip && t.input.dipPctWeek >= 0) continue;
      const a = analyze(t.input, t.series, context);

      // Forward returns from the as-of close, using the true future closes.
      const priceNow = t.input.price;
      const forward: Record<number, number | null> = {};
      for (const hz of config.horizons) {
        const futureIdx = di + hz;
        const futureDate = futureIdx < allDates.length ? allDates[futureIdx] : null;
        const futureClose = futureDate ? closeAt.get(t.h.ticker)?.get(futureDate) : undefined;
        forward[hz] =
          futureClose && priceNow > 0 ? (futureClose / priceNow - 1) * 100 : null;
      }
      // Skip observations with no measurable forward window at all.
      if (config.horizons.every((hz) => forward[hz] === null)) continue;
      void maxHorizon;

      observations.push({
        ticker: t.input.ticker,
        date: asOf,
        signalScore: a.signalScore,
        cause: a.decomposition?.cause ?? "UNKNOWN",
        dipPctWeek: t.input.dipPctWeek,
        forward,
      });
    }
  }

  return observations;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export interface HorizonMetrics {
  horizon: number;
  n: number;
  /** Spearman-style rank information coefficient between score and forward return. */
  ic: number;
  /** Mean forward return of the top score quintile minus the bottom, %. */
  quintileSpread: number;
  topQuintileMean: number;
  bottomQuintileMean: number;
  /** Share of observations with score >= 50 that had positive forward return. */
  hitRateHighScore: number;
}

function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  const denom = Math.sqrt(sxx * syy);
  return denom > 0 ? sxy / denom : 0;
}

/** Rank transform (average ranks for ties), so Pearson-on-ranks = Spearman. */
function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function metricsFor(observations: Observation[], horizon: number): HorizonMetrics {
  const rows = observations
    .map((o) => ({ s: o.signalScore, f: o.forward[horizon] }))
    .filter((r): r is { s: number; f: number } => r.f !== null);

  const n = rows.length;
  if (n < 5) {
    return { horizon, n, ic: 0, quintileSpread: 0, topQuintileMean: 0, bottomQuintileMean: 0, hitRateHighScore: 0 };
  }

  const scores = rows.map((r) => r.s);
  const rets = rows.map((r) => r.f);
  const ic = pearson(ranks(scores), ranks(rets));

  const sorted = [...rows].sort((a, b) => a.s - b.s);
  const q = Math.max(1, Math.floor(n / 5));
  const bottom = sorted.slice(0, q).map((r) => r.f);
  const top = sorted.slice(n - q).map((r) => r.f);

  const highScore = rows.filter((r) => r.s >= 50);
  const hitRateHighScore = highScore.length ? highScore.filter((r) => r.f > 0).length / highScore.length : 0;

  return {
    horizon,
    n,
    ic,
    topQuintileMean: mean(top),
    bottomQuintileMean: mean(bottom),
    quintileSpread: mean(top) - mean(bottom),
    hitRateHighScore,
  };
}

export interface CauseMetrics {
  cause: DipCause;
  n: number;
  meanForward: Record<number, number>;
}

export function metricsByCause(observations: Observation[], horizons: number[]): CauseMetrics[] {
  const causes = [...new Set(observations.map((o) => o.cause))];
  return causes
    .map((cause) => {
      const rows = observations.filter((o) => o.cause === cause);
      const meanForward: Record<number, number> = {};
      for (const hz of horizons) {
        meanForward[hz] = mean(rows.map((o) => o.forward[hz]).filter((v): v is number => v !== null));
      }
      return { cause, n: rows.length, meanForward };
    })
    .sort((a, b) => b.n - a.n);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function formatReport(observations: Observation[], config: BacktestConfig = DEFAULT_CONFIG): string {
  const lines: string[] = [];
  const pf = (v: number, d = 2) => (v >= 0 ? "+" : "") + v.toFixed(d);

  lines.push("=".repeat(64));
  lines.push("THE DIP — SIGNAL SCORE WALK-FORWARD BACKTEST");
  lines.push("=".repeat(64));
  lines.push(`Observations: ${observations.length}  (dips only: ${config.requireDip})`);
  lines.push("");
  lines.push("Does a higher Signal Score predict better forward returns?");
  lines.push("-".repeat(64));
  lines.push("Horizon      N     IC   TopQ%   BotQ%  Spread%  Hit(≥50)");
  for (const hz of config.horizons) {
    const m = metricsFor(observations, hz);
    lines.push(
      `${String(hz + "d").padEnd(6)}  ${String(m.n).padStart(5)}  ${m.ic.toFixed(3).padStart(5)}  ` +
        `${pf(m.topQuintileMean).padStart(6)}  ${pf(m.bottomQuintileMean).padStart(6)}  ` +
        `${pf(m.quintileSpread).padStart(6)}  ${(m.hitRateHighScore * 100).toFixed(0).padStart(6)}%`,
    );
  }
  lines.push("");
  lines.push("Mean forward return by measured dip cause:");
  lines.push("-".repeat(64));
  const header = "Cause".padEnd(24) + "N".padStart(6) + config.horizons.map((h) => `${h}d`.padStart(9)).join("");
  lines.push(header);
  for (const c of metricsByCause(observations, config.horizons)) {
    lines.push(
      c.cause.padEnd(24) +
        String(c.n).padStart(6) +
        config.horizons.map((h) => pf(c.meanForward[h]).padStart(9)).join(""),
    );
  }
  lines.push("");
  lines.push("-".repeat(64));
  lines.push("READ WITH CARE. Known limits, not hidden:");
  lines.push(" - 24 hand-picked mega-cap survivors: survivorship bias, heavily");
  lines.push("   correlated, effective sample far smaller than N suggests.");
  lines.push(" - No transaction costs or slippage modelled.");
  lines.push(" - IC magnitudes here can detect a broken signal, not confirm a");
  lines.push("   subtle edge. A positive top-minus-bottom spread across horizons");
  lines.push("   is encouraging; it is not proof.");
  lines.push(" - PEAD prediction: IDIOSYNCRATIC_SHOCK should underperform. If it");
  lines.push("   does not, the classification or the thresholds need work.");
  lines.push("=".repeat(64));
  return lines.join("\n");
}

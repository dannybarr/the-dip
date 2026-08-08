/**
 * Dip decomposition — why did this stock fall?
 *
 * The engine's central question is whether a dip is mean-reverting noise or the
 * market correctly repricing a worse business. Answering it needs the *cause* of
 * the move, not its size. A name down 3% on a day the whole tape is down 3% has
 * not done anything wrong; a name down 9% on a flat tape has.
 *
 * We recover cause from price alone, which is free, point-in-time and therefore
 * honestly backtestable:
 *
 *   r_target = beta_m * r_market  +  beta_s * peerExcess  +  residual
 *
 * `peerExcess` is the peer basket's return net of its own market exposure, so
 * the two factors are orthogonal and their betas separate cleanly (no matrix
 * inversion needed). What survives both is genuinely idiosyncratic — the only
 * part that is about this company.
 *
 * Classification thresholds below are a considered first draft, NOT validated.
 * Step 3's walk-forward harness is what earns them. Until it runs, treat every
 * cut point here as a hypothesis.
 */
import type { PricePoint } from "@/lib/types";

export type DipCause =
  | "MARKET_BETA"
  | "SECTOR_ROTATION"
  | "IDIOSYNCRATIC_NO_NEWS"
  | "IDIOSYNCRATIC_SHOCK"
  | "UNKNOWN";

export const DIP_CAUSE_LABELS: Record<DipCause, string> = {
  MARKET_BETA: "Market Beta",
  SECTOR_ROTATION: "Sector Rotation",
  IDIOSYNCRATIC_NO_NEWS: "Idiosyncratic / No News",
  IDIOSYNCRATIC_SHOCK: "Idiosyncratic Shock",
  UNKNOWN: "Undetermined",
};

export interface DipDecomposition {
  cause: DipCause;
  /** Total move over the window, %. Negative for a dip. */
  totalPct: number;
  /** Portion attributable to market beta, %. */
  marketPct: number;
  /** Portion attributable to sector/peer rotation, %. */
  sectorPct: number;
  /** What neither factor explains, %. This is the company-specific part. */
  idioPct: number;
  /** Share of the move explained by market + sector, 0..1. */
  systematicShare: number;
  betaMarket: number;
  betaSector: number;
  /** Idiosyncratic move in sigma units of its own trailing residual distribution. */
  residualZ: number;
  /**
   * Share of the idiosyncratic move that arrived as overnight gaps, 0..1.
   * News lands when the market is shut, so gap-dominated moves imply an event;
   * intraday bleed implies flow. null when no open data is available.
   */
  gapShare: number | null;
  confidence: "HIGH" | "MODERATE" | "LOW";
  note: string;
}

const WINDOW = 5; // sessions, matches dipPctWeek
const EST_WINDOW = 120; // sessions used to estimate betas, ending before the dip

const finite = (v: number, fallback = 0) => (Number.isFinite(v) ? v : fallback);

/** Log returns are additive across days, so a multi-day move is just their sum. */
function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const cur = closes[i];
    out.push(prev > 0 && cur > 0 ? Math.log(cur / prev) : 0);
  }
  return out;
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
}

function covariance(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let acc = 0;
  for (let i = 0; i < n; i++) acc += (xs[i] - mx) * (ys[i] - my);
  return acc / n;
}

/** Univariate OLS slope. Zero when the regressor never moves. */
function beta(y: number[], x: number[]): number {
  const vx = variance(x);
  if (vx <= 0) return 0;
  return finite(covariance(y, x) / vx, 0);
}

const pct = (logRet: number) => (Math.exp(logRet) - 1) * 100;

/**
 * Cap-weighted composite of several price series, rebased to 100.
 *
 * Used to synthesise a market factor from the covered names when a real index
 * series is unavailable. On FMP's free tier `historical-price-eod/full` may not
 * resolve for ETFs like SPY, so callers try the index first and fall back here.
 * A cap-weighted basket of mega-caps is a serviceable market proxy: it is not
 * SPY, but it carries the same systematic factor these names load on.
 */
export function buildMarketFactor(
  members: { series: PricePoint[]; weight: number }[],
): PricePoint[] {
  const usable = members.filter((m) => m.series?.length > 1 && m.weight > 0);
  if (usable.length === 0) return [];

  // Intersect on dates every member actually has, so the factor never
  // silently changes composition mid-history.
  const dateCounts = new Map<string, number>();
  for (const m of usable) {
    for (const p of m.series) dateCounts.set(p.d, (dateCounts.get(p.d) ?? 0) + 1);
  }
  const dates = [...dateCounts.entries()]
    .filter(([, n]) => n === usable.length)
    .map(([d]) => d)
    .sort();
  if (dates.length < 2) return [];

  const byTicker = usable.map((m) => ({
    weight: m.weight,
    closes: new Map(m.series.map((p) => [p.d, p.c])),
  }));
  const totalWeight = byTicker.reduce((a, b) => a + b.weight, 0);

  const out: PricePoint[] = [{ d: dates[0], c: 100 }];
  for (let i = 1; i < dates.length; i++) {
    let weighted = 0;
    for (const m of byTicker) {
      const prev = m.closes.get(dates[i - 1]);
      const cur = m.closes.get(dates[i]);
      if (prev > 0 && cur > 0) weighted += (m.weight / totalWeight) * Math.log(cur / prev);
    }
    out.push({ d: dates[i], c: out[i - 1].c * Math.exp(weighted) });
  }
  return out;
}

/** Equal-weighted basket of the named peers that we actually hold series for. */
function peerBasket(peers: string[], universe: Map<string, PricePoint[]>): PricePoint[] {
  const members = peers
    .map((t) => universe.get(t))
    .filter((s): s is PricePoint[] => Array.isArray(s) && s.length > 1)
    .map((series) => ({ series, weight: 1 }));
  return buildMarketFactor(members);
}

/** Aligns a factor onto the target's dates. Missing dates yield a flat return. */
function alignedCloses(dates: string[], factor: PricePoint[]): number[] {
  const map = new Map((factor ?? []).map((p) => [p.d, p.c]));
  const out: number[] = [];
  let last = NaN;
  for (const d of dates) {
    const v = map.get(d);
    if (Number.isFinite(v)) last = v;
    out.push(last);
  }
  // Backfill any leading gap so the series starts at a real level.
  const firstReal = out.find((v) => Number.isFinite(v));
  return out.map((v) => (Number.isFinite(v) ? v : (firstReal ?? 1)));
}

export interface DecomposeArgs {
  series: PricePoint[];
  peers: string[];
  /** Series for every name available, keyed by ticker, for the peer basket. */
  universe: Map<string, PricePoint[]>;
  /** Market factor series (a real index, or buildMarketFactor output). */
  market: PricePoint[];
  window?: number;
}

const UNRESOLVED: DipDecomposition = {
  cause: "UNKNOWN",
  totalPct: 0,
  marketPct: 0,
  sectorPct: 0,
  idioPct: 0,
  systematicShare: 0,
  betaMarket: 1,
  betaSector: 0,
  residualZ: 0,
  gapShare: null,
  confidence: "LOW",
  note: "Not enough history to separate this move into market, sector and company-specific parts.",
};

export function decomposeDip(args: DecomposeArgs): DipDecomposition {
  const { series, peers, universe, market } = args;
  const window = args.window ?? WINDOW;

  if (!series || series.length < window + 30) return UNRESOLVED;

  const dates = series.map((p) => p.d);
  const closes = series.map((p) => p.c);
  const rT = logReturns(closes);

  const mCloses = alignedCloses(dates, market ?? []);
  const rM = logReturns(mCloses);
  const hasMarket = variance(rM.slice(-EST_WINDOW)) > 0;

  const basket = peerBasket(peers, universe);
  const pCloses = alignedCloses(dates, basket);
  const rP = logReturns(pCloses);
  const hasPeers = basket.length > 1 && variance(rP.slice(-EST_WINDOW)) > 0;

  if (!hasMarket) return { ...UNRESOLVED, totalPct: pct(rT.slice(-window).reduce((a, b) => a + b, 0)) };

  // Estimate betas on the pre-dip window only, so the dip being explained does
  // not contaminate the yardstick used to explain it. Mirrors the pre-dip sigma
  // convention already used for dipZScore in indicators.ts.
  const estEnd = rT.length - window;
  const estStart = Math.max(0, estEnd - EST_WINDOW);
  if (estEnd - estStart < 30) return UNRESOLVED;

  const eT = rT.slice(estStart, estEnd);
  const eM = rM.slice(estStart, estEnd);
  const eP = hasPeers ? rP.slice(estStart, estEnd) : [];

  const betaMarket = beta(eT, eM);

  // Orthogonalise the peer factor against the market so the two betas separate.
  let betaSector = 0;
  let peerExcessAll: number[] = new Array(rT.length).fill(0);
  if (hasPeers) {
    const betaPeerToMarket = beta(eP, eM);
    peerExcessAll = rP.map((v, i) => v - betaPeerToMarket * (rM[i] ?? 0));
    betaSector = beta(eT, peerExcessAll.slice(estStart, estEnd));
  }

  // Residual history, for the z-score yardstick.
  const residAll = rT.map(
    (v, i) => v - betaMarket * (rM[i] ?? 0) - betaSector * (peerExcessAll[i] ?? 0),
  );

  // Decompose the dip window itself.
  const slice = <T,>(xs: T[]) => xs.slice(rT.length - window);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  const totalLog = sum(slice(rT));
  const marketLog = betaMarket * sum(slice(rM));
  const sectorLog = betaSector * sum(slice(peerExcessAll));
  const idioLog = totalLog - marketLog - sectorLog;

  // Rolling `window`-day residual sums over the pre-dip period give the
  // distribution this dip's residual is unusual (or not) against.
  const rollingResid: number[] = [];
  for (let i = estStart + window; i <= estEnd; i++) {
    rollingResid.push(sum(residAll.slice(i - window, i)));
  }
  const residSigma = Math.sqrt(variance(rollingResid));
  const residualZ = residSigma > 0 ? finite(idioLog / residSigma, 0) : 0;

  // Overnight gap vs intraday drift, when opens are available. News lands while
  // the market is shut; flow bleeds during the session.
  let gapShare: number | null = null;
  const winPts = series.slice(series.length - window);
  const prevPts = series.slice(series.length - window - 1, series.length - 1);
  if (winPts.every((p) => Number.isFinite(p.o) && p.o > 0)) {
    let gapAbs = 0;
    let driftAbs = 0;
    for (let i = 0; i < winPts.length; i++) {
      const prevClose = prevPts[i]?.c;
      if (!(prevClose > 0)) continue;
      gapAbs += Math.abs(Math.log(winPts[i].o / prevClose));
      driftAbs += Math.abs(Math.log(winPts[i].c / winPts[i].o));
    }
    const denom = gapAbs + driftAbs;
    if (denom > 0) gapShare = gapAbs / denom;
  }

  const totalAbs = Math.abs(totalLog);
  const systematicShare =
    totalAbs > 0 ? Math.min(1, Math.abs(marketLog + sectorLog) / totalAbs) : 0;

  const cause = classify({
    totalLog,
    marketLog,
    sectorLog,
    idioLog,
    residualZ,
    gapShare,
    hasPeers,
  });

  const confidence: DipDecomposition["confidence"] =
    estEnd - estStart >= 90 && hasPeers && gapShare !== null
      ? "HIGH"
      : estEnd - estStart >= 60
        ? "MODERATE"
        : "LOW";

  return {
    cause,
    totalPct: pct(totalLog),
    marketPct: pct(marketLog),
    sectorPct: pct(sectorLog),
    idioPct: pct(idioLog),
    systematicShare,
    betaMarket: finite(betaMarket, 1),
    betaSector: finite(betaSector, 0),
    residualZ,
    gapShare,
    confidence,
    note: describe(cause, { totalLog, marketLog, sectorLog, idioLog, residualZ, gapShare }),
  };
}

interface Parts {
  totalLog: number;
  marketLog: number;
  sectorLog: number;
  idioLog: number;
  residualZ: number;
  gapShare: number | null;
  hasPeers?: boolean;
}

/**
 * Provisional cut points. Every one of these is a hypothesis until the Step 3
 * harness measures forward returns by class.
 */
const SHOCK_Z = -2.5; // residual this extreme implies an information event
const GAP_DOMINANT = 0.6; // most of the move arrived overnight → news, not flow
const SYSTEMATIC_DOMINANT = 0.7; // market+sector explain most of the fall

function classify(p: Parts): DipCause {
  const totalAbs = Math.abs(p.totalLog);
  if (totalAbs <= 0) return "UNKNOWN";

  const marketShare = Math.abs(p.marketLog) / totalAbs;
  const sectorShare = Math.abs(p.sectorLog) / totalAbs;
  const systematic = Math.abs(p.marketLog + p.sectorLog) / totalAbs;

  // The tape did this, not the company.
  if (systematic >= SYSTEMATIC_DOMINANT) {
    return marketShare >= sectorShare ? "MARKET_BETA" : "SECTOR_ROTATION";
  }

  // Company-specific. The question is whether information arrived.
  const looksLikeNews =
    p.residualZ <= SHOCK_Z || (p.gapShare !== null && p.gapShare >= GAP_DOMINANT && p.residualZ <= -1.5);

  return looksLikeNews ? "IDIOSYNCRATIC_SHOCK" : "IDIOSYNCRATIC_NO_NEWS";
}

function describe(cause: DipCause, p: Parts): string {
  const f = (logRet: number) => `${pct(logRet) >= 0 ? "+" : ""}${pct(logRet).toFixed(1)}%`;
  const gap =
    p.gapShare === null
      ? ""
      : p.gapShare >= GAP_DOMINANT
        ? " The move arrived mostly overnight, which is how information lands."
        : " The move bled out during sessions rather than gapping, which is how flow behaves.";

  switch (cause) {
    case "MARKET_BETA":
      return `Of the ${f(p.totalLog)} move, ${f(p.marketLog)} is simply this name's beta to a falling tape. The company-specific part is ${f(p.idioLog)}. Nothing here is about the business: it fell because the market fell, and it recovers when the market does.`;
    case "SECTOR_ROTATION":
      return `${f(p.sectorLog)} of the ${f(p.totalLog)} move is the peer group de-rating together, beyond what the market explains. Rotation is not impairment, but it can persist for as long as the money is leaving, so the recovery is on someone else's clock.`;
    case "IDIOSYNCRATIC_SHOCK":
      return `${f(p.idioLog)} of the ${f(p.totalLog)} move is specific to this name and sits ${p.residualZ.toFixed(1)} sigma below its normal range.${gap} That signature means information arrived. Prices that fall on news keep drifting the same way for weeks, so this is the dip to leave alone.`;
    case "IDIOSYNCRATIC_NO_NEWS":
      return `${f(p.idioLog)} of the ${f(p.totalLog)} move is company-specific but unremarkable at ${p.residualZ.toFixed(1)} sigma.${gap} A fall with no informational signature is the classic case for reversion: someone needed out, and the buyer is being paid to provide the liquidity.`;
    default:
      return UNRESOLVED.note;
  }
}

/**
 * Portfolio construction under a power law.
 *
 * The uncomfortable arithmetic: in an asset class where half of positions go to
 * zero and the return comes from a 3-4% tail, the number of positions you hold
 * dominates the quality of any single one. A five-position portfolio of
 * excellent deals will usually return less than a thirty-position portfolio of
 * average ones, because the five-position portfolio most likely contains no tail
 * outcome at all.
 *
 * At a sub-£10,000 annual budget with £250-£1,000 tickets this is the single
 * most important decision available, and it is a decision about sizing, not
 * selection. This module quantifies it rather than asserting it.
 *
 * Concentration is not rewarded here the way it is in public markets. You cannot
 * follow on, you cannot rebalance and you cannot exit. Breadth is the only risk
 * control you actually have.
 */
import { BASELINE_OUTCOMES } from "./config";
import { DEFAULT_TAX, NO_FEES, indexMultiple, netMultiple, type PlatformFees, type TaxProfile } from "./returns";
import type { OutcomeBuckets, TaxWrapper } from "./types";

/**
 * Deterministic PRNG (mulberry32). Seeded so a given plan always renders the
 * same numbers: a planning tool whose answer flickers on reload is not a
 * planning tool.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[i];
}

export interface PortfolioResult {
  nPositions: number;
  trials: number;
  medianMultiple: number;
  meanMultiple: number;
  p10Multiple: number;
  p90Multiple: number;
  /** Probability the portfolio beats the index over the horizon. */
  pBeatIndex: number;
  /** Probability of ending below the money actually at risk. */
  pBelowCapital: number;
  /** Probability of holding at least one 10x-plus outcome. */
  pAnyTail: number;
  indexMultiple: number;
}

export interface PortfolioOptions {
  wrapper?: TaxWrapper;
  tax?: TaxProfile;
  fees?: PlatformFees;
  horizonYears?: number;
  indexAnnualReturn?: number;
  trials?: number;
  seed?: number;
  buckets?: OutcomeBuckets;
}

/**
 * Monte Carlo an equal-weighted portfolio drawn from one outcome distribution.
 *
 * Equal weighting is assumed deliberately. At this cheque size there is no
 * reliable way to size up a conviction bet, and the evidence that anyone can
 * identify the tail winner in advance is weak. Equal weighting is also the
 * allocation that maximises the chance of actually holding the tail outcome,
 * which is what drives the return.
 */
export function simulatePortfolio(nPositions: number, options: PortfolioOptions = {}): PortfolioResult {
  const {
    wrapper = "SEIS",
    tax = DEFAULT_TAX,
    fees = NO_FEES,
    horizonYears = 8,
    indexAnnualReturn = 0.1,
    trials = 20_000,
    seed = 42,
    buckets = BASELINE_OUTCOMES,
  } = options;

  const multiples = Object.keys(buckets).map(Number).sort((a, b) => a - b);
  const probs = multiples.map((m) => buckets[m]);
  const totalP = probs.reduce((a, b) => a + b, 0);
  const cumulative: number[] = [];
  let acc = 0;
  for (const p of probs) {
    acc += p / totalP;
    cumulative.push(acc);
  }

  // Pre-compute the net multiple per bucket once rather than per draw.
  const net = multiples.map((m) => netMultiple(m, wrapper, tax, fees));
  const idx = indexMultiple(horizonYears, indexAnnualReturn);
  const tailIdx = multiples.findIndex((m) => m >= 10);

  const rng = mulberry32(seed);
  const results = new Float64Array(trials);
  let beat = 0;
  let below = 0;
  let anyTail = 0;

  for (let t = 0; t < trials; t++) {
    let sum = 0;
    let hasTail = false;
    for (let i = 0; i < nPositions; i++) {
      const u = rng();
      let b = 0;
      while (b < cumulative.length - 1 && u > cumulative[b]) b++;
      sum += net[b];
      if (tailIdx >= 0 && b >= tailIdx) hasTail = true;
    }
    const portfolioMultiple = sum / nPositions;
    results[t] = portfolioMultiple;
    if (portfolioMultiple >= idx) beat++;
    if (portfolioMultiple < 1) below++;
    if (hasTail) anyTail++;
  }

  const sorted = Array.from(results).sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / trials;

  return {
    nPositions,
    trials,
    medianMultiple: quantile(sorted, 0.5),
    meanMultiple: mean,
    p10Multiple: quantile(sorted, 0.1),
    p90Multiple: quantile(sorted, 0.9),
    pBeatIndex: beat / trials,
    pBelowCapital: below / trials,
    pAnyTail: anyTail / trials,
    indexMultiple: idx,
  };
}

export interface DeploymentPlan {
  budget: number;
  ticket: number;
  positions: number;
  /** Money genuinely at risk after up-front relief. */
  capitalAtRisk: number;
  /** Positions needed for a better-than-even chance of beating the index. */
  positionsForEvenOdds: number | null;
  /** Positions needed before the downside is meaningfully controlled. */
  positionsForDownsideControl: number | null;
  curve: PortfolioResult[];
  notes: string[];
}

/**
 * Turn a budget and a ticket size into a position count and the honest odds
 * that come with it. This is the output the desk actually exists to produce.
 */
export function planDeployment(
  budget: number,
  ticket: number,
  options: PortfolioOptions = {},
): DeploymentPlan {
  const wrapper = options.wrapper ?? "SEIS";
  const tax = options.tax ?? DEFAULT_TAX;
  const positions = ticket > 0 ? Math.floor(budget / ticket) : 0;
  const reliefRate = tax.sufficientLiability ? { SEIS: 0.5, EIS: 0.3, NONE: 0 }[wrapper] : 0;

  const gridPoints = [1, 2, 3, 5, 8, 10, 15, 20, 30, 50, 75, 100];
  const curve = gridPoints.map((n) => simulatePortfolio(n, options));

  const evenOdds = curve.find((r) => r.pBeatIndex >= 0.5)?.nPositions ?? null;
  // "Downside controlled" is defined as a one-in-ten chance or better of holding
  // a tail outcome falling below a one-in-four chance of ending under capital.
  const downside = curve.find((r) => r.pBelowCapital <= 0.25)?.nPositions ?? null;

  const notes: string[] = [];
  if (positions === 0) {
    notes.push("Ticket size exceeds the budget. No position is possible on these numbers.");
  } else if (evenOdds && positions < evenOdds) {
    notes.push(
      `At ${positions} position${positions === 1 ? "" : "s"} you are below the ${evenOdds} needed for a better-than-even chance of beating the index. Either lower the ticket or accept that this is a lottery ticket rather than a portfolio.`,
    );
  }
  if (positions === 1) {
    notes.push(
      "A single position is not a strategy. The median outcome of one crowdfunding position is a loss, and the mean is carried entirely by a tail you almost certainly will not hold.",
    );
  }
  if (wrapper !== "NONE" && reliefRate > 0) {
    notes.push(
      `Relief returns ${(reliefRate * 100).toFixed(0)}% of the subscription, so ${budget.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 })} deployed is ${(budget * (1 - reliefRate)).toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 })} genuinely at risk. The relief is redeployable and should be counted as such.`,
    );
  }

  return {
    budget,
    ticket,
    positions,
    capitalAtRisk: budget * (1 - reliefRate),
    positionsForEvenOdds: evenOdds,
    positionsForDownsideControl: downside,
    curve,
    notes,
  };
}

/**
 * Outcome distributions and the evidence tilt.
 *
 * Venture returns are power-law distributed, so an expected value computed from
 * a point estimate of "how good is this company" is meaningless: the whole
 * return lives in the tail. What evidence can plausibly do is tilt the tail
 * probability, so we start from a baseline distribution and apply a monotone
 * tilt.
 *
 * The tilt is an exponential (Esscher) tilt:
 *
 *     p'_i  proportional to  p_i * exp(k * z * log(1 + m_i))
 *
 * where m_i is bucket i's gross multiple, z in [-1, 1] is the standardised
 * evidence score and k is the tilt strength. Three properties earn it its place:
 * it is monotone in the score, it moves mass toward the tail rather than
 * rescaling the curve, and at k = 0 it collapses to the baseline, so an
 * uncalibrated model degrades to "the evidence tells you nothing" rather than to
 * overconfidence.
 *
 * k ships at zero. See config.ts for why.
 */
import { BASELINE_OUTCOMES, TILT_STRENGTH } from "./config";
import { netMultiple, indexMultiple, type PlatformFees, type TaxProfile, DEFAULT_TAX, NO_FEES } from "./returns";
import type { OutcomeBuckets, TaxWrapper } from "./types";

export function expectedGrossMultiple(buckets: OutcomeBuckets): number {
  return Object.entries(buckets).reduce((sum, [m, p]) => sum + Number(m) * p, 0);
}

/** Probability of ending at or below the given gross multiple. */
export function probabilityAtOrBelow(buckets: OutcomeBuckets, threshold: number): number {
  return Object.entries(buckets).reduce(
    (sum, [m, p]) => (Number(m) <= threshold ? sum + p : sum),
    0,
  );
}

export function tiltDistribution(
  baseline: OutcomeBuckets,
  evidenceScore: number,
  tiltStrength: number = TILT_STRENGTH,
  sectorTilt = 0,
): OutcomeBuckets {
  const z = Math.max(-1, Math.min(1, (evidenceScore - 50) / 50 + sectorTilt));
  const weighted: OutcomeBuckets = {};
  let total = 0;
  for (const [key, p] of Object.entries(baseline)) {
    const m = Number(key);
    // log(1 + m) keeps the tilt well behaved at m = 0 and grows sub-linearly in
    // the tail, so good evidence raises tail probability without producing
    // absurd expected values.
    const w = p * Math.exp(tiltStrength * z * Math.log(1 + m));
    weighted[m] = w;
    total += w;
  }
  if (total <= 0) return { ...baseline };
  const out: OutcomeBuckets = {};
  for (const [m, w] of Object.entries(weighted)) out[Number(m)] = w / total;
  return out;
}

/**
 * Expected multiple on money at risk, after relief and fees.
 *
 * Computed bucket by bucket rather than by applying the tax function to the
 * expected gross multiple. That is not pedantry: loss relief makes the payoff
 * piecewise, so E[f(M)] != f(E[M]) and the naive version materially understates
 * the wrapper.
 */
export function expectedNetMultiple(
  buckets: OutcomeBuckets,
  wrapper: TaxWrapper,
  tax: TaxProfile = DEFAULT_TAX,
  fees: PlatformFees = NO_FEES,
): number {
  return Object.entries(buckets).reduce(
    (sum, [m, p]) => sum + p * netMultiple(Number(m), wrapper, tax, fees),
    0,
  );
}

/** Ratio of expected net multiple to the index over the same period. */
export function edgeVsIndex(
  expectedNet: number,
  years: number,
  annualReturn: number,
  illiquidityPremium = 0,
): number {
  const idx = indexMultiple(years, annualReturn + illiquidityPremium);
  return idx ? expectedNet / idx : Number.POSITIVE_INFINITY;
}

/**
 * Rebuild the baseline with a different tail probability, moving the difference
 * into total loss.
 *
 * This exists because the tail probability is the single assumption the whole
 * desk swings on, and the only honest way to present an assumption that powerful
 * is to let the reader move it. Reassigning to total loss rather than to the
 * middle buckets is the conservative choice: it treats the missing tail mass as
 * failure rather than as mediocrity.
 */
export function withTailProbability(tailP: number, baseline: OutcomeBuckets = BASELINE_OUTCOMES): OutcomeBuckets {
  const out = { ...baseline };
  const keys = Object.keys(out).map(Number).sort((a, b) => a - b);
  const tailKey = keys[keys.length - 1];
  const lossKey = keys[0];
  const delta = out[tailKey] - tailP;
  out[tailKey] = tailP;
  out[lossKey] = Math.max(0, out[lossKey] + delta);
  // Renormalise against floating-point drift so probabilities always sum to 1.
  const total = Object.values(out).reduce((a, b) => a + b, 0);
  if (total > 0) for (const k of keys) out[k] = out[k] / total;
  return out;
}

/**
 * Angel desk configuration. Every number here is a claim about the world.
 *
 * Read the note on TILT_STRENGTH before changing anything. The prototype this
 * was ported from shipped a tilt of 0.35 while openly stating it was
 * uncalibrated, and the consequence was that the "does this beat the index"
 * gate could never reject a deal the evidence score had already passed. This
 * desk ships the honest default instead.
 */
import type { OutcomeBuckets, Sector } from "./types";

/**
 * Baseline outcome distribution for an unscored equity crowdfunding deal.
 * Gross exit multiple -> probability.
 *
 * Anchored on the stylised facts that over half of investments return less than
 * capital and under a tenth return more than 10x. Deliberately more conservative
 * than platform-published IRRs, which are inflated by unrealised paper marks on
 * companies that have not exited.
 *
 * THIS IS THE MOST LOAD-BEARING ASSUMPTION IN THE WHOLE DESK. It is seven
 * hand-written numbers, not a fitted distribution, and 23% of the expected value
 * sits in the single 30x bucket at p=0.01. Moving that probability to 0.007
 * reverses the conclusion that wrapped crowdfunding beats the index at all.
 * That is why the hurdle page ships a sensitivity control rather than a headline
 * number: the honest presentation of an assumption this powerful is to let the
 * reader move it and watch the answer change.
 */
export const BASELINE_OUTCOMES: OutcomeBuckets = {
  0.0: 0.5, // total loss
  0.3: 0.13, // partial recovery, distressed sale
  1.0: 0.17, // capital returned, zombie or flat secondary
  2.0: 0.1,
  5.0: 0.06,
  10.0: 0.03,
  30.0: 0.01,
};

/**
 * Strength of the evidence-driven tilt on the baseline distribution.
 *
 * Zero means "the evidence score tells you nothing about the outcome", and that
 * is the correct default until a calibration harness proves otherwise on real
 * outcome data. It is not pessimism, it is the absence of a claim.
 *
 * The tempting calibration target is the published spread between average and
 * top-quartile crowdfunding portfolios, roughly 2.1x. Do not use it. In a
 * power-law asset class, sorting portfolios into quartiles produces most of that
 * dispersion even when no investor has any skill at all: the top quartile is
 * largely the people who happened to hold the one 30x. Unconditional quartile
 * spread is an upper bound on skill and mostly luck.
 */
export const TILT_STRENGTH = 0;

/**
 * Sector priors. `evTilt` shifts the outcome distribution before evidence is
 * applied, encoding the historical base rate of the category rather than a
 * preference. Physical-goods categories are marked down because gross margins
 * cap the multiple, working capital consumes the raise, and trade-sale
 * comparables are thin.
 *
 * These only bite when TILT_STRENGTH is non-zero, which is deliberate: an
 * uncalibrated model should not be quietly re-ranking sectors either.
 */
export const SECTOR_PRIORS: Record<Sector, { evTilt: number; capitalIntensity: number; exitPaths: number }> = {
  b2b_saas: { evTilt: 0.35, capitalIntensity: 0.2, exitPaths: 0.9 },
  fintech: { evTilt: 0.2, capitalIntensity: 0.5, exitPaths: 0.8 },
  deeptech: { evTilt: 0.25, capitalIntensity: 0.7, exitPaths: 0.7 },
  marketplace: { evTilt: 0.1, capitalIntensity: 0.5, exitPaths: 0.7 },
  healthtech: { evTilt: 0.05, capitalIntensity: 0.6, exitPaths: 0.6 },
  energy_climate: { evTilt: 0.0, capitalIntensity: 0.8, exitPaths: 0.5 },
  gaming_media: { evTilt: -0.05, capitalIntensity: 0.4, exitPaths: 0.5 },
  biotech: { evTilt: -0.05, capitalIntensity: 0.9, exitPaths: 0.6 },
  proptech: { evTilt: -0.1, capitalIntensity: 0.7, exitPaths: 0.4 },
  hardware: { evTilt: -0.2, capitalIntensity: 0.8, exitPaths: 0.4 },
  consumer_d2c: { evTilt: -0.3, capitalIntensity: 0.7, exitPaths: 0.3 },
  food_beverage: { evTilt: -0.35, capitalIntensity: 0.8, exitPaths: 0.3 },
  other: { evTilt: -0.1, capitalIntensity: 0.5, exitPaths: 0.5 },
};

/**
 * Evidence pillar weights.
 *
 * Note the deliberate asymmetry: terms and integrity together outweigh the
 * narrative pillars. At retail cheque sizes you cannot influence execution, so
 * the only things you actually control are the price you pay and whether you
 * were lied to.
 *
 * Evidence-base for the ordering, carried over from the prototype: Ahlers,
 * Cumming, Gunther and Schweizer (2015) on retained equity and risk disclosure;
 * Piva and Rossi-Lamastra (2018) on industry-specific human capital dominating
 * generic credentials; Vismara (2018) on prior professional funding as the
 * strongest survivorship predictor.
 */
export const PILLAR_WEIGHTS: Record<string, number> = {
  team: 20,
  traction: 20,
  terms: 20,
  integrity: 16,
  smart_money: 14,
  market: 10,
};

/** Absence is a signal. Missing disclosure lowers the profile rather than being skipped. */
export const OPACITY = {
  /** Above this fraction of weighted-missing fields, cap the evidence score. */
  capThreshold: 0.4,
  scoreCap: 55,
  /** Above this, there is not enough here to underwrite anything. */
  vetoThreshold: 0.65,
};

export const BENCHMARK = {
  indexAnnualReturn: 0.1,
  defaultHorizonYears: 8,
  illiquidityPremium: 0,
};

/**
 * Evidence bands. These describe the profile, they do not gate the verdict.
 *
 * The prototype used bands like these to drive a five-level buy verdict. That
 * implied a ranking ability nothing has demonstrated, so this desk reports
 * eligibility and shows the evidence separately.
 */
export const EVIDENCE_BANDS = { strong: 70, adequate: 52, thin: 38 };

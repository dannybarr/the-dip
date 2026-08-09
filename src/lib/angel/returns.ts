/**
 * The return hurdle: what gross multiple must a deal produce to beat the index?
 *
 * This is the spine of the angel desk. Everything else exists to estimate the
 * inputs to the question answered here.
 *
 * The mechanic that dominates everything
 * --------------------------------------
 * You do not risk the money you invest. You risk it minus the income tax relief
 * you reclaim. SEIS relief is 50%, so a £1,000 SEIS subscription puts £500 at
 * risk, and any proceeds accrue to that £500. Your effective multiple is
 * therefore roughly twice the company's gross multiple.
 *
 * That single fact moves the bar more than any amount of deal selection
 * available to a retail investor: with relief the company needs about 1.10x to
 * beat the index over eight years, without it about 2.18x. No plausible retail
 * selection edge is worth 2x, which is why the wrapper is checked before
 * anything else in this system.
 *
 * Comparison basis
 * ----------------
 * The honest benchmark is the index held inside an ISA: tax-free in, tax-free
 * out. SEIS/EIS proceeds are also CGT-free. So we compare tax-free to tax-free,
 * and the only asymmetry credited is the up-front income tax relief, which is
 * real, immediate, and unavailable on a tracker. We compare on money actually at
 * risk, because the relief is returned to you and can be redeployed.
 *
 * Nothing here is tax advice. Relief rates, holding periods and loss relief
 * eligibility change and are specific to your circumstances; confirm with an
 * accountant before relying on any number this produces.
 */
import type { HurdleReport, TaxWrapper } from "./types";

/** Up-front income tax relief rate by wrapper. */
export const RELIEF_RATE: Record<TaxWrapper, number> = {
  SEIS: 0.5,
  EIS: 0.3,
  NONE: 0,
};

/** Minimum hold in years for relief to stick. Sell earlier and it is clawed back. */
export const MIN_HOLD_YEARS: Record<TaxWrapper, number> = {
  SEIS: 3,
  EIS: 3,
  NONE: 0,
};

/** Annual investment caps per tax year, per investor, in GBP. */
export const ANNUAL_CAP: Record<TaxWrapper, number> = {
  SEIS: 200_000,
  EIS: 1_000_000,
  NONE: Number.POSITIVE_INFINITY,
};

/**
 * Long-run nominal total return of the S&P 500. Deliberately set at the higher
 * end of credible estimates so the hurdle is honest rather than flattering to
 * the venture side.
 */
export const DEFAULT_INDEX_RETURN = 0.1;

/**
 * Platform economics. A real and widely ignored drag.
 * Carry is charged on profit above capital returned, which is why it damages a
 * low gross multiple disproportionately.
 */
export interface PlatformFees {
  /** One-off fee on the amount invested. */
  investmentFeePct: number;
  /** Carried interest on profits. */
  carryPct: number;
}

/** Published headline structures. Verify per raise: they change. */
const FEE_TABLE: Record<string, PlatformFees> = {
  crowdcube: { investmentFeePct: 0.015, carryPct: 0 },
  seedrs: { investmentFeePct: 0, carryPct: 0.075 },
  republic: { investmentFeePct: 0, carryPct: 0.075 },
  wefunder: { investmentFeePct: 0.02, carryPct: 0 },
  startengine: { investmentFeePct: 0.035, carryPct: 0 },
};

export const NO_FEES: PlatformFees = { investmentFeePct: 0, carryPct: 0 };

export function feesFor(platform: string): PlatformFees {
  return FEE_TABLE[platform.toLowerCase()] ?? NO_FEES;
}

/** The investor's own tax position. Relief is worthless without liability. */
export interface TaxProfile {
  /** Marginal income tax rate, used for loss relief. */
  marginalRate: number;
  /** Whether there is enough income tax liability to absorb the relief. */
  sufficientLiability: boolean;
}

export const DEFAULT_TAX: TaxProfile = { marginalRate: 0.45, sufficientLiability: true };

export function effectiveRelief(wrapper: TaxWrapper, tax: TaxProfile): number {
  return tax.sufficientLiability ? RELIEF_RATE[wrapper] : 0;
}

/** Fraction of gross subscription actually at risk after up-front relief. */
export function netCostFraction(wrapper: TaxWrapper, tax: TaxProfile = DEFAULT_TAX): number {
  return 1 - effectiveRelief(wrapper, tax);
}

/**
 * Convert a company's gross exit multiple into the investor's net multiple on
 * money at risk, which is the quantity comparable to an index return.
 *
 * Three regimes: profit (carry bites, gains are CGT-exempt), partial recovery
 * (loss relief applies to the shortfall), and wipeout (loss relief on the whole
 * net cost).
 */
export function netMultiple(
  grossMultiple: number,
  wrapper: TaxWrapper,
  tax: TaxProfile = DEFAULT_TAX,
  fees: PlatformFees = NO_FEES,
): number {
  if (grossMultiple < 0) throw new Error("grossMultiple must be non-negative");

  // The platform's up-front fee increases what you laid out and attracts no
  // relief of its own.
  const grossOutlay = 1 + fees.investmentFeePct;
  const relief = effectiveRelief(wrapper, tax);
  const netCost = grossOutlay - relief;
  if (netCost <= 0) return Number.POSITIVE_INFINITY;

  let proceeds = grossMultiple;
  // Carry bites only on profit over the £1 of capital subscribed.
  if (fees.carryPct && proceeds > 1) proceeds -= (proceeds - 1) * fees.carryPct;

  if (proceeds >= netCost) return proceeds / netCost;

  // Loss relief: the shortfall is set against income at the marginal rate.
  // Only credited inside a relief wrapper. Share loss relief on unwrapped
  // holdings can exist under other rules but is not assumed here, which keeps
  // the unwrapped case conservative rather than flattering.
  const shortfall = netCost - proceeds;
  const recovered = wrapper !== "NONE" ? shortfall * tax.marginalRate : 0;
  return (proceeds + recovered) / netCost;
}

/** Index multiple over the holding period. The thing to beat. */
export function indexMultiple(years: number, annualReturn: number = DEFAULT_INDEX_RETURN): number {
  return (1 + annualReturn) ** years;
}

/**
 * The gross exit multiple a company must achieve for you to have won.
 *
 * `illiquidityPremium` is an additional annual return demanded for locking
 * capital up with no secondary market. Zero answers "did I beat the index";
 * 0.03 to 0.05 answers "was I paid for the illiquidity".
 *
 * Derivation: you need net proceeds >= netCost * indexMultiple. Net proceeds on
 * a winning outcome are the gross multiple less carry, so invert the carry
 * deduction and solve.
 */
export function hurdleGrossMultiple(
  years: number,
  wrapper: TaxWrapper,
  tax: TaxProfile = DEFAULT_TAX,
  fees: PlatformFees = NO_FEES,
  annualReturn: number = DEFAULT_INDEX_RETURN,
  illiquidityPremium = 0,
): number {
  const target = indexMultiple(years, annualReturn + illiquidityPremium);
  const netCost = 1 + fees.investmentFeePct - effectiveRelief(wrapper, tax);
  const required = netCost * target;
  // proceedsAfterCarry = p - (p-1)*carry  =>  p = (required - carry) / (1 - carry)
  if (fees.carryPct) return (required - fees.carryPct) / (1 - fees.carryPct);
  return required;
}

/** Gross multiple at which you simply get your money at risk back. */
export function breakevenGrossMultiple(
  wrapper: TaxWrapper,
  tax: TaxProfile = DEFAULT_TAX,
  fees: PlatformFees = NO_FEES,
): number {
  return hurdleGrossMultiple(0, wrapper, tax, fees);
}

export function buildHurdleReport(
  years: number,
  wrapper: TaxWrapper,
  tax: TaxProfile = DEFAULT_TAX,
  fees: PlatformFees = NO_FEES,
  annualReturn: number = DEFAULT_INDEX_RETURN,
  illiquidityPremium = 0,
): HurdleReport {
  const notes: string[] = [];
  if (wrapper !== "NONE" && years < MIN_HOLD_YEARS[wrapper]) {
    notes.push(
      `Horizon is under the ${MIN_HOLD_YEARS[wrapper]}-year minimum hold. Income tax relief would be clawed back, which removes the entire advantage this deal is relying on.`,
    );
  }
  if (!tax.sufficientLiability && wrapper !== "NONE") {
    notes.push(
      "No income tax liability to absorb the relief, so the wrapper provides no up-front benefit here, only CGT exemption and loss relief.",
    );
  }
  if (wrapper === "NONE") {
    notes.push(
      "No relief. This deal competes on a track where it must run roughly twice as fast as a wrapped one to reach the same finish line.",
    );
  }
  return {
    years,
    wrapper,
    indexMultiple: indexMultiple(years, annualReturn),
    hurdleMultiple: hurdleGrossMultiple(years, wrapper, tax, fees, annualReturn, illiquidityPremium),
    breakevenMultiple: breakevenGrossMultiple(wrapper, tax, fees),
    netCostFraction: netCostFraction(wrapper, tax),
    downsideNetMultiple: netMultiple(0, wrapper, tax, fees),
    notes,
  };
}

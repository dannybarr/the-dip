/**
 * Hard vetoes: conditions that reject a deal regardless of how well it reads.
 *
 * This is the product. The desk's own economics say selection barely
 * discriminates and breadth is what pays, which makes the filter, not the
 * ranking, the thing that earns its keep. A veto exists where a single fact
 * makes the expected return negative in a way no other strength can offset.
 *
 * Keep the list short and defensible. Every veto is a deal you will never see
 * the upside of, so each one must earn its place.
 */
import { OPACITY } from "./config";
import type { Deal, Veto } from "./types";

/** Revenue multiple implied by the round, when both figures are known. */
export function revenueMultiple(deal: Deal): number | null {
  const pre = deal.terms.preMoney;
  const rev = deal.traction.revenueLtm;
  if (pre === undefined || rev === undefined || rev <= 0) return null;
  return pre / rev;
}

const EXTREME_VALUATION_LIMIT = 30;
const NO_RIGHTS_PRICE_LIMIT = 15;
const INSOLVENCY_THRESHOLD = 2;

export function checkVetoes(deal: Deal): Veto[] {
  const out: Veto[] = [];

  // -- tax wrapper --------------------------------------------------------
  // SEIS and EIS are UK-only. The prototype vetoed every unwrapped deal, which
  // silently rejected 100% of US Reg CF flow and made its own SEC ingestion
  // pointless. The rule that actually matters is "unwrapped deals must clear a
  // hurdle roughly twice as high", so UK deals that could have relief and do not
  // are vetoed, and US deals are flagged and priced against the honest hurdle.
  if (deal.terms.taxWrapper === "NONE") {
    if (deal.country === "UK") {
      out.push({
        code: "no_advance_assurance",
        hard: true,
        reason:
          "UK raise with no SEIS or EIS advance assurance. Without relief the company must return roughly 2.18x gross rather than 1.10x for you to beat the index, and almost nothing on a retail platform clears that reliably. A UK company that has not obtained assurance has either not tried or does not qualify, and both are worth knowing.",
      });
    } else {
      out.push({
        code: "unwrapped_jurisdiction",
        hard: false,
        reason:
          "No UK tax relief available on this jurisdiction, so the deal is measured against the unwrapped hurdle of roughly 2.18x gross over eight years. That is the bar it has to clear, not the wrapped one.",
      });
    }
  }

  // -- registry health ----------------------------------------------------
  const reg = deal.registry;
  if (reg) {
    if (reg.filingHealth === "overdue" || reg.accountsOverdue || reg.confirmationStatementOverdue) {
      out.push({
        code: "accounts_overdue",
        hard: true,
        reason:
          "Statutory accounts or confirmation statement overdue at the registry. A company raising public money while delinquent on free, mandatory filings is telling you how it treats obligations.",
      });
    }
    if (reg.filingHealth === "strike_off_proposed") {
      out.push({
        code: "strike_off_proposed",
        hard: true,
        reason: "The registry shows an active proposal to strike the company off.",
      });
    }
    if (reg.outstandingCharges > 0) {
      out.push({
        code: "secured_debt_ahead",
        hard: false,
        reason: `${reg.outstandingCharges} registered charge(s) outstanding. Secured creditors rank ahead of your equity in a liquidation, which is the modal outcome for this asset class.`,
      });
    }
  }

  // -- founder insolvency pattern -----------------------------------------
  const repeat = deal.founders.find((f) => f.insolvencyCount >= INSOLVENCY_THRESHOLD);
  if (repeat) {
    out.push({
      code: "director_insolvency_pattern",
      hard: true,
      reason: `${repeat.name} has ${repeat.insolvencyCount} prior insolvent terminations on the registry. This counts liquidations and compulsory strike-offs, not the voluntary dissolution of dormant vehicles, so it is distinct from ordinary startup failure.`,
    });
  }

  // -- price --------------------------------------------------------------
  const revMult = revenueMultiple(deal);
  const milestonePriced = deal.sector === "deeptech" || deal.sector === "biotech";
  if (revMult !== null && revMult > EXTREME_VALUATION_LIMIT && !milestonePriced) {
    out.push({
      code: "extreme_valuation",
      hard: true,
      reason: `Priced at ${revMult.toFixed(0)}x trailing revenue. Entry price is the single most controllable determinant of your return, and this one requires near-perfect execution merely to break even.`,
    });
  }

  // -- price paid for no control or visibility ----------------------------
  const noRights =
    (deal.terms.shareClass === "ordinary_non_voting" || deal.terms.shareClass === "b_shares") &&
    deal.terms.hasPreemptionRights === false &&
    deal.terms.hasInformationRights === false;
  if (noRights && revMult !== null && revMult > NO_RIGHTS_PRICE_LIMIT) {
    out.push({
      code: "no_rights_at_high_price",
      hard: true,
      reason: `Non-voting shares with no pre-emption and no information rights, at ${revMult.toFixed(0)}x revenue. You would be paying a control premium for no control and no visibility.`,
    });
  }

  return out;
}

/** Reject when too little is known to underwrite anything at all. */
export function opacityVeto(opacityIndex: number): Veto | null {
  if (opacityIndex < OPACITY.vetoThreshold) return null;
  return {
    code: "insufficient_disclosure",
    hard: true,
    reason: `${(opacityIndex * 100).toFixed(0)}% of scored fields were undisclosed, above the ${(OPACITY.vetoThreshold * 100).toFixed(0)}% ceiling. There is not enough information here to form a judgement, and that is itself the finding.`,
  };
}

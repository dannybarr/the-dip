/**
 * The angel desk engine.
 *
 * Deal -> vetoes -> hurdle -> evidence profile -> network rating -> verdict.
 *
 * The verdict is about *eligibility*, not conviction. The economics this desk is
 * built on say that in a power-law asset class with a 50% loss rate, breadth
 * beats selection, and nothing has demonstrated that a retail-observable score
 * ranks outcomes. Claiming to sort deals by quality would be the one thing here
 * that is not supported by anything.
 *
 * So the question answered is: should this be one of the many positions you
 * hold? A deal is rejected on facts that are individually disqualifying, or on
 * there being too little disclosed to underwrite at all. Everything else is
 * eligible, flagged where it deserves flagging, and priced against the honest
 * hurdle.
 */
import { BENCHMARK, OPACITY } from "./config";
import { buildEvidence, evidenceScore, opacityIndex, researchTasks } from "./evidence";
import { rateNetwork } from "./network";
import { DEFAULT_TAX, buildHurdleReport, feesFor, type TaxProfile } from "./returns";
import { checkVetoes, opacityVeto, revenueMultiple } from "./vetoes";
import type { AngelAssessment, AngelVerdict, Deal, Veto } from "./types";

export interface AssessOptions {
  tax?: TaxProfile;
  horizonYears?: number;
  illiquidityPremium?: number;
}

function decideVerdict(vetoes: Veto[], opacity: number): AngelVerdict {
  // A positively disqualifying fact outranks "we cannot see enough". Both can be
  // true at once, and when they are, the known fact is the more useful thing to
  // report: an opaque deal might be resolved by asking better questions, whereas
  // a UK raise with no relief is disqualified whatever else you learn.
  if (vetoes.some((v) => v.hard && v.code !== "insufficient_disclosure")) return "REJECTED";
  if (vetoes.some((v) => v.code === "insufficient_disclosure")) return "INSUFFICIENT_DATA";
  if (vetoes.length > 0 || opacity >= OPACITY.capThreshold) return "ELIGIBLE_WITH_FLAGS";
  return "ELIGIBLE";
}

export function assessDeal(deal: Deal, options: AssessOptions = {}): AngelAssessment {
  const tax = options.tax ?? DEFAULT_TAX;
  const years = options.horizonYears ?? BENCHMARK.defaultHorizonYears;
  const illiquidity = options.illiquidityPremium ?? BENCHMARK.illiquidityPremium;
  const fees = feesFor(deal.platform);

  const pillars = buildEvidence(deal);
  const opacity = opacityIndex(pillars);
  const score = evidenceScore(pillars);

  const vetoes = checkVetoes(deal);
  const ov = opacityVeto(opacity);
  if (ov) vetoes.push(ov);

  const hurdle = buildHurdleReport(
    years,
    deal.terms.taxWrapper,
    tax,
    fees,
    BENCHMARK.indexAnnualReturn,
    illiquidity,
  );

  const verdict = decideVerdict(vetoes, opacity);
  const network = rateNetwork(deal);

  return {
    dealId: deal.dealId,
    companyName: deal.companyName,
    verdict,
    vetoes,
    hurdle,
    pillars,
    evidenceScore: Math.round(score * 10) / 10,
    opacityIndex: Math.round(opacity * 1000) / 1000,
    network,
    researchTasks: researchTasks(pillars),
    rationale: buildRationale(deal, hurdle, opacity, vetoes, verdict),
  };
}

function buildRationale(
  deal: Deal,
  hurdle: AngelAssessment["hurdle"],
  opacity: number,
  vetoes: Veto[],
  verdict: AngelVerdict,
): string[] {
  const lines: string[] = [];
  const wrapper = deal.terms.taxWrapper === "NONE" ? "no relief" : deal.terms.taxWrapper;

  lines.push(
    `With ${wrapper}, ${deal.companyName} must return ${hurdle.hurdleMultiple.toFixed(2)}x gross over ${hurdle.years} years for you to have beaten the index. On a total loss you keep ${hurdle.downsideNetMultiple.toFixed(2)}x of the money at risk.`,
  );

  const rm = revenueMultiple(deal);
  if (rm !== null) {
    lines.push(
      `Entry price is ${rm.toFixed(1)}x trailing revenue. Price is the one determinant of your return you fully control at this cheque size.`,
    );
  } else {
    lines.push(
      "Entry price cannot be assessed: pre-money valuation or trailing revenue was not disclosed. That is the first question to answer.",
    );
  }

  lines.push(
    `${(opacity * 100).toFixed(0)}% of scored fields were undisclosed. Absence is recorded adversely here rather than skipped, because an opaque deal must not read like a transparent one.`,
  );

  const hard = vetoes.filter((v) => v.hard);
  const soft = vetoes.filter((v) => !v.hard);
  if (hard.length) lines.push(`Disqualifying: ${hard.map((v) => v.code.replace(/_/g, " ")).join("; ")}.`);
  if (soft.length) lines.push(`Flagged, not disqualifying: ${soft.map((v) => v.code.replace(/_/g, " ")).join("; ")}.`);

  if (verdict === "ELIGIBLE" || verdict === "ELIGIBLE_WITH_FLAGS") {
    lines.push(
      "Eligible means it passed the filter, not that it is ranked or recommended. This desk does not claim to identify winners: it removes the deals that are disqualifying and leaves position count to do the work.",
    );
  }
  return lines;
}

export function assessAll(deals: Deal[], options: AssessOptions = {}): AngelAssessment[] {
  const out = deals.map((d) => assessDeal(d, options));
  // Rejected and insufficient sort last, so the list never invites you to scroll
  // past a rejection to reach a tempting number. Within eligibility, order by
  // how much is actually known, because that is the only defensible ordering.
  const rank: Record<AngelVerdict, number> = {
    ELIGIBLE: 0,
    ELIGIBLE_WITH_FLAGS: 1,
    INSUFFICIENT_DATA: 2,
    REJECTED: 3,
  };
  return out.sort((a, b) => rank[a.verdict] - rank[b.verdict] || a.opacityIndex - b.opacityIndex);
}

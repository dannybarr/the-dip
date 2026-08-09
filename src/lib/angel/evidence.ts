/**
 * The evidence profile.
 *
 * These six pillars used to produce a five-level buy verdict. They no longer do.
 * Nothing has demonstrated that this or any retail-observable score ranks
 * crowdfunding outcomes, and the honest treatment of an unvalidated score is to
 * show it as a description of what is known rather than as a recommendation.
 *
 * So the profile does three jobs, all of them real:
 *   1. It records what was disclosed and what was not.
 *   2. It turns every gap into a specific, ranked research question.
 *   3. It feeds the opacity index, which does gate the verdict, because
 *      "we cannot see enough to underwrite this" is a defensible rejection
 *      where "this scored 61" is not.
 *
 * Two rules are enforced throughout. A signal whose datum is unavailable is
 * emitted with missing=true rather than dropped, because dropping it would let
 * an opaque deal read identically to a transparent one. And registry-sourced
 * signals outrank founder-sourced ones on the same subject.
 */
import { PILLAR_WEIGHTS } from "./config";
import type { Deal, EvidencePillar, EvidenceSignal, Provenance } from "./types";

/**
 * Value assigned to a missing datum. Not -1: absence is evidence of a problem,
 * but weaker evidence than a confirmed problem.
 */
const MISSING_PENALTY = -0.55;

const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));

/** Map x from [low, high] onto [-1, +1], clamped. */
const scale = (x: number, low: number, high: number) =>
  high === low ? 0 : clamp((2 * (x - low)) / (high - low) - 1);

function missing(code: string, label: string, weight = 1, provenance: Provenance = "founder"): EvidenceSignal {
  return {
    code,
    label,
    value: MISSING_PENALTY,
    weight,
    missing: true,
    provenance,
    detail: "Not disclosed. Recorded as an adverse signal rather than skipped.",
  };
}

function sig(
  code: string,
  label: string,
  value: number,
  weight: number,
  provenance: Provenance,
  detail?: string,
): EvidenceSignal {
  return { code, label, value: clamp(value), weight, missing: false, provenance, detail };
}

// ---------------------------------------------------------------------------
// Pillars
// ---------------------------------------------------------------------------

function scoreTeam(deal: Deal): EvidenceSignal[] {
  if (deal.founders.length === 0) {
    return [missing("team.absent", "Founder information", 3, "registry")];
  }
  const s: EvidenceSignal[] = [];

  // Take the strongest founder, not the average. One deeply experienced
  // operator carries a team; two shallow ones do not.
  const domain = deal.founders.map((f) => f.domainYears).filter((v): v is number => v !== undefined);
  if (domain.length) {
    const best = Math.max(...domain);
    s.push(sig("team.domain_years", "Sector-specific operating experience", scale(Math.min(best, 20), 1, 12), 2.5, "founder", `${best} years for the most experienced founder.`));
  } else {
    s.push(missing("team.domain_years", "Sector-specific experience", 2.5));
  }

  const exited = deal.founders.filter((f) => f.priorExit);
  const prior = deal.founders.filter((f) => f.priorFounder);
  if (exited.length) {
    s.push(sig("team.prior_exit", "Prior successful exit", 1, 2, "registry", `${exited.length} founder(s) with a prior exit.`));
  } else if (prior.length) {
    s.push(sig("team.prior_founder", "Prior founder experience", 0.45, 2, "registry", `${prior.length} repeat founder(s), no confirmed exit.`));
  } else if (deal.founders.some((f) => f.priorFounder !== undefined)) {
    s.push(sig("team.first_time", "First-time founders", -0.2, 2, "registry", "No track record to price. Not disqualifying."));
  } else {
    s.push(missing("team.prior_founder", "Founder track record", 2, "registry"));
  }

  const ft = deal.founders.map((f) => f.fullTime).filter((v): v is boolean => v !== undefined);
  if (ft.length) {
    const ratio = ft.filter(Boolean).length / ft.length;
    s.push(sig("team.full_time", "Full-time commitment", scale(ratio, 0.3, 1), 1.5, "founder", `${(ratio * 100).toFixed(0)}% of founders full-time.`));
  } else {
    s.push(missing("team.full_time", "Founder full-time status", 1.5));
  }

  const n = deal.founders.length;
  s.push(sig("team.size", "Founding team size", n === 1 ? -0.5 : n <= 3 ? 0.6 : 0.2, 1, "platform", `${n} founder(s). Solo founders carry a materially higher failure rate.`));

  const insolvencies = deal.founders.reduce((a, f) => a + f.insolvencyCount, 0);
  if (insolvencies > 0) {
    s.push(sig("team.insolvency", "Prior insolvent terminations", clamp(-0.4 * insolvencies), 2, "registry", `${insolvencies} on the registry.`));
  }
  return s;
}

function scoreTraction(deal: Deal): EvidenceSignal[] {
  const s: EvidenceSignal[] = [];
  const t = deal.traction;

  const stageTarget: Record<Deal["stage"], number> = {
    pre_seed: 50_000,
    seed: 300_000,
    series_a: 1_500_000,
    growth: 5_000_000,
    unknown: 300_000,
  };
  if (t.revenueLtm !== undefined) {
    const target = stageTarget[deal.stage];
    const ratio = t.revenueLtm / target;
    s.push(sig("traction.revenue", "Revenue against stage norm", scale(Math.min(ratio, 3), 0.1, 1.5), 2.5, "founder", `£${t.revenueLtm.toLocaleString("en-GB")} LTM against a ${deal.stage.replace("_", " ")} norm of £${target.toLocaleString("en-GB")}.`));
  } else {
    s.push(missing("traction.revenue", "Trailing revenue", 2.5));
  }

  if (t.revenueGrowthPct !== undefined) {
    s.push(sig("traction.growth", "Revenue growth", scale(t.revenueGrowthPct, -10, 150), 2, "founder", `${t.revenueGrowthPct.toFixed(0)}% reported growth.`));
  } else {
    s.push(missing("traction.growth", "Revenue growth", 2));
  }

  if (t.grossMarginPct !== undefined) {
    s.push(sig("traction.margin", "Gross margin", scale(t.grossMarginPct, 15, 75), 2, "founder", `${t.grossMarginPct.toFixed(0)}% gross margin.`));
  } else {
    s.push(missing("traction.margin", "Gross margin", 2));
  }

  if (t.runwayMonths !== undefined) {
    s.push(sig("traction.runway", "Runway", scale(t.runwayMonths, 3, 18), 1.5, "founder", `${t.runwayMonths} months.`));
  } else {
    s.push(missing("traction.runway", "Runway", 1.5));
  }

  if (t.ltvCacRatio !== undefined) {
    s.push(sig("traction.ltv_cac", "Unit economics", scale(t.ltvCacRatio, 0.8, 4), 1.5, "founder", `LTV/CAC of ${t.ltvCacRatio.toFixed(1)}x as reported.`));
  } else {
    s.push(missing("traction.ltv_cac", "Unit economics", 1.5));
  }

  if (t.churnPctMonthly !== undefined) {
    s.push(sig("traction.churn", "Retention", scale(-t.churnPctMonthly, -8, -1), 1.5, "founder", `${t.churnPctMonthly.toFixed(1)}% monthly churn.`));
  } else {
    s.push(missing("traction.churn", "Retention", 1.5));
  }
  return s;
}

function scoreTerms(deal: Deal): EvidenceSignal[] {
  const s: EvidenceSignal[] = [];
  const terms = deal.terms;
  const rev = deal.traction.revenueLtm;

  if (terms.preMoney !== undefined && rev !== undefined && rev > 0) {
    const mult = terms.preMoney / rev;
    // Lower is better, so the scale is inverted.
    s.push(sig("terms.revenue_multiple", "Entry price", scale(-mult, -25, -3), 3, "platform", `${mult.toFixed(1)}x trailing revenue.`));
  } else {
    s.push(missing("terms.revenue_multiple", "Entry price against revenue", 3, "platform"));
  }

  if (terms.shareClass === "unknown") {
    s.push(missing("terms.share_class", "Share class", 2, "platform"));
  } else {
    const good = terms.shareClass === "ordinary" || terms.shareClass === "preferred" || terms.shareClass === "a_shares";
    s.push(sig("terms.share_class", "Share class", good ? 0.6 : -0.6, 2, "platform", `${terms.shareClass.replace(/_/g, " ")}.`));
  }

  const rights = [terms.hasPreemptionRights, terms.hasInformationRights, terms.hasVotingRights];
  if (rights.every((r) => r === undefined)) {
    s.push(missing("terms.rights", "Shareholder rights", 2, "platform"));
  } else {
    const held = rights.filter((r) => r === true).length;
    s.push(sig("terms.rights", "Shareholder rights", scale(held, 0, 3), 2, "platform", `${held} of pre-emption, information and voting rights confirmed.`));
  }

  if (terms.founderRetainedPct !== undefined) {
    // Retained equity is the signal the crowdfunding literature finds actually
    // moves outcomes: founders keeping skin in the game.
    s.push(sig("terms.retained_equity", "Founder retained equity", scale(terms.founderRetainedPct, 35, 80), 1.5, "platform", `${terms.founderRetainedPct.toFixed(0)}% retained post-round.`));
  } else {
    s.push(missing("terms.retained_equity", "Founder retained equity", 1.5, "platform"));
  }

  if (terms.nomineeStructure !== undefined) {
    s.push(sig("terms.structure", "Holding structure", terms.nomineeStructure ? 0.2 : 0.5, 1, "platform", terms.nomineeStructure ? "Pooled behind a platform nominee: simpler, but you hold indirectly." : "Direct on the register."));
  } else {
    s.push(missing("terms.structure", "Holding structure", 1, "platform"));
  }
  return s;
}

function scoreIntegrity(deal: Deal): EvidenceSignal[] {
  const s: EvidenceSignal[] = [];
  const reg = deal.registry;
  if (!reg) {
    return [missing("integrity.no_registry", "Registry record", 4, "registry")];
  }
  s.push(sig("integrity.filing_health", "Filing health", reg.filingHealth === "current" ? 0.9 : reg.filingHealth === "unknown" ? -0.3 : -1, 3, "registry", `Registry status: ${reg.filingHealth.replace(/_/g, " ")}.`));
  s.push(sig("integrity.charges", "Registered charges", reg.outstandingCharges === 0 ? 0.6 : clamp(-0.35 * reg.outstandingCharges), 2.5, "registry", `${reg.outstandingCharges} outstanding.`));

  if (reg.incorporatedOn) {
    const years = (Date.now() - new Date(reg.incorporatedOn).getTime()) / (365.25 * 24 * 3600 * 1000);
    s.push(sig("integrity.age", "Company age", scale(years, 0.5, 6), 1, "registry", `${years.toFixed(1)} years since incorporation.`));
  }
  s.push(sig("integrity.directors", "Active directors", reg.activeDirectors === 0 ? -1 : scale(reg.activeDirectors, 1, 4), 1, "registry", `${reg.activeDirectors} active.`));
  return s;
}

function scoreSmartMoney(deal: Deal): EvidenceSignal[] {
  const s: EvidenceSignal[] = [];
  const n = deal.network;
  if (n.hasProfessionalLead !== undefined) {
    s.push(sig("smart.lead", "Professional lead investor", n.hasProfessionalLead ? 0.9 : -0.4, 3, "platform", n.hasProfessionalLead ? "A professional investor priced this round." : "No professional lead: the crowd is setting the price."));
  } else {
    s.push(missing("smart.lead", "Professional lead investor", 3, "platform"));
  }
  if (n.namedCoInvestors && n.namedCoInvestors.length) {
    s.push(sig("smart.co_investors", "Named co-investors", scale(n.namedCoInvestors.length, 0, 4), 1.5, "platform", n.namedCoInvestors.slice(0, 4).join(", ")));
  } else {
    s.push(missing("smart.prior_funding", "Prior professional funding", 1.5, "registry"));
  }
  return s;
}

function scoreMarket(deal: Deal): EvidenceSignal[] {
  return [
    sig("market.sector", "Sector base rate", 0, 2, "manual", `${deal.sector.replace(/_/g, " ")}. Sector priors are recorded but do not move the profile while the tilt is uncalibrated.`),
  ];
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/** Collapse signals to a 0-100 pillar score and an opacity fraction. */
function normalise(signals: EvidenceSignal[]): { score: number; opacity: number } {
  if (!signals.length) return { score: 50, opacity: 1 };
  const totalW = signals.reduce((a, s) => a + s.weight, 0);
  if (totalW <= 0) return { score: 50, opacity: 1 };
  const weighted = signals.reduce((a, s) => a + s.value * s.weight, 0) / totalW;
  const missingW = signals.filter((s) => s.missing).reduce((a, s) => a + s.weight, 0);
  return { score: Math.max(0, Math.min(100, (weighted + 1) * 50)), opacity: missingW / totalW };
}

export function buildEvidence(deal: Deal): EvidencePillar[] {
  const defs: [string, EvidenceSignal[]][] = [
    ["team", scoreTeam(deal)],
    ["traction", scoreTraction(deal)],
    ["terms", scoreTerms(deal)],
    ["integrity", scoreIntegrity(deal)],
    ["smart_money", scoreSmartMoney(deal)],
    ["market", scoreMarket(deal)],
  ];
  return defs.map(([name, signals]) => {
    const { score, opacity } = normalise(signals);
    return { name, score, weight: PILLAR_WEIGHTS[name] ?? 10, opacity, signals };
  });
}

/** Weighted opacity: a gap in a heavy pillar hurts more than one in a light pillar. */
export function opacityIndex(pillars: EvidencePillar[]): number {
  const total = pillars.reduce((a, p) => a + p.weight, 0);
  if (total <= 0) return 1;
  return pillars.reduce((a, p) => a + p.opacity * p.weight, 0) / total;
}

export function evidenceScore(pillars: EvidencePillar[]): number {
  const total = pillars.reduce((a, p) => a + p.weight, 0);
  if (total <= 0) return 0;
  return pillars.reduce((a, p) => a + p.score * p.weight, 0) / total;
}

/** Missing data, turned into a diligence list ordered by what the gap costs. */
export const RESEARCH_HINTS: Record<string, string> = {
  "traction.churn": "Ask for gross and net revenue retention, cohorted by signup quarter. A refusal is itself an answer.",
  "traction.growth": "Request monthly revenue for the last 24 months, not a year-on-year headline. Headline growth hides a flat recent trend.",
  "traction.margin": "Get gross margin after shipping, returns, payment fees and fulfilment. Consumer pitches routinely quote margin before these.",
  "traction.ltv_cac": "Ask for blended CAC including every paid channel, and payback period in months. Reject contribution-margin LTV.",
  "traction.revenue": "Reconcile claimed revenue to the last filed accounts at the registry.",
  "traction.runway": "Ask for current cash, monthly net burn, and runway both with and without this raise closing in full.",
  "terms.revenue_multiple": "Establish pre-money valuation and trailing twelve-month revenue. Without both you cannot price the entry.",
  "terms.rights": "Read the shareholders' agreement for pre-emption, tag-along, drag-along and information rights. Ask for it explicitly if unpublished.",
  "terms.share_class": "Confirm the exact share class and whether it carries votes, a liquidation preference and anti-dilution.",
  "terms.retained_equity": "Get the post-round cap table summary and the founders' combined holding.",
  "terms.structure": "Confirm whether you hold directly on the register or via the platform nominee.",
  "smart.lead": "Identify whether any professional investor has led or priced this round, and on what terms relative to the crowd.",
  "smart.prior_funding": "Check the registry share allotment history for prior priced rounds and the valuations implied.",
  "integrity.no_registry": "Locate the company at the registry and pull filing history, charges and directorships before anything else.",
  "team.domain_years": "Verify each founder's claimed sector experience against the registry's directorship dates.",
  "team.prior_founder": "Pull every founder's full directorship history from the registry, including dissolved companies.",
  "team.full_time": "Confirm each founder is full-time. Check for concurrent active directorships elsewhere.",
  "team.absent": "Identify the directors from the registry filing, not from the pitch page.",
};

export function researchTasks(pillars: EvidencePillar[]): string[] {
  const gaps: [number, string][] = [];
  for (const p of pillars) {
    for (const s of p.signals) {
      if (s.missing && RESEARCH_HINTS[s.code]) gaps.push([s.weight * p.weight, RESEARCH_HINTS[s.code]]);
    }
  }
  gaps.sort((a, b) => b[0] - a[0]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const [, hint] of gaps) {
    if (!seen.has(hint)) {
      seen.add(hint);
      out.push(hint);
    }
  }
  return out;
}

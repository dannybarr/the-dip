/**
 * Angel desk domain model.
 *
 * The organising principle, carried over from the AngelScope prototype: every
 * input is classified by who controls it. Founder-controlled fields (the deck,
 * the forecast, the market-size slide) are cheap to exaggerate. Registry fields
 * (Companies House filings, SEC Form C, charges, directorship history) are not.
 * Where the two disagree the registry wins, and the disagreement is itself a
 * negative signal.
 */

export type TaxWrapper = "SEIS" | "EIS" | "NONE";

export type Platform =
  | "crowdcube"
  | "seedrs"
  | "republic"
  | "wefunder"
  | "startengine"
  | "other";

export type Sector =
  | "b2b_saas"
  | "fintech"
  | "deeptech"
  | "marketplace"
  | "healthtech"
  | "energy_climate"
  | "gaming_media"
  | "biotech"
  | "proptech"
  | "hardware"
  | "consumer_d2c"
  | "food_beverage"
  | "other";

export type Stage = "pre_seed" | "seed" | "series_a" | "growth" | "unknown";

export type ShareClass =
  | "ordinary"
  | "ordinary_non_voting"
  | "a_shares"
  | "b_shares"
  | "preferred"
  | "unknown";

export type FilingHealth = "current" | "overdue" | "strike_off_proposed" | "unknown";

/** Where a datum came from. Drives how much it is trusted. */
export type Provenance = "registry" | "platform" | "founder" | "manual";

export interface Founder {
  name: string;
  domainYears?: number;
  priorFounder?: boolean;
  priorExit?: boolean;
  fullTime?: boolean;
  relevantEducation?: boolean;
  /** Registry-verified insolvent terminations. Not voluntary dissolutions. */
  insolvencyCount: number;
}

export interface Traction {
  revenueLtm?: number;
  revenueGrowthPct?: number;
  grossMarginPct?: number;
  runwayMonths?: number;
  ltvCacRatio?: number;
  churnPctMonthly?: number;
}

export interface Terms {
  preMoney?: number;
  targetRaise?: number;
  amountRaised?: number;
  equityOfferedPct?: number;
  shareClass: ShareClass;
  hasPreemptionRights?: boolean;
  hasInformationRights?: boolean;
  hasVotingRights?: boolean;
  taxWrapper: TaxWrapper;
  /** Direct on the register, or pooled behind a platform nominee. */
  nomineeStructure?: boolean;
  founderRetainedPct?: number;
}

/** Registry facts. The trust anchor: mandatory, free, and not marketing. */
export interface RegistryRecord {
  companyNumber: string;
  incorporatedOn?: string;
  filingHealth: FilingHealth;
  accountsOverdue: boolean;
  confirmationStatementOverdue: boolean;
  /** Outstanding registered charges. Secured debt ranks ahead of your equity. */
  outstandingCharges: number;
  activeDirectors: number;
  source: "companies_house" | "sec_edgar";
  fetchedAt: string;
}

/** Signals that bear on relationship value rather than financial return. */
export interface NetworkFacts {
  /** Named co-investors on the round, professional or otherwise. */
  namedCoInvestors?: string[];
  /** Whether a professional investor led and priced the round. */
  hasProfessionalLead?: boolean;
  /** Investor count on the platform listing. */
  investorCount?: number;
  /** Founders reachable and responsive to direct approach. */
  founderAccessible?: boolean;
  /** Does this sit in a sector you want relationships in? Set by the user. */
  sectorAdjacency?: number;
  /** Syndicate, angel group or nominee community attached to the raise. */
  syndicateAccess?: boolean;
}

export interface Deal {
  dealId: string;
  companyName: string;
  platform: Platform;
  sector: Sector;
  stage: Stage;
  country: "UK" | "US" | "OTHER";
  url?: string;
  founders: Founder[];
  traction: Traction;
  terms: Terms;
  registry?: RegistryRecord;
  network: NetworkFacts;
  /** Fields an adapter tried and failed to read. Our bug, not their opacity. */
  unparsed: string[];
  discoveredAt?: string;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface Veto {
  code: string;
  reason: string;
  /** Hard vetoes reject outright. Soft ones downgrade and warn. */
  hard: boolean;
}

/** A single piece of evidence within the profile. Never a verdict on its own. */
export interface EvidenceSignal {
  code: string;
  label: string;
  /** -1 (bad) .. +1 (good). */
  value: number;
  weight: number;
  missing: boolean;
  provenance: Provenance;
  detail?: string;
}

export interface EvidencePillar {
  name: string;
  score: number;
  weight: number;
  opacity: number;
  signals: EvidenceSignal[];
}

/** Gross exit multiple -> probability. */
export type OutcomeBuckets = Record<number, number>;

export interface HurdleReport {
  years: number;
  wrapper: TaxWrapper;
  indexMultiple: number;
  /** Gross multiple needed to match the index. */
  hurdleMultiple: number;
  /** Gross multiple at which you get your money at risk back. */
  breakevenMultiple: number;
  /** Fraction of the subscription actually at risk after up-front relief. */
  netCostFraction: number;
  /** What you keep on a total loss, after loss relief. */
  downsideNetMultiple: number;
  notes: string[];
}

export type NetworkBand = "HIGH" | "MODERATE" | "LOW" | "NONE";

export interface NetworkRating {
  band: NetworkBand;
  score: number;
  reasons: string[];
  /** Stated plainly so it can never be read as a financial argument. */
  caveat: string;
}

/**
 * The verdict is deliberately about eligibility, not conviction.
 *
 * The prototype's own economics imply selection barely discriminates and
 * breadth is what pays, so this desk does not pretend to rank deals by quality.
 * It says whether a deal is eligible to be one of the many positions you hold.
 */
export type AngelVerdict = "ELIGIBLE" | "ELIGIBLE_WITH_FLAGS" | "INSUFFICIENT_DATA" | "REJECTED";

export interface AngelAssessment {
  dealId: string;
  companyName: string;
  verdict: AngelVerdict;
  vetoes: Veto[];
  hurdle: HurdleReport;
  /** Evidence profile. Context for your own judgement, not a ranking. */
  pillars: EvidencePillar[];
  evidenceScore: number;
  opacityIndex: number;
  network: NetworkRating;
  /** Ranked by how much the gap costs, so item one is the best next question. */
  researchTasks: string[];
  rationale: string[];
}

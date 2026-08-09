import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAX,
  NO_FEES,
  breakevenGrossMultiple,
  buildHurdleReport,
  feesFor,
  hurdleGrossMultiple,
  indexMultiple,
  netCostFraction,
  netMultiple,
} from "@/lib/angel/returns";
import { BASELINE_OUTCOMES, TILT_STRENGTH } from "@/lib/angel/config";
import {
  expectedGrossMultiple,
  expectedNetMultiple,
  tiltDistribution,
  withTailProbability,
} from "@/lib/angel/outcome";
import { planDeployment, simulatePortfolio } from "@/lib/angel/portfolio";
import { checkVetoes, opacityVeto, revenueMultiple } from "@/lib/angel/vetoes";
import { buildEvidence, opacityIndex, researchTasks } from "@/lib/angel/evidence";
import { rateNetwork } from "@/lib/angel/network";
import { assessDeal } from "@/lib/angel/engine";
import {
  LIVE_RAISE_KINDS,
  classifyForm,
  listingToDeal,
  parseCurrentFeed,
  parseFormC,
} from "@/lib/angel/sources/edgar";
import type { Deal } from "@/lib/angel/types";

const CC = feesFor("crowdcube");

function deal(overrides: Partial<Deal> = {}): Deal {
  return {
    dealId: "d1",
    companyName: "Test Co",
    platform: "crowdcube",
    sector: "b2b_saas",
    stage: "seed",
    country: "UK",
    founders: [{ name: "A Founder", insolvencyCount: 0 }],
    traction: {},
    terms: { shareClass: "ordinary", taxWrapper: "SEIS" },
    network: {},
    unparsed: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe("the tax wrapper is the mechanic that dominates everything", () => {
  it("puts only half the subscription at risk under SEIS", () => {
    expect(netCostFraction("SEIS")).toBeCloseTo(0.5, 10);
    expect(netCostFraction("EIS")).toBeCloseTo(0.7, 10);
    expect(netCostFraction("NONE")).toBeCloseTo(1.0, 10);
  });

  it("reproduces the published hurdle table over 8 years on Crowdcube fees", () => {
    // These four numbers are the whole argument for checking the wrapper first.
    expect(hurdleGrossMultiple(8, "SEIS", DEFAULT_TAX, CC)).toBeCloseTo(1.104, 3);
    expect(hurdleGrossMultiple(8, "EIS", DEFAULT_TAX, CC)).toBeCloseTo(1.533, 3);
    expect(hurdleGrossMultiple(8, "NONE", DEFAULT_TAX, CC)).toBeCloseTo(2.176, 3);
    // Unwrapped deals must run almost exactly twice as fast.
    const ratio = hurdleGrossMultiple(8, "NONE", DEFAULT_TAX, CC) / hurdleGrossMultiple(8, "SEIS", DEFAULT_TAX, CC);
    expect(ratio).toBeGreaterThan(1.9);
  });

  it("returns 0.45x of money at risk on a total loss inside a wrapper, and nothing outside one", () => {
    expect(netMultiple(0, "SEIS", DEFAULT_TAX, CC)).toBeCloseTo(0.45, 10);
    expect(netMultiple(0, "EIS", DEFAULT_TAX, CC)).toBeCloseTo(0.45, 10);
    expect(netMultiple(0, "NONE", DEFAULT_TAX, CC)).toBeCloseTo(0, 10);
  });

  it("gives no up-front benefit when there is no income tax liability to absorb it", () => {
    const none = { marginalRate: 0.45, sufficientLiability: false };
    expect(netCostFraction("SEIS", none)).toBeCloseTo(1.0, 10);
    const report = buildHurdleReport(8, "SEIS", none, CC);
    expect(report.notes.join(" ")).toMatch(/no up-front benefit/i);
  });

  it("warns when the horizon is inside the clawback window", () => {
    expect(buildHurdleReport(2, "SEIS", DEFAULT_TAX, CC).notes.join(" ")).toMatch(/clawed back/i);
    expect(buildHurdleReport(8, "SEIS", DEFAULT_TAX, CC).notes.join(" ")).not.toMatch(/clawed back/i);
  });

  it("charges carry only on profit above capital subscribed", () => {
    const seedrs = feesFor("seedrs");
    // 5x gross, 7.5% carry on the 4x of profit -> 4.7x proceeds on 0.5 at risk.
    expect(netMultiple(5, "SEIS", DEFAULT_TAX, seedrs)).toBeCloseTo(9.4, 6);
    // Below capital returned there is no profit, so carry must not bite.
    expect(netMultiple(0.5, "SEIS", DEFAULT_TAX, seedrs)).toBeCloseTo(netMultiple(0.5, "SEIS", DEFAULT_TAX, NO_FEES), 10);
  });

  it("breakeven is the money at risk, and always below the hurdle", () => {
    expect(breakevenGrossMultiple("SEIS", DEFAULT_TAX, CC)).toBeCloseTo(0.515, 6);
    expect(breakevenGrossMultiple("SEIS", DEFAULT_TAX, CC)).toBeLessThan(hurdleGrossMultiple(8, "SEIS", DEFAULT_TAX, CC));
  });

  it("rejects a negative gross multiple rather than returning nonsense", () => {
    expect(() => netMultiple(-1, "SEIS")).toThrow();
  });
});

describe("outcome distribution", () => {
  it("ships with the tilt disabled, so evidence claims nothing it has not earned", () => {
    expect(TILT_STRENGTH).toBe(0);
  });

  it("collapses to the baseline at zero tilt, whatever the evidence says", () => {
    const low = tiltDistribution(BASELINE_OUTCOMES, 10, 0);
    const high = tiltDistribution(BASELINE_OUTCOMES, 95, 0);
    expect(expectedGrossMultiple(low)).toBeCloseTo(expectedGrossMultiple(high), 10);
    expect(expectedGrossMultiple(low)).toBeCloseTo(expectedGrossMultiple(BASELINE_OUTCOMES), 10);
  });

  it("is monotone in the evidence score once a tilt is applied", () => {
    const scores = [10, 30, 50, 70, 90];
    const evs = scores.map((s) => expectedGrossMultiple(tiltDistribution(BASELINE_OUTCOMES, s, 0.35)));
    for (let i = 1; i < evs.length; i++) expect(evs[i]).toBeGreaterThan(evs[i - 1]);
  });

  it("always returns a normalised distribution", () => {
    for (const k of [0, 0.35, 0.85]) {
      const d = tiltDistribution(BASELINE_OUTCOMES, 80, k);
      const total = Object.values(d).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 10);
    }
  });

  it("values the wrapper correctly by applying tax bucket by bucket, not to the mean", () => {
    // Loss relief makes the payoff piecewise, so E[f(M)] != f(E[M]). The naive
    // version understates the wrapper, which is the error this guards.
    const bucketwise = expectedNetMultiple(BASELINE_OUTCOMES, "SEIS", DEFAULT_TAX, CC);
    const naive = netMultiple(expectedGrossMultiple(BASELINE_OUTCOMES), "SEIS", DEFAULT_TAX, CC);
    expect(bucketwise).toBeGreaterThan(naive);
  });

  it("swings the whole conclusion on the hand-typed tail probability", () => {
    // This is the sensitivity the hurdle page exists to expose. If this test
    // ever stops holding, the baseline has changed and the page copy is stale.
    const base = expectedGrossMultiple(withTailProbability(0.01));
    const thin = expectedGrossMultiple(withTailProbability(0.005));
    expect(base).toBeGreaterThan(thin);
    expect(base - thin).toBeGreaterThan(0.1);
    for (const p of [0, 0.005, 0.01, 0.02]) {
      const total = Object.values(withTailProbability(p)).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 10);
    }
  });
});

describe("portfolio construction under a power law", () => {
  it("is deterministic for a given seed, so a plan does not flicker on reload", () => {
    const a = simulatePortfolio(20, { trials: 2000, seed: 7 });
    const b = simulatePortfolio(20, { trials: 2000, seed: 7 });
    expect(a.medianMultiple).toBe(b.medianMultiple);
    expect(a.pBeatIndex).toBe(b.pBeatIndex);
  });

  it("raises the chance of holding a tail outcome as positions increase", () => {
    const counts = [1, 5, 20, 60];
    const tails = counts.map((n) => simulatePortfolio(n, { trials: 4000, seed: 3 }).pAnyTail);
    for (let i = 1; i < tails.length; i++) expect(tails[i]).toBeGreaterThan(tails[i - 1]);
  });

  it("narrows dispersion as positions increase", () => {
    const few = simulatePortfolio(3, { trials: 4000, seed: 11 });
    const many = simulatePortfolio(60, { trials: 4000, seed: 11 });
    expect(many.p90Multiple - many.p10Multiple).toBeLessThan(few.p90Multiple - few.p10Multiple);
  });

  it("shows a single position as the lottery ticket it is", () => {
    const one = simulatePortfolio(1, { trials: 8000, seed: 5 });
    // Median well below mean is the power law showing through.
    expect(one.medianMultiple).toBeLessThan(one.meanMultiple);
    expect(one.pBelowCapital).toBeGreaterThan(0.5);
  });

  it("plans a deployment and says plainly when the ticket is too large", () => {
    const plan = planDeployment(9000, 500, { trials: 2000 });
    expect(plan.positions).toBe(18);
    expect(plan.capitalAtRisk).toBeCloseTo(4500, 6);
    const single = planDeployment(1000, 1000, { trials: 2000 });
    expect(single.positions).toBe(1);
    expect(single.notes.join(" ")).toMatch(/not a strategy/i);
  });
});

describe("vetoes are the product", () => {
  it("rejects a UK raise with no relief, and only flags a US one", () => {
    const uk = checkVetoes(deal({ country: "UK", terms: { shareClass: "ordinary", taxWrapper: "NONE" } }));
    expect(uk.find((v) => v.code === "no_advance_assurance")?.hard).toBe(true);

    // The prototype hard-vetoed every unwrapped deal, which silently rejected
    // 100% of the US Reg CF flow its own SEC ingestion existed to discover.
    const us = checkVetoes(deal({ country: "US", terms: { shareClass: "ordinary", taxWrapper: "NONE" } }));
    expect(us.find((v) => v.code === "no_advance_assurance")).toBeUndefined();
    expect(us.find((v) => v.code === "unwrapped_jurisdiction")?.hard).toBe(false);
  });

  it("rejects delinquent registry filings and proposed strike-off", () => {
    const reg = {
      companyNumber: "12345678",
      filingHealth: "overdue" as const,
      accountsOverdue: true,
      confirmationStatementOverdue: false,
      outstandingCharges: 0,
      activeDirectors: 2,
      source: "companies_house" as const,
      fetchedAt: "2026-08-08",
    };
    expect(checkVetoes(deal({ registry: reg })).some((v) => v.code === "accounts_overdue" && v.hard)).toBe(true);
    expect(
      checkVetoes(deal({ registry: { ...reg, filingHealth: "strike_off_proposed", accountsOverdue: false } }))
        .some((v) => v.code === "strike_off_proposed" && v.hard),
    ).toBe(true);
  });

  it("flags secured debt without rejecting, because it is priced not fatal", () => {
    const v = checkVetoes(deal({
      registry: {
        companyNumber: "1", filingHealth: "current", accountsOverdue: false,
        confirmationStatementOverdue: false, outstandingCharges: 2, activeDirectors: 2,
        source: "companies_house", fetchedAt: "2026-08-08",
      },
    }));
    expect(v.find((x) => x.code === "secured_debt_ahead")?.hard).toBe(false);
  });

  it("rejects a repeat insolvency pattern but tolerates a single failure", () => {
    const twice = deal({ founders: [{ name: "R Founder", insolvencyCount: 2 }] });
    expect(checkVetoes(twice).some((v) => v.code === "director_insolvency_pattern" && v.hard)).toBe(true);
    const once = deal({ founders: [{ name: "R Founder", insolvencyCount: 1 }] });
    expect(checkVetoes(once).some((v) => v.code === "director_insolvency_pattern")).toBe(false);
  });

  it("rejects an extreme price, and exempts milestone-priced sectors", () => {
    const priced = { preMoney: 40_000_000, shareClass: "ordinary" as const, taxWrapper: "SEIS" as const };
    const rich = deal({ sector: "consumer_d2c", terms: priced, traction: { revenueLtm: 1_000_000 } });
    expect(revenueMultiple(rich)).toBeCloseTo(40, 6);
    expect(checkVetoes(rich).some((v) => v.code === "extreme_valuation" && v.hard)).toBe(true);

    const deeptech = deal({ sector: "deeptech", terms: priced, traction: { revenueLtm: 1_000_000 } });
    expect(checkVetoes(deeptech).some((v) => v.code === "extreme_valuation")).toBe(false);
  });

  it("rejects paying a control premium for no control", () => {
    const d = deal({
      terms: {
        shareClass: "ordinary_non_voting", taxWrapper: "SEIS", preMoney: 20_000_000,
        hasPreemptionRights: false, hasInformationRights: false,
      },
      traction: { revenueLtm: 1_000_000 },
    });
    expect(checkVetoes(d).some((v) => v.code === "no_rights_at_high_price" && v.hard)).toBe(true);
  });

  it("refuses to underwrite what it cannot see", () => {
    expect(opacityVeto(0.7)?.hard).toBe(true);
    expect(opacityVeto(0.5)).toBeNull();
  });
});

describe("evidence records absence rather than skipping it", () => {
  it("scores an opaque deal below a disclosed one on the same facts", () => {
    const bare = deal();
    const disclosed = deal({
      founders: [{ name: "A", insolvencyCount: 0, domainYears: 12, priorExit: true, fullTime: true }],
      traction: { revenueLtm: 400_000, revenueGrowthPct: 90, grossMarginPct: 70, runwayMonths: 15, ltvCacRatio: 3.5, churnPctMonthly: 1.5 },
      terms: {
        shareClass: "ordinary", taxWrapper: "SEIS", preMoney: 4_000_000,
        hasPreemptionRights: true, hasInformationRights: true, hasVotingRights: true,
        founderRetainedPct: 70, nomineeStructure: false,
      },
      registry: {
        companyNumber: "1", filingHealth: "current", accountsOverdue: false,
        confirmationStatementOverdue: false, outstandingCharges: 0, activeDirectors: 3,
        source: "companies_house", fetchedAt: "2026-08-08",
      },
      network: { hasProfessionalLead: true, namedCoInvestors: ["Seed Fund LP"] },
    });
    expect(opacityIndex(buildEvidence(bare))).toBeGreaterThan(opacityIndex(buildEvidence(disclosed)));
  });

  it("turns every gap into a research task, ranked by what the gap costs", () => {
    const tasks = researchTasks(buildEvidence(deal()));
    expect(tasks.length).toBeGreaterThan(3);
    expect(new Set(tasks).size).toBe(tasks.length);
    expect(tasks[0]).toMatch(/registry/i);
  });
});

describe("network value is a separate currency", () => {
  it("cannot lift a rejected deal", () => {
    const rejected = deal({
      country: "UK",
      terms: { shareClass: "ordinary", taxWrapper: "NONE" },
      network: { hasProfessionalLead: true, syndicateAccess: true, founderAccessible: true, namedCoInvestors: ["A", "B", "C"], sectorAdjacency: 1 },
    });
    const a = assessDeal(rejected);
    expect(a.network.band).toBe("HIGH");
    expect(a.verdict).toBe("REJECTED");
  });

  it("reports NONE rather than LOW when nothing is published", () => {
    expect(rateNetwork(deal()).band).toBe("NONE");
  });

  it("treats a very large crowd as diluting access, not proving it", () => {
    const small = rateNetwork(deal({ network: { investorCount: 200, hasProfessionalLead: true } }));
    const huge = rateNetwork(deal({ network: { investorCount: 5000, hasProfessionalLead: true } }));
    expect(huge.score).toBeLessThan(small.score);
  });
});

describe("the engine answers eligibility, not conviction", () => {
  it("passes a clean disclosed SEIS deal and shows the hurdle it must clear", () => {
    const clean = deal({
      founders: [{ name: "A", insolvencyCount: 0, domainYears: 10, priorFounder: true, fullTime: true }],
      traction: { revenueLtm: 500_000, revenueGrowthPct: 80, grossMarginPct: 72, runwayMonths: 14, ltvCacRatio: 3, churnPctMonthly: 1.2 },
      terms: {
        shareClass: "ordinary", taxWrapper: "SEIS", preMoney: 5_000_000,
        hasPreemptionRights: true, hasInformationRights: true, hasVotingRights: true,
        founderRetainedPct: 68, nomineeStructure: false,
      },
      registry: {
        companyNumber: "1", filingHealth: "current", accountsOverdue: false,
        confirmationStatementOverdue: false, outstandingCharges: 0, activeDirectors: 3,
        source: "companies_house", fetchedAt: "2026-08-08",
      },
      network: { hasProfessionalLead: true, namedCoInvestors: ["Seed Fund"] },
    });
    const a = assessDeal(clean);
    expect(a.verdict).toBe("ELIGIBLE");
    expect(a.hurdle.hurdleMultiple).toBeCloseTo(1.104, 3);
    expect(a.rationale.join(" ")).toMatch(/not that it is ranked/i);
  });

  it("separates 'we cannot see enough' from 'this is disqualified'", () => {
    const opaque = deal({ founders: [], terms: { shareClass: "unknown", taxWrapper: "SEIS" } });
    expect(assessDeal(opaque).verdict).toBe("INSUFFICIENT_DATA");
  });
});

describe("EDGAR discovery degrades without lying", () => {
  // Shapes taken verbatim from the live SEC feed, including the form-type
  // variants an invented fixture would not have contained. C/A broke the
  // original parser because the character class excluded the slash.
  const FEED = `<?xml version="1.0" encoding="ISO-8859-1"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Latest Filings - Sun, 09 Aug 2026 08:47:38 EDT</title>
  <entry>
    <title>C - EXAMPLE BREWING INC (0001889123) (Filer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1889123/000188912326000002/0001889123-26-000002-index.htm"/>
    <updated>2026-08-05T09:12:00-04:00</updated>
  </entry>
  <entry>
    <title>C/A - Finlete Funding, Inc. (0002010670) (Filer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/2010670/000187285626000271/0001872856-26-000271-index.htm"/>
    <updated>2026-08-07T16:18:34-04:00</updated>
  </entry>
  <entry>
    <title>C-U - Cytonics Corp (0001421744) (Filer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1421744/000142174426000003/0001421744-26-000003-index.htm"/>
    <updated>2026-08-06T11:00:00-04:00</updated>
  </entry>
  <entry>
    <title>C-AR - Nebraska Roadside LLC (0002141144) (Filer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/2141144/000214114426000001/0002141144-26-000001-index.htm"/>
    <updated>2026-08-06T09:30:00-04:00</updated>
  </entry>
</feed>`;

  it("parses live filings into listings, including hyphenated and slashed form types", () => {
    const { items, unparsed } = parseCurrentFeed(FEED);
    expect(items).toHaveLength(4);
    expect(unparsed).toEqual([]);
    expect(items[0].companyName).toBe("EXAMPLE BREWING INC");
    expect(items[0].cik).toBe("0001889123");
    expect(items[0].accessionNumber).toBe("0001889123-26-000002");
    expect(items[0].filingPath).toContain("edgar/data/1889123");
    // The amendment must not fall through to the raw-title fallback.
    expect(items[1].formType).toBe("C/A");
    expect(items[1].companyName).toBe("Finlete Funding, Inc.");
  });

  it("tells a raise apart from an annual report", () => {
    // A page headed "live raises" must not list a company that raised years ago
    // and is simply filing its yearly report.
    expect(classifyForm("C")).toBe("offering");
    expect(classifyForm("C/A")).toBe("amendment");
    expect(classifyForm("C-U")).toBe("update");
    expect(classifyForm("C-AR")).toBe("annual_report");
    expect(classifyForm("C-W")).toBe("withdrawal");

    const live = parseCurrentFeed(FEED).items.filter((i) => LIVE_RAISE_KINDS.includes(i.kind));
    expect(live.map((i) => i.formType)).toEqual(["C", "C/A"]);
  });

  it("records a malformed entry instead of throwing the batch away", () => {
    const broken = FEED.replace("<title>C - EXAMPLE BREWING INC (0001889123) (Filer)</title>", "<title>unrecognised shape</title>");
    const { items, unparsed } = parseCurrentFeed(broken);
    // The malformed entry is kept, not dropped: losing it silently would shrink
    // the batch with no signal that anything went wrong.
    expect(items).toHaveLength(4);
    expect(unparsed).toContain("title");
  });

  it("returns nothing rather than guessing when the feed is not XML", () => {
    expect(parseCurrentFeed("<html>blocked</html>").items).toEqual([]);
  });

  it("parses Form C offering terms", () => {
    const xml = `<?xml version="1.0"?><edgarSubmission>
      <nameOfIssuer>Example Brewing Inc</nameOfIssuer>
      <offeringAmount>250000.00</offeringAmount>
      <securityOfferedType>Common Stock</securityOfferedType>
      <deadlineDate>2026-12-31</deadlineDate>
    </edgarSubmission>`;
    const { offering } = parseFormC(xml);
    expect(offering.issuerName).toBe("Example Brewing Inc");
    expect(offering.offeringAmount).toBe(250000);
    expect(offering.deadline).toBe("2026-12-31");
  });

  it("leaves undisclosed fields undefined rather than filling them with defaults", () => {
    const { items } = parseCurrentFeed(FEED);
    const d = listingToDeal(items[0], { issuerName: "Example Brewing Inc", offeringAmount: 250000 });
    // Filling these with zeros would make an unknown look like a fact and would
    // silently suppress the research task that should be generated instead.
    expect(d.traction.revenueLtm).toBeUndefined();
    expect(d.terms.preMoney).toBeUndefined();
    expect(d.terms.taxWrapper).toBe("NONE");
    expect(d.country).toBe("US");
    // A US filing must be surfaced, not auto-rejected.
    expect(assessDeal(d).verdict).not.toBe("REJECTED");
  });
});

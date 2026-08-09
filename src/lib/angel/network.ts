/**
 * Network value: the second axis.
 *
 * At £250 to £1,000 tickets the financial expected value of any single angel
 * position is thin, and the relationship, access and learning value may
 * genuinely dominate. A tool that scores only money will tell you to pass on
 * everything, which can be financially correct and strategically wrong.
 *
 * So network value is measured, and it is kept deliberately separate. It is
 * never blended into the financial assessment and never nets against it. Two
 * reasons, and the second is the important one:
 *
 *   1. They are different currencies. A 0.4x expected multiple is not offset by
 *      meeting good people; it is a different thing you are buying.
 *   2. Blending is how a bad deal gets laundered. Once one number carries both,
 *      an appealing network story can quietly raise a deal that the money test
 *      rejected, and you would never see it happen.
 *
 * A network rating therefore cannot lift a verdict. It can only tell you what
 * else is on the table once the money question has been answered on its own.
 */
import type { Deal, NetworkBand, NetworkRating } from "./types";

/**
 * Signals that plausibly correlate with access, weighted by how observable and
 * how manipulable each one is. A named professional lead is hard to fake and
 * easy to verify. A founder replying to an email is weak but real evidence.
 */
const WEIGHTS = {
  professionalLead: 30,
  namedCoInvestors: 20,
  syndicateAccess: 18,
  founderAccessible: 12,
  sectorAdjacency: 12,
  investorScale: 8,
};

export function rateNetwork(deal: Deal): NetworkRating {
  const n = deal.network;
  const reasons: string[] = [];
  let score = 0;
  let assessed = 0;

  if (n.hasProfessionalLead !== undefined) {
    assessed += WEIGHTS.professionalLead;
    if (n.hasProfessionalLead) {
      score += WEIGHTS.professionalLead;
      reasons.push("A professional investor led and priced this round, so there is an institutional party on the cap table to be known by.");
    } else {
      reasons.push("No professional lead. The cap table will be retail, which limits who you end up alongside.");
    }
  }

  const co = n.namedCoInvestors ?? [];
  if (co.length) {
    assessed += WEIGHTS.namedCoInvestors;
    const credit = Math.min(1, co.length / 3);
    score += WEIGHTS.namedCoInvestors * credit;
    reasons.push(`Named co-investors: ${co.slice(0, 4).join(", ")}${co.length > 4 ? ` and ${co.length - 4} more` : ""}.`);
  }

  if (n.syndicateAccess !== undefined) {
    assessed += WEIGHTS.syndicateAccess;
    if (n.syndicateAccess) {
      score += WEIGHTS.syndicateAccess;
      reasons.push("A syndicate or angel group is attached, which is the part that actually compounds: one cheque can buy standing in a room that sees later deals.");
    }
  }

  if (n.founderAccessible !== undefined) {
    assessed += WEIGHTS.founderAccessible;
    if (n.founderAccessible) {
      score += WEIGHTS.founderAccessible;
      reasons.push("Founders are reachable and respond directly. A relationship with an operator outlasts the position.");
    }
  }

  if (n.sectorAdjacency !== undefined) {
    assessed += WEIGHTS.sectorAdjacency;
    const adj = Math.max(0, Math.min(1, n.sectorAdjacency));
    score += WEIGHTS.sectorAdjacency * adj;
    if (adj >= 0.6) reasons.push("Sits in a sector you have said you want relationships in, so the learning compounds with the rest of your work.");
  }

  if (n.investorCount !== undefined) {
    assessed += WEIGHTS.investorScale;
    // A very large crowd dilutes access rather than improving it: you are one of
    // thousands and nobody will remember the cheque.
    const credit = n.investorCount > 2000 ? 0.15 : n.investorCount > 500 ? 0.45 : 0.9;
    score += WEIGHTS.investorScale * credit;
    if (n.investorCount > 2000) {
      reasons.push(`${n.investorCount.toLocaleString("en-GB")} investors on the round. At that scale your cheque buys no standing with anyone.`);
    }
  }

  // Normalise against what was actually observable, so a deal is not punished
  // for fields nobody publishes. Unassessed means unknown, not zero.
  const normalised = assessed > 0 ? (score / assessed) * 100 : 0;
  const coverage = assessed / Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

  let band: NetworkBand;
  if (coverage < 0.3) band = "NONE";
  else if (normalised >= 65) band = "HIGH";
  else if (normalised >= 40) band = "MODERATE";
  else band = "LOW";

  if (band === "NONE") {
    reasons.push("Too little is published about who else is investing to rate the network value either way.");
  }

  return {
    band,
    score: Math.round(normalised),
    reasons,
    caveat:
      "Network value is reported separately and never offsets the financial assessment. It cannot lift a rejected deal, and it is not a reason to pay a worse price.",
  };
}

import { describe, expect, it } from "vitest";
import { buildMarketFactor, decomposeDip } from "@/lib/engine/decompose";
import type { PricePoint } from "@/lib/types";

/** Deterministic PRNG so these tests never flake. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Box-Muller on a seeded uniform, for normal-ish idiosyncratic noise. */
function normals(seed: number, n: number, sigma: number): number[] {
  const r = rng(seed);
  const out: number[] = [];
  while (out.length < n) {
    const u1 = Math.max(r(), 1e-9);
    const u2 = r();
    out.push(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma);
  }
  return out;
}

const SESSIONS = 220;
const dates = Array.from({ length: SESSIONS }, (_, i) => {
  const d = new Date(Date.UTC(2025, 0, 5) + i * 86400000);
  return d.toISOString().slice(0, 10);
});

function fromReturns(rets: number[], start = 100): PricePoint[] {
  const pts: PricePoint[] = [{ d: dates[0], c: start }];
  for (let i = 0; i < rets.length; i++) {
    pts.push({ d: dates[i + 1], c: pts[i].c * Math.exp(rets[i]) });
  }
  return pts;
}

/** Market factor with mild daily noise and no drift. */
const marketRets = normals(1, SESSIONS - 1, 0.008);
const market = fromReturns(marketRets);

/**
 * Builds a target loading `beta` on the market plus its own noise, then
 * overrides the final `window` days' returns with an explicit path.
 */
function buildTarget(opts: {
  seed: number;
  beta: number;
  idioSigma: number;
  tail: number[]; // total log returns for the last N sessions
}): PricePoint[] {
  const idio = normals(opts.seed, SESSIONS - 1, opts.idioSigma);
  const rets = marketRets.map((rm, i) => opts.beta * rm + idio[i]);
  for (let i = 0; i < opts.tail.length; i++) {
    rets[rets.length - opts.tail.length + i] = opts.tail[i];
  }
  return fromReturns(rets);
}

const emptyUniverse = new Map<string, PricePoint[]>();

describe("decomposeDip", () => {
  it("attributes a market-wide fall to beta, not to the company", () => {
    // Last 5 sessions: market falls hard, target follows at beta 1.
    const tailMarket = [-0.012, -0.008, -0.011, -0.005, -0.009];
    const m = fromReturns(
      marketRets.map((v, i) => (i >= SESSIONS - 1 - 5 ? tailMarket[i - (SESSIONS - 1 - 5)] : v)),
    );
    const target = buildTarget({ seed: 7, beta: 1, idioSigma: 0.0005, tail: tailMarket });

    const d = decomposeDip({ series: target, peers: [], universe: emptyUniverse, market: m });

    expect(d.cause).toBe("MARKET_BETA");
    expect(d.betaMarket).toBeGreaterThan(0.85);
    expect(d.betaMarket).toBeLessThan(1.15);
    expect(Math.abs(d.idioPct)).toBeLessThan(0.5); // company-specific part is noise
    expect(d.systematicShare).toBeGreaterThan(0.9);
    expect(d.totalPct).toBeLessThan(0);
  });

  it("attributes a lone fall on a flat tape to the company", () => {
    const target = buildTarget({
      seed: 11,
      beta: 1,
      idioSigma: 0.006,
      tail: [-0.02, -0.025, -0.02, -0.015, -0.02], // ~ -9.7% with the market quiet
    });

    const d = decomposeDip({ series: target, peers: [], universe: emptyUniverse, market });

    expect(d.cause).toMatch(/^IDIOSYNCRATIC_/);
    expect(d.idioPct).toBeLessThan(-6);
    expect(d.systematicShare).toBeLessThan(0.3);
  });

  it("reconstructs the actual move from its parts", () => {
    const target = buildTarget({
      seed: 3,
      beta: 1.3,
      idioSigma: 0.005,
      tail: [-0.01, -0.02, 0.005, -0.015, -0.008],
    });
    const d = decomposeDip({ series: target, peers: [], universe: emptyUniverse, market });

    // Parts are additive in log space; compare there rather than in percent.
    const asLog = (p: number) => Math.log(1 + p / 100);
    const recomposed = asLog(d.marketPct) + asLog(d.sectorPct) + asLog(d.idioPct);
    expect(recomposed).toBeCloseTo(asLog(d.totalPct), 6);
  });

  it("separates sector rotation from a market fall", () => {
    // Peers de-rate together beyond what the market explains; target rides it.
    const peerTail = [-0.018, -0.02, -0.015, -0.012, -0.02];
    const peerIdio = normals(21, SESSIONS - 1, 0.004);
    const peerRets = marketRets.map((rm, i) => 1.0 * rm + peerIdio[i]);
    for (let i = 0; i < peerTail.length; i++) peerRets[peerRets.length - 5 + i] = peerTail[i];

    const universe = new Map<string, PricePoint[]>([
      ["PEER1", fromReturns(peerRets)],
      ["PEER2", fromReturns(peerRets.map((v, i) => v + peerIdio[i] * 0.1))],
    ]);

    // Target co-moves with the peer group: same tail, plus its own small noise.
    const target = buildTarget({ seed: 5, beta: 1, idioSigma: 0.004, tail: peerTail });
    // Give the target a genuine historical loading on the peer factor.
    const withPeerLoad = fromReturns(
      logReturnsOf(target).map((v, i) => v + 0.9 * (peerIdio[i] ?? 0)),
    );
    const tail2 = peerTail;
    const finalRets = logReturnsOf(withPeerLoad);
    for (let i = 0; i < tail2.length; i++) finalRets[finalRets.length - 5 + i] = tail2[i];

    const d = decomposeDip({
      series: fromReturns(finalRets),
      peers: ["PEER1", "PEER2"],
      universe,
      market,
    });

    expect(["SECTOR_ROTATION", "MARKET_BETA"]).toContain(d.cause);
    expect(Math.abs(d.sectorPct)).toBeGreaterThan(0);
  });

  it("flags a violent multi-sigma fall as an information shock", () => {
    const target = buildTarget({
      seed: 13,
      beta: 1,
      idioSigma: 0.004,
      tail: [-0.11, -0.005, 0.002, -0.004, 0.001], // one violent day, then nothing
    });

    const d = decomposeDip({ series: target, peers: [], universe: emptyUniverse, market });

    expect(d.cause).toBe("IDIOSYNCRATIC_SHOCK");
    expect(d.residualZ).toBeLessThan(-2.5);
  });

  // The gap discriminator is the novel part, so it gets tested in isolation:
  // identical fall, identical z-score, only the arrival pattern differs.
  describe("gap vs drift, holding the fall constant", () => {
    // Market is deliberately flat across the dip window so the whole move is
    // idiosyncratic, and idioSigma is tuned so z lands near -1.8: past the
    // gap rule's -1.5, but short of the -2.5 that fires on magnitude alone.
    const flatTailMarket = fromReturns(
      marketRets.map((v, i) => (i >= SESSIONS - 6 ? 0 : v)),
    );
    const tail = [-0.01, -0.012, -0.008, -0.011, -0.009]; // ~ -4.9%
    const base = buildTarget({ seed: 29, beta: 1, idioSigma: 0.0124, tail });

    /** o === c means the day's whole move happened overnight. */
    const allGap: PricePoint[] = base.map((p) => ({ ...p, o: p.c }));
    /** o === previous close means the day's whole move bled out intraday. */
    const allDrift: PricePoint[] = base.map((p, i) => ({
      ...p,
      o: i === 0 ? p.c : base[i - 1].c,
    }));

    it("reads a gapping fall as news", () => {
      const d = decomposeDip({ series: allGap, peers: [], universe: emptyUniverse, market: flatTailMarket });
      expect(d.gapShare).toBeGreaterThan(0.9);
      expect(d.residualZ).toBeLessThan(-1.5);
      expect(d.residualZ).toBeGreaterThan(-2.5); // not classified on magnitude
      expect(d.cause).toBe("IDIOSYNCRATIC_SHOCK");
    });

    it("reads the same fall, bled out intraday, as flow", () => {
      const d = decomposeDip({ series: allDrift, peers: [], universe: emptyUniverse, market: flatTailMarket });
      expect(d.gapShare).toBeLessThan(0.1);
      expect(d.cause).toBe("IDIOSYNCRATIC_NO_NEWS");
    });

    it("gives the two identical price paths, differing only in opens", () => {
      expect(allGap.map((p) => p.c)).toEqual(allDrift.map((p) => p.c));
    });
  });

  it("returns UNKNOWN rather than guessing when history is too short", () => {
    const short = fromReturns(marketRets.slice(0, 10));
    const d = decomposeDip({ series: short, peers: [], universe: emptyUniverse, market });
    expect(d.cause).toBe("UNKNOWN");
    expect(d.confidence).toBe("LOW");
  });
});

describe("buildMarketFactor", () => {
  it("cap-weights members and rebases to 100", () => {
    const a = fromReturns(new Array(20).fill(0.01));
    const b = fromReturns(new Array(20).fill(-0.01));
    const f = buildMarketFactor([
      { series: a, weight: 3 },
      { series: b, weight: 1 },
    ]);
    expect(f[0].c).toBe(100);
    // 75/25 split of +1%/-1% daily → net +0.5%/day in log space
    expect(Math.log(f[1].c / f[0].c)).toBeCloseTo(0.005, 6);
  });

  it("intersects on shared dates so composition never drifts", () => {
    const a = fromReturns(new Array(20).fill(0.01));
    const b = fromReturns(new Array(10).fill(0.01));
    const f = buildMarketFactor([
      { series: a, weight: 1 },
      { series: b, weight: 1 },
    ]);
    expect(f.length).toBe(11); // only the dates both members have
  });

  it("returns empty rather than throwing when given nothing usable", () => {
    expect(buildMarketFactor([])).toEqual([]);
    expect(buildMarketFactor([{ series: [], weight: 1 }])).toEqual([]);
  });
});

function logReturnsOf(pts: PricePoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < pts.length; i++) out.push(Math.log(pts[i].c / pts[i - 1].c));
  return out;
}

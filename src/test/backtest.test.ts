import { describe, expect, it, vi } from "vitest";
import {
  formatReport,
  metricsFor,
  metricsByCause,
  runBacktest,
  type Observation,
  type TickerHistory,
} from "@/backtest/harness";
import { LIVE_SESSION_WINDOW } from "@/lib/types";
import { analyze } from "@/lib/engine/analyst";

// Passthrough spy: behaviour is unchanged, but it records what the harness
// actually hands the scoring engine so the window invariant can be asserted.
vi.mock("@/lib/engine/analyst", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/engine/analyst")>();
  return { ...actual, analyze: vi.fn(actual.analyze) };
});

/** Builds observations at a single horizon from (score, forwardReturn) pairs. */
function obs(pairs: [number, number][], horizon = 5): Observation[] {
  return pairs.map(([s, f], i) => ({
    ticker: `T${i}`,
    date: "2025-01-01",
    signalScore: s,
    cause: "MARKET_BETA",
    dipPctWeek: -5,
    forward: { [horizon]: f },
  }));
}

describe("metrics measurement (the harness must measure a known relationship correctly)", () => {
  it("reports IC near +1 for a perfectly monotonic score→return relationship", () => {
    const pairs: [number, number][] = Array.from({ length: 40 }, (_, i) => [i, i * 0.5]);
    const m = metricsFor(obs(pairs), 5);
    expect(m.ic).toBeGreaterThan(0.99);
    expect(m.quintileSpread).toBeGreaterThan(0);
    expect(m.topQuintileMean).toBeGreaterThan(m.bottomQuintileMean);
  });

  it("reports IC near -1 when the score is perfectly wrong", () => {
    const pairs: [number, number][] = Array.from({ length: 40 }, (_, i) => [i, -i * 0.5]);
    const m = metricsFor(obs(pairs), 5);
    expect(m.ic).toBeLessThan(-0.99);
    expect(m.quintileSpread).toBeLessThan(0);
  });

  it("reports IC near 0 for a score unrelated to returns", () => {
    // Deterministic pseudo-noise, decorrelated from the score by construction.
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pairs: [number, number][] = Array.from({ length: 200 }, (_, i) => [i, rand() * 100 - 50]);
    const m = metricsFor(obs(pairs), 5);
    expect(Math.abs(m.ic)).toBeLessThan(0.2);
  });

  it("computes the high-score hit rate correctly", () => {
    // Scores >= 50: three of them, two positive forward returns → 2/3.
    const pairs: [number, number][] = [
      [60, 5],
      [70, 8],
      [55, -3],
      [40, 9], // excluded from hit rate (score < 50)
      [30, 9],
    ];
    const m = metricsFor(obs(pairs), 5);
    expect(m.hitRateHighScore).toBeCloseTo(2 / 3, 6);
  });

  it("groups mean forward return by cause", () => {
    const observations: Observation[] = [
      { ticker: "A", date: "d", signalScore: 70, cause: "MARKET_BETA", dipPctWeek: -4, forward: { 5: 4 } },
      { ticker: "B", date: "d", signalScore: 65, cause: "MARKET_BETA", dipPctWeek: -4, forward: { 5: 6 } },
      { ticker: "C", date: "d", signalScore: 20, cause: "IDIOSYNCRATIC_SHOCK", dipPctWeek: -9, forward: { 5: -8 } },
    ];
    const byCause = metricsByCause(observations, [5]);
    const beta = byCause.find((c) => c.cause === "MARKET_BETA")!;
    const shock = byCause.find((c) => c.cause === "IDIOSYNCRATIC_SHOCK")!;
    expect(beta.meanForward[5]).toBeCloseTo(5, 6);
    expect(shock.meanForward[5]).toBeCloseTo(-8, 6);
  });
});

describe("walk-forward has no look-ahead", () => {
  // Three correlated names so the market factor and peer basket are non-trivial.
  function makeHistory(ticker: string, seed: number, days = 260): TickerHistory {
    let s = seed;
    const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5);
    const bars: TickerHistory["bars"] = [];
    let price = 100;
    for (let i = 0; i < days; i++) {
      // Shared drift + idiosyncratic noise; inject a sharp dip at day 200.
      const shock = i === 200 ? -0.08 : 0;
      price *= 1 + 0.0002 + rand() * 0.01 + shock;
      const d = new Date(Date.UTC(2024, 0, 1) + i * 86400000).toISOString().slice(0, 10);
      bars.push({ d, c: Number(price.toFixed(4)), o: Number(price.toFixed(4)), v: 1_000_000 });
    }
    return { ticker, bars, marketCapB: 100 };
  }

  const histories = [makeHistory("AAA", 1), makeHistory("BBB", 7), makeHistory("CCC", 13)];

  it("computes forward returns from genuine future closes, not the as-of price", () => {
    const config = { horizons: [5], minHistory: 150, requireDip: true };
    const observations = runBacktest(histories, config);
    expect(observations.length).toBeGreaterThan(0);

    // Independently recompute one observation's forward return from raw bars.
    const o = observations[0];
    const h = histories.find((x) => x.ticker === o.ticker)!;
    const dates = [...new Set(histories.flatMap((x) => x.bars.map((b) => b.d)))].sort();
    const di = dates.indexOf(o.date);
    const asOfClose = h.bars.find((b) => b.d === o.date)!.c;
    const futureClose = h.bars.find((b) => b.d === dates[di + 5])!.c;
    const expected = (futureClose / asOfClose - 1) * 100;
    expect(o.forward[5]).toBeCloseTo(expected, 6);
  });

  it("only emits observations on genuine dip dates", () => {
    const observations = runBacktest(histories, { horizons: [5], minHistory: 150, requireDip: true });
    for (const o of observations) expect(o.dipPctWeek).toBeLessThan(0);
  });

  it("never scores a longer series than the live app does", () => {
    // Histories far longer than the live window, so an unsliced harness would
    // hand analyze() a series that grows on every step.
    const long = [makeHistory("AAA", 3, 760), makeHistory("BBB", 9, 760), makeHistory("CCC", 21, 760)];
    vi.mocked(analyze).mockClear();
    const observations = runBacktest(long, {
      horizons: [5],
      minHistory: LIVE_SESSION_WINDOW,
      requireDip: true,
    });
    expect(observations.length).toBeGreaterThan(0);

    const lengths = vi.mocked(analyze).mock.calls.map((c) => c[1]?.length ?? 0);
    expect(lengths.length).toBeGreaterThan(0);
    // Nothing longer than the live window...
    expect(Math.max(...lengths)).toBe(LIVE_SESSION_WINDOW);
    // ...and the slice genuinely engaged rather than the histories being short.
    expect(Math.min(...lengths)).toBe(LIVE_SESSION_WINDOW);
  });

  it("produces a readable report without throwing", () => {
    const observations = runBacktest(histories, { horizons: [5, 20], minHistory: 150, requireDip: true });
    const report = formatReport(observations, { horizons: [5, 20], minHistory: 150, requireDip: true });
    expect(report).toContain("SIGNAL SCORE WALK-FORWARD BACKTEST");
    expect(report).toContain("survivorship");
  });
});

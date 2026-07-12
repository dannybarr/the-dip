import { describe, expect, it } from "vitest";
import { SIMULATED_UNIVERSE } from "@/data/simulated";
import { analyze } from "@/lib/engine/analyst";
import { buildSeries } from "@/lib/engine/series";
import { rsi14 } from "@/lib/engine/indicators";
import { PILLAR_META, type PillarKey } from "@/lib/types";

describe("price series model", () => {
  it("terminates exactly at the quoted price with the quoted daily move", () => {
    for (const stock of SIMULATED_UNIVERSE) {
      const series = buildSeries(stock);
      const last = series[series.length - 1].c;
      const prev = series[series.length - 2].c;
      expect(last).toBeCloseTo(stock.price, 1);
      expect((last / prev - 1) * 100).toBeCloseTo(stock.dipPctDay, 0);
    }
  });

  it("reproduces the weekly dip over the final five sessions", () => {
    for (const stock of SIMULATED_UNIVERSE) {
      const series = buildSeries(stock);
      const preDip = series[series.length - 6].c;
      const weekMove = (series[series.length - 1].c / preDip - 1) * 100;
      expect(weekMove).toBeCloseTo(stock.dipPctWeek, 0);
    }
  });

  it("is deterministic across runs", () => {
    const a = buildSeries(SIMULATED_UNIVERSE[0]);
    const b = buildSeries(SIMULATED_UNIVERSE[0]);
    expect(a).toEqual(b);
  });
});

describe("indicators", () => {
  it("marks a persistent decline as oversold", () => {
    const falling = Array.from({ length: 40 }, (_, i) => 100 - i);
    expect(rsi14(falling)).toBeLessThan(10);
    const rising = Array.from({ length: 40 }, (_, i) => 100 + i);
    expect(rsi14(rising)).toBeGreaterThan(90);
  });
});

describe("analyst engine", () => {
  const analyses = SIMULATED_UNIVERSE.map(analyze);

  it("keeps pillar weights summing to 1", () => {
    const total = (Object.keys(PILLAR_META) as PillarKey[]).reduce((s, k) => s + PILLAR_META[k].weight, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("bounds all scores to 0–100", () => {
    for (const a of analyses) {
      expect(a.dipScore).toBeGreaterThanOrEqual(0);
      expect(a.dipScore).toBeLessThanOrEqual(100);
      for (const p of a.pillars) {
        expect(p.score).toBeGreaterThanOrEqual(0);
        expect(p.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("never issues a buy-side verdict on structurally impaired names", () => {
    for (const a of analyses) {
      const structural = a.stock.catalyst.severity >= 8 && a.stock.catalyst.transience <= 3;
      if (structural) {
        expect(["FALLING_KNIFE", "AVOID"]).toContain(a.verdict);
      }
    }
  });

  it("produces a coherent trade plan: stop < entry <= targets", () => {
    for (const a of analyses) {
      expect(a.plan.stop).toBeLessThan(a.plan.entryLow);
      expect(a.plan.target1).toBeGreaterThan(a.stock.price);
      expect(a.plan.target2).toBeGreaterThanOrEqual(a.plan.target1 * 0.98);
    }
  });

  it("assigns zero size to knives and avoids", () => {
    for (const a of analyses) {
      if (a.verdict === "FALLING_KNIFE" || a.verdict === "AVOID") {
        expect(a.plan.suggestedSizePct).toBe(0);
      } else if (a.verdict === "BUY_THE_DIP") {
        expect(a.plan.suggestedSizePct).toBeGreaterThan(0);
      }
    }
  });

  it("spreads verdicts across the spectrum (the engine discriminates)", () => {
    const verdicts = new Set(analyses.map((a) => a.verdict));
    expect(verdicts.size).toBeGreaterThanOrEqual(4);
  });

  it("flags every simulated name as a genuine dip", () => {
    for (const a of analyses) expect(a.isDip).toBe(true);
  });

  it("treats a name that is up on the week as not a dip", () => {
    const rallying = { ...SIMULATED_UNIVERSE[0], dipPctDay: 1.2, dipPctWeek: 8.5 };
    const a = analyze(rallying);
    expect(a.isDip).toBe(false);
    expect(a.thesis).toMatch(/not in a dip/i);
  });
});

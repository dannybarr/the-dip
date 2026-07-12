import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FmpAccessError, getProfile } from "@/lib/engine/providers/fmp";
import type { FmpEod } from "@/lib/engine/providers/fmp";
import { buildLiveUniverse } from "@/lib/engine/live";
import { COVERAGE } from "@/data/coverage";

/**
 * Unit tests for the live data layer, driven entirely by a mocked global
 * fetch — no real network calls. Covers:
 *  - fmp.ts: fmpGet's error branches (401/403 auth, 429 rate limit, and a
 *    200 response carrying an embedded FMP error body).
 *  - live.ts: buildOne/buildLiveUniverse behavior for a missing profile, a
 *    too-short price history, and num()'s fallback when FMP fields are
 *    null/undefined.
 */

function jsonRes(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/** Newest-first daily bars, matching FMP's real ordering (live.ts reverses
 *  them via getDailyHistory before use). */
function makeEodNewestFirst(n: number): FmpEod[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(2026, 0, 1);
    d.setDate(d.getDate() - i);
    return {
      date: d.toISOString().slice(0, 10),
      open: 100,
      high: 101,
      low: 99,
      close: 100 + (n - i) * 0.1,
      volume: 1_000_000 + i,
    };
  });
}

function routedFetch(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input.toString());
  const path = url.pathname.replace(/^\/stable\//, "");
  const symbol = url.searchParams.get("symbol") ?? "";

  if (path === "profile") {
    if (symbol === "TEST401") return Promise.resolve(jsonRes({}, 401));
    if (symbol === "TEST403") return Promise.resolve(jsonRes({}, 403));
    if (symbol === "TEST429") return Promise.resolve(jsonRes({}, 429));
    if (symbol === "TESTERR") return Promise.resolve(jsonRes({ "Error Message": "Something went wrong" }));
    if (symbol === "TESTPLAN")
      return Promise.resolve(jsonRes({ "Error Message": "This endpoint requires a subscription upgrade" }));
    // MSFT: FMP returns an empty array for an unrecognized/unsupported
    // symbol on the free tier — simulates a missing profile.
    if (symbol === "MSFT") return Promise.resolve(jsonRes([]));
    // AMZN: profile row present but every numeric field is null, the shape
    // a real "field not populated" FMP response takes.
    if (symbol === "AMZN")
      return Promise.resolve(
        jsonRes([
          {
            symbol,
            companyName: "Amazon Test Co",
            price: null,
            marketCap: null,
            beta: null,
            volume: null,
            averageVolume: null,
            changePercentage: null,
            sector: "Consumer Cyclical",
            industry: "Internet Retail",
            exchange: "NASDAQ",
          },
        ]),
      );
    return Promise.resolve(
      jsonRes([
        {
          symbol,
          companyName: `${symbol} Test Co`,
          price: 123.45,
          marketCap: 2_000_000_000,
          beta: 1.2,
          volume: 5_000_000,
          averageVolume: 4_000_000,
          changePercentage: -2.1,
          sector: "Technology",
          industry: "Software",
          exchange: "NASDAQ",
        },
      ]),
    );
  }

  if (path === "historical-price-eod/full") {
    if (symbol === "GOOGL") return Promise.resolve(jsonRes(makeEodNewestFirst(10))); // < 60 sessions
    return Promise.resolve(jsonRes(makeEodNewestFirst(70)));
  }

  if (path === "ratios-ttm") {
    if (symbol === "AMZN") return Promise.resolve(jsonRes([])); // no row -> undefined
    return Promise.resolve(
      jsonRes([{ grossProfitMarginTTM: 0.5, operatingProfitMarginTTM: 0.2, priceToEarningsRatioTTM: 18 }]),
    );
  }

  if (path === "key-metrics-ttm") {
    if (symbol === "AMZN") return Promise.resolve(jsonRes([]));
    return Promise.resolve(
      jsonRes([
        { evToEBITDATTM: 14, netDebtToEBITDATTM: -0.5, returnOnInvestedCapitalTTM: 0.18, freeCashFlowYieldTTM: 0.04 },
      ]),
    );
  }

  if (path === "sector-pe-snapshot") return Promise.resolve(jsonRes([{ pe: 20 }]));

  return Promise.resolve(jsonRes([], 404));
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(routedFetch));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fmp provider — fmpGet error branches", () => {
  it("throws FmpAccessError on a 401 (auth/plan error)", async () => {
    await expect(getProfile("TEST401")).rejects.toBeInstanceOf(FmpAccessError);
  });

  it("throws FmpAccessError on a 403 (auth/plan error)", async () => {
    await expect(getProfile("TEST403")).rejects.toBeInstanceOf(FmpAccessError);
  });

  it("throws FmpAccessError with a rate-limit message on a 429", async () => {
    await expect(getProfile("TEST429")).rejects.toBeInstanceOf(FmpAccessError);
    await expect(getProfile("TEST429")).rejects.toThrow(/rate limit/i);
  });

  it("throws a plain error when FMP embeds an error message in a 200 response", async () => {
    await expect(getProfile("TESTERR")).rejects.toThrow(/Something went wrong/);
    await expect(getProfile("TESTERR")).rejects.not.toBeInstanceOf(FmpAccessError);
  });

  it("throws FmpAccessError when the embedded error message signals a plan restriction", async () => {
    await expect(getProfile("TESTPLAN")).rejects.toBeInstanceOf(FmpAccessError);
  });
});

describe("live.ts — buildLiveUniverse / buildOne", () => {
  it("drops a name whose price history has fewer than 60 sessions", async () => {
    const built = await buildLiveUniverse();
    expect(built.some((s) => s.input.ticker === "GOOGL")).toBe(false);
  });

  it("falls back to the coverage overlay when the profile is missing", async () => {
    const built = await buildLiveUniverse();
    const msft = built.find((s) => s.input.ticker === "MSFT");
    const overlay = COVERAGE.find((c) => c.ticker === "MSFT")!;
    expect(msft).toBeDefined();
    expect(msft!.input.name).toBe(overlay.name);
    expect(msft!.input.industry).toBe(overlay.industry);
    expect(msft!.input.marketCapB).toBe(0);
    expect(msft!.input.beta).toBe(1);
  });

  it("falls back to safe defaults (num()) when profile/ratio/metric fields are null", async () => {
    const built = await buildLiveUniverse();
    const amzn = built.find((s) => s.input.ticker === "AMZN");
    const overlay = COVERAGE.find((c) => c.ticker === "AMZN")!;
    expect(amzn).toBeDefined();
    expect(amzn!.input.beta).toBe(1);
    expect(amzn!.input.volumeRatio).toBe(1);
    expect(amzn!.input.fundamentals.peForward).toBe(overlay.pe5yAvg);
    expect(amzn!.input.fundamentals.evEbitda).toBe(12);
    expect(amzn!.input.fundamentals.grossMarginPct).toBe(0);
    expect(amzn!.input.fundamentals.netDebtToEbitda).toBe(0);
    expect(Number.isFinite(amzn!.input.price)).toBe(true);
    expect(Number.isFinite(amzn!.input.dipPctDay)).toBe(true);
  });

  it("builds a fully populated input for a normal covered name", async () => {
    const built = await buildLiveUniverse();
    const aapl = built.find((s) => s.input.ticker === "AAPL");
    expect(aapl).toBeDefined();
    expect(aapl!.input.price).toBe(123.45);
    expect(aapl!.input.fundamentals.grossMarginPct).toBeCloseTo(50, 5);
    expect(aapl!.series.length).toBeGreaterThanOrEqual(60);
  });
});

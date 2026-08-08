/**
 * Backtest runner. Two stages, so the API budget is spent at most once:
 *
 *   1. Fetch full daily history for every covered name and cache it to disk
 *      (data/backtest-cache.json). Skipped automatically if the cache exists.
 *   2. Run the walk-forward harness over the cache and print the report.
 *
 * Run with the project's TS runner (no build step needed):
 *   npx vite-node src/backtest/run.ts
 *   npx vite-node src/backtest/run.ts --refresh   # force a re-fetch
 *
 * The FMP key is read from .env.local (VITE_FMP_API_KEY). On the free tier the
 * per-symbol history endpoint is limited to the covered allow-list and ~250
 * calls/day, which is why the result is cached; 24 names is one cheap pass.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COVERAGE } from "@/data/coverage";
import {
  runBacktest,
  formatReport,
  DEFAULT_CONFIG,
  type TickerHistory,
} from "./harness";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const CACHE = resolve(ROOT, "data/backtest-cache.json");
const ENV = resolve(ROOT, ".env.local");
const BASE = "https://financialmodelingprep.com/stable";

function apiKey(): string {
  const raw = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
  const key = raw.match(/VITE_FMP_API_KEY\s*=\s*(.+)/)?.[1]?.trim();
  if (!key) throw new Error("VITE_FMP_API_KEY not found in .env.local");
  return key;
}

interface FmpBar { date: string; open: number; close: number; volume: number }

async function fetchHistory(ticker: string, key: string): Promise<TickerHistory | null> {
  const url = `${BASE}/historical-price-eod/full?symbol=${ticker}&apikey=${key}`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok || /legacy|subscription|restricted|upgrade|special endpoint|limit reach/i.test(text)) {
    console.error(`  ${ticker}: unavailable (${res.status}) ${text.slice(0, 80).replace(/\s+/g, " ")}`);
    return null;
  }
  let rows: FmpBar[];
  try {
    const j = JSON.parse(text);
    rows = Array.isArray(j) ? j : j?.historical ?? [];
  } catch {
    console.error(`  ${ticker}: non-JSON response`);
    return null;
  }
  if (!rows.length) return null;
  const asc = [...rows].reverse(); // FMP returns newest-first
  return {
    ticker,
    marketCapB: 0, // caps not needed historically; equal-weight market factor is used
    bars: asc.map((r) => ({ d: r.date, c: r.close, o: r.open, v: r.volume })),
  };
}

async function buildCache(): Promise<TickerHistory[]> {
  const key = apiKey();
  console.log(`Fetching history for ${COVERAGE.length} names (one-time, cached)...`);
  const out: TickerHistory[] = [];
  for (const c of COVERAGE) {
    const h = await fetchHistory(c.ticker, key);
    if (h && h.bars.length >= DEFAULT_CONFIG.minHistory) {
      out.push(h);
      console.log(`  ${c.ticker}: ${h.bars.length} sessions`);
    }
  }
  if (out.length === 0) {
    throw new Error(
      "No history fetched. The free-tier daily quota is likely exhausted, or the key lacks history access. Try again after the quota resets.",
    );
  }
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(out), "utf8");
  console.log(`Cached ${out.length} names → ${CACHE}\n`);
  return out;
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  let histories: TickerHistory[];

  if (!refresh && existsSync(CACHE)) {
    histories = JSON.parse(readFileSync(CACHE, "utf8"));
    console.log(`Loaded ${histories.length} names from cache (${CACHE}). Use --refresh to re-fetch.\n`);
  } else {
    histories = await buildCache();
  }

  const observations = runBacktest(histories, DEFAULT_CONFIG);
  console.log(formatReport(observations, DEFAULT_CONFIG));
}

main().catch((err) => {
  console.error("\nBacktest failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

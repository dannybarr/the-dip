/**
 * Financial Modeling Prep (FMP) provider — "stable" endpoint client.
 *
 * The free tier supplies everything The Dip's engine needs for its quantitative
 * layer: real quotes, daily OHLC history (for RSI / ATR / SMA / drawdown /
 * support), TTM ratios and key metrics, and a live sector P/E snapshot. The
 * qualitative pillars (catalyst read, moat, balance-sheet rating, bull/bear,
 * desk note) are analyst judgments and live in the coverage overlay, not here.
 *
 * Key handling — two paths:
 *   • Local dev (`npm run dev`): calls FMP directly using VITE_FMP_API_KEY from
 *     .env.local. Convenient, and the key never leaves your machine.
 *   • Production (the deployed site): calls the `/api/fmp` serverless proxy,
 *     which holds the key server-side. The key is never in the browser bundle.
 * Absent key / failed proxy → callers fall back to the simulated snapshot.
 * Responses are cached in localStorage so a session stays inside the budget.
 */

const BASE = "https://financialmodelingprep.com/stable";

// In a production build we route every request through the serverless proxy so
// the API key stays server-side. In dev we hit FMP directly with the local key.
const USE_PROXY: boolean = import.meta.env.PROD;

export const FMP_KEY: string | undefined = import.meta.env.VITE_FMP_API_KEY;

// Live data is available when the proxy is in play (production) or when a local
// key is present (dev). In production the proxy owns the key, so this is true
// even though the browser has none; a missing server key fails gracefully to
// the simulated snapshot via the callers' existing error handling.
export const hasFmpKey = (): boolean =>
  USE_PROXY || (typeof FMP_KEY === "string" && FMP_KEY.length > 0);

/** Builds the request URL: the proxy in production, FMP direct in dev. */
function requestUrl(path: string, params: Record<string, string>): string {
  if (USE_PROXY) {
    const qs = new URLSearchParams({ ...params, path }).toString();
    return `/api/fmp?${qs}`;
  }
  const qs = new URLSearchParams({ ...params, apikey: FMP_KEY ?? "" }).toString();
  return `${BASE}/${path}?${qs}`;
}

/** Thrown when FMP reports a plan/rate restriction rather than a data problem. */
export class FmpAccessError extends Error {}

// ---------------------------------------------------------------------------
// Cache — localStorage with per-entry TTL. No-ops safely outside the browser.
// ---------------------------------------------------------------------------
const MEM = new Map<string, { at: number; data: unknown }>();

function cacheGet<T>(key: string, ttlMs: number): T | undefined {
  const mem = MEM.get(key);
  if (mem && Date.now() - mem.at < ttlMs) return mem.data as T;
  if (typeof localStorage === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const { at, data } = JSON.parse(raw) as { at: number; data: T };
    if (Date.now() - at >= ttlMs) return undefined;
    MEM.set(key, { at, data });
    return data;
  } catch {
    return undefined;
  }
}

function cacheSet(key: string, data: unknown): void {
  const entry = { at: Date.now(), data };
  MEM.set(key, entry);
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    /* quota or private-mode — memory cache still serves this session */
  }
}

// ---------------------------------------------------------------------------
// Fetch with TTL cache and honest error surfacing.
// ---------------------------------------------------------------------------
async function fmpGet<T>(path: string, params: Record<string, string>, ttlMs: number): Promise<T> {
  const key = `fmp:${path}?${new URLSearchParams(params).toString()}`;
  const cached = cacheGet<T>(key, ttlMs);
  if (cached !== undefined) return cached;

  const res = await fetch(requestUrl(path, params));
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new FmpAccessError(`FMP auth/plan error (${res.status})`);
    if (res.status === 429) throw new FmpAccessError("FMP rate limit reached");
    throw new Error(`FMP ${path} failed: ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  // FMP returns error objects with 200 in some cases.
  if (json && typeof json === "object" && !Array.isArray(json)) {
    const msg = (json as Record<string, unknown>)["Error Message"];
    if (typeof msg === "string") {
      if (/legacy|subscription|restricted|upgrade/i.test(msg)) throw new FmpAccessError(msg);
      throw new Error(msg);
    }
  }
  cacheSet(key, json);
  return json as T;
}

// ---------------------------------------------------------------------------
// TTLs — fundamentals move quarterly, prices intraday.
// ---------------------------------------------------------------------------
const TTL_FUNDAMENTALS = 12 * 60 * 60 * 1000; // 12h
const TTL_PRICES = 60 * 1000; // 1m — short so a reload refetches through the edge cache
const TTL_SECTOR = 6 * 60 * 60 * 1000; // 6h

// ---------------------------------------------------------------------------
// Response shapes (only the fields we consume).
// ---------------------------------------------------------------------------
export interface FmpProfile {
  symbol: string;
  companyName: string;
  price: number;
  marketCap: number;
  beta: number;
  volume: number;
  averageVolume: number;
  changePercentage: number;
  sector: string;
  industry: string;
  exchange: string;
}

export interface FmpEod {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FmpRatios {
  grossProfitMarginTTM: number;
  operatingProfitMarginTTM: number;
  priceToEarningsRatioTTM: number;
}

export interface FmpKeyMetrics {
  evToEBITDATTM: number;
  netDebtToEBITDATTM: number;
  returnOnInvestedCapitalTTM: number;
  freeCashFlowYieldTTM: number;
}

const first = <T>(v: T[] | T): T | undefined => (Array.isArray(v) ? v[0] : v);

export async function getProfile(symbol: string): Promise<FmpProfile | undefined> {
  const data = await fmpGet<FmpProfile[]>("profile", { symbol }, TTL_FUNDAMENTALS);
  return first(data);
}

/** Daily OHLC, oldest → newest, capped to ~14 months so the engine's 252-day
 *  window and 52-week stats are well covered without oversized payloads. */
export async function getDailyHistory(symbol: string, sessions = 300): Promise<FmpEod[]> {
  const raw = await fmpGet<FmpEod[]>("historical-price-eod/full", { symbol }, TTL_PRICES);
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const asc = [...raw].reverse(); // FMP returns newest-first
  return asc.slice(-sessions);
}

export async function getRatios(symbol: string): Promise<FmpRatios | undefined> {
  const data = await fmpGet<FmpRatios[]>("ratios-ttm", { symbol }, TTL_FUNDAMENTALS);
  return first(data);
}

export async function getKeyMetrics(symbol: string): Promise<FmpKeyMetrics | undefined> {
  const data = await fmpGet<FmpKeyMetrics[]>("key-metrics-ttm", { symbol }, TTL_FUNDAMENTALS);
  return first(data);
}

const sectorCache = new Map<string, number | undefined>();

/** Live sector P/E for a given sector. Best-effort; cached per sector. */
export async function getSectorPe(sector: string, isoDate: string): Promise<number | undefined> {
  if (sectorCache.has(sector)) return sectorCache.get(sector);
  try {
    const data = await fmpGet<{ pe: number }[]>(
      "sector-pe-snapshot",
      { date: isoDate, sector },
      TTL_SECTOR,
    );
    const pe = first(data)?.pe;
    sectorCache.set(sector, pe);
    return pe;
  } catch {
    sectorCache.set(sector, undefined);
    return undefined;
  }
}

/** A single index/ETF quote for the market context strip. */
export async function getIndexQuote(symbol: string): Promise<{ price: number; changePercentage: number } | undefined> {
  const data = await fmpGet<{ price: number; changePercentage: number }[]>("quote", { symbol }, TTL_PRICES);
  return first(data);
}

/** Runs async tasks with bounded concurrency to stay gentle on the free tier. */
export async function mapLimit<A, B>(items: A[], limit: number, fn: (item: A) => Promise<B>): Promise<B[]> {
  const out: B[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

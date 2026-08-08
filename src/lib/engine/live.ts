/**
 * Live builder — turns real FMP data plus the desk's coverage overlay into the
 * StockInput the scoring engine expects, alongside the genuine daily price
 * series (so RSI, ATR, SMA, drawdown and support are computed from real tape,
 * not synthesised).
 */
import type { PricePoint, StockInput } from "@/lib/types";
import { COVERAGE, type CoverageOverlay } from "@/data/coverage";
import {
  getDailyHistory,
  getKeyMetrics,
  getProfile,
  getRatios,
  getSectorPe,
  hasFmpKey,
  mapLimit,
  type FmpEod,
} from "./providers/fmp";

export interface LiveStock {
  input: StockInput;
  /** Real daily closes, oldest → newest. */
  series: PricePoint[];
}

const pctChange = (a: number, b: number) => (b === 0 ? 0 : (a / b - 1) * 100);
const num = (v: number | undefined, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/** Trailing % move over `n` sessions inclusive of the latest close. */
function trailingMove(closes: number[], n: number): number {
  if (closes.length <= n) return 0;
  return pctChange(closes[closes.length - 1], closes[closes.length - 1 - n]);
}

async function buildOne(overlay: CoverageOverlay, isoDate: string): Promise<LiveStock | null> {
  const symbol = overlay.ticker;
  const [profile, history, ratios, metrics] = await Promise.all([
    getProfile(symbol).catch(() => undefined),
    getDailyHistory(symbol).catch(() => [] as FmpEod[]),
    getRatios(symbol).catch(() => undefined),
    getKeyMetrics(symbol).catch(() => undefined),
  ]);

  // History is the one hard requirement — without a real series there is no
  // dip and no technicals, so we skip the name rather than fabricate.
  if (!history || history.length < 60) return null;

  const closes = history.map((h) => h.close);
  const price = num(profile?.price, closes[closes.length - 1]);
  const series: PricePoint[] = history.map((h) => ({
    d: h.date,
    c: Number(h.close.toFixed(2)),
    o: Number.isFinite(h.open) ? Number(h.open.toFixed(2)) : undefined,
  }));

  const dipPctDay = num(profile?.changePercentage, trailingMove(closes, 1));
  const dipPctWeek = trailingMove(closes, 5);

  const avgVol = num(profile?.averageVolume, 0);
  const todayVol = num(profile?.volume, history[history.length - 1].volume);
  const volumeRatio = avgVol > 0 ? todayVol / avgVol : 1;

  const sectorLabel = profile?.sector || overlay.sector;
  const sectorPe = await getSectorPe(sectorLabel, isoDate).catch(() => undefined);

  const input: StockInput = {
    ticker: symbol,
    name: profile?.companyName || overlay.name,
    sector: sectorLabel,
    industry: profile?.industry || overlay.industry,
    marketCapB: num(profile?.marketCap, 0) / 1e9,
    price,
    dipPctDay,
    dipPctWeek,
    beta: num(profile?.beta, 1),
    avgVolM: avgVol / 1e6,
    volumeRatio,
    shortInterestPct: overlay.shortInterestPct,
    catalyst: overlay.catalyst,
    fundamentals: {
      // peForward is sourced from the live TTM P/E — the closest forward proxy
      // available on the free tier — and measured against the desk's 5y norm.
      peForward: num(ratios?.priceToEarningsRatioTTM, overlay.pe5yAvg),
      pe5yAvg: overlay.pe5yAvg,
      sectorPe: num(sectorPe, overlay.pe5yAvg * 0.9),
      evEbitda: num(metrics?.evToEBITDATTM, 12),
      fcfYieldPct: num(metrics?.freeCashFlowYieldTTM, 0) * 100,
      grossMarginPct: num(ratios?.grossProfitMarginTTM, 0) * 100,
      opMarginPct: num(ratios?.operatingProfitMarginTTM, 0) * 100,
      revGrowthFwdPct: overlay.revGrowthFwdPct,
      epsGrowthFwdPct: overlay.epsGrowthFwdPct,
      roicPct: num(metrics?.returnOnInvestedCapitalTTM, 0) * 100,
      netDebtToEbitda: num(metrics?.netDebtToEBITDATTM, 0),
      moat: overlay.moat,
      balanceSheet: overlay.balanceSheet,
    },
    bullCase: overlay.bullCase,
    bearCase: overlay.bearCase,
    deskNote: overlay.deskNote,
    peers: overlay.peers,
  };

  return { input, series };
}

/**
 * Builds live inputs for the whole coverage universe. Per-ticker failures are
 * tolerated (the name is dropped); a total failure throws so the caller can
 * fall back to the simulated snapshot.
 */
export async function buildLiveUniverse(): Promise<LiveStock[]> {
  if (!hasFmpKey()) throw new Error("No FMP API key configured");
  const isoDate = new Date().toISOString().slice(0, 10);
  const results = await mapLimit(COVERAGE, 4, (c) => buildOne(c, isoDate).catch(() => null));
  const built = results.filter((r): r is LiveStock => r !== null);
  if (built.length === 0) throw new Error("Live universe returned no usable names");
  return built;
}

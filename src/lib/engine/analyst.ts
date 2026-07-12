import type {
  Analysis,
  PillarScore,
  PricePoint,
  StockInput,
  Technicals,
  TradePlan,
  Verdict,
} from "@/lib/types";
import { PILLAR_META, VERDICT_META, CATALYST_LABELS } from "@/lib/types";
import { buildSeries } from "./series";
import { computeTechnicals } from "./indicators";

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));
/** Linear map of value from [a,b] to [0,100], clamped. */
const scale = (v: number, a: number, b: number) => clamp(((v - a) / (b - a)) * 100);

// ---------------------------------------------------------------------------
// Pillar 1 — Business Quality (22%)
// A dip is only buyable if the underlying business deserves to recover.
// ---------------------------------------------------------------------------
function scoreQuality(s: StockInput): PillarScore {
  const f = s.fundamentals;
  const roic = scale(f.roicPct, 4, 30);
  const gm = scale(f.grossMarginPct, 20, 70);
  const om = scale(f.opMarginPct, 5, 35);
  const growth = scale(f.revGrowthFwdPct, -5, 25);
  const leverage = scale(-f.netDebtToEbitda, -4, 1); // net cash scores best
  const moat = scale(f.moat, 1, 5);
  const bs = scale(f.balanceSheet, 1, 5);

  const score =
    roic * 0.22 + moat * 0.22 + gm * 0.12 + om * 0.12 + growth * 0.12 + leverage * 0.1 + bs * 0.1;

  let note: string;
  if (score >= 70)
    note = `Franchise-grade operator: ${f.roicPct.toFixed(0)}% ROIC on ${f.grossMarginPct.toFixed(0)}% gross margins with a defensible moat. This is the profile that historically closes dip gaps.`;
  else if (score >= 45)
    note = `Adequate but not elite economics: ${f.roicPct.toFixed(0)}% ROIC, ${f.opMarginPct.toFixed(0)}% operating margin. Recovery depends more on the catalyst clearing than on business gravity.`;
  else
    note = `Weak underlying economics (${f.roicPct.toFixed(0)}% ROIC, ${f.netDebtToEbitda.toFixed(1)}x net debt/EBITDA). There is no quality floor under this price.`;
  return { key: "quality", score: Math.round(score), note };
}

// ---------------------------------------------------------------------------
// Pillar 2 — Valuation Reset (18%)
// Has the dip actually created a discount, or just removed excess?
// ---------------------------------------------------------------------------
function scoreValuation(s: StockInput): PillarScore {
  const f = s.fundamentals;
  const vsHistory = scale(((f.pe5yAvg - f.peForward) / f.pe5yAvg) * 100, -25, 40);
  const vsSector = scale(((f.sectorPe - f.peForward) / f.sectorPe) * 100, -60, 40);
  const fcf = scale(f.fcfYieldPct, 0, 7);
  const peg = f.epsGrowthFwdPct > 0 ? scale(-(f.peForward / f.epsGrowthFwdPct), -4, -0.8) : 15;

  const score = vsHistory * 0.35 + vsSector * 0.2 + fcf * 0.25 + peg * 0.2;
  const discount = ((f.pe5yAvg - f.peForward) / f.pe5yAvg) * 100;

  let note: string;
  if (score >= 65)
    note = `Genuine discount: ${f.peForward.toFixed(0)}x forward earnings vs a ${f.pe5yAvg.toFixed(0)}x five-year norm (${discount.toFixed(0)}% below), with a ${f.fcfYieldPct.toFixed(1)}% FCF yield paying you to wait.`;
  else if (score >= 40)
    note = `The reset removed froth rather than creating a bargain: ${f.peForward.toFixed(0)}x forward vs ${f.pe5yAvg.toFixed(0)}x historical average. Fairly priced for the new facts.`;
  else
    note = `Still expensive after the fall (${f.peForward.toFixed(0)}x forward, ${f.fcfYieldPct.toFixed(1)}% FCF yield). The dip corrected valuation, it did not create opportunity.`;
  return { key: "valuation", score: Math.round(score), note };
}

// ---------------------------------------------------------------------------
// Pillar 3 — Dip Character (18%)
// Sharp, high-volume overshoots mean-revert; slow bleeds continue.
// ---------------------------------------------------------------------------
function scoreDipCharacter(s: StockInput, t: Technicals): PillarScore {
  const overshoot = scale(t.dipZScore, 0.8, 3.5); // dips beyond ~2.5σ overshoot fundamentals
  const speed = scale(Math.abs(s.dipPctDay) / Math.max(Math.abs(s.dipPctWeek), 0.1), 0.25, 1); // one-day shock > slow bleed
  const capitulation = scale(s.volumeRatio, 1, 3.5);
  const notBrokenTrend = scale(-Math.abs(t.drawdownFrom52wHighPct), -55, -8);

  const score = overshoot * 0.35 + capitulation * 0.3 + speed * 0.15 + notBrokenTrend * 0.2;

  let note: string;
  if (score >= 65)
    note = `Classic capitulation signature: a ${t.dipZScore.toFixed(1)}σ weekly move on ${s.volumeRatio.toFixed(1)}x average volume. Forced sellers, not patient ones, set this price.`;
  else if (score >= 40)
    note = `Meaningful but orderly repricing (${t.dipZScore.toFixed(1)}σ, ${s.volumeRatio.toFixed(1)}x volume). Sellers are deliberate: the tape is digesting new information, not panicking.`;
  else
    note = `A slow bleed, not a flush: the stock is ${Math.abs(t.drawdownFrom52wHighPct).toFixed(0)}% off its high without a volume climax. Persistent distribution tends to persist.`;
  return { key: "dipCharacter", score: Math.round(score), note };
}

// ---------------------------------------------------------------------------
// Pillar 4 — Catalyst Severity (22%)
// The single most important question: is earnings power impaired?
// ---------------------------------------------------------------------------
function scoreCatalyst(s: StockInput): PillarScore {
  const c = s.catalyst;
  const transience = scale(c.transience, 0, 10);
  const severity = scale(10 - c.severity, 0, 10);
  const score = transience * 0.55 + severity * 0.45;

  const label = CATALYST_LABELS[c.type];
  let note: string;
  if (score >= 65)
    note = `${label}: the driver is transient (${c.transience}/10) with limited earnings impairment (severity ${c.severity}/10). Time is on the buyer's side.`;
  else if (score >= 40)
    note = `${label}: partially structural. Some earnings power is genuinely lost (severity ${c.severity}/10); underwrite the new baseline, not the old one.`;
  else
    note = `${label}: this is thesis damage, not noise (severity ${c.severity}/10, transience ${c.transience}/10). The market is repricing the business, and it is probably right.`;
  return { key: "catalyst", score: Math.round(score), note };
}

// ---------------------------------------------------------------------------
// Pillar 5 — Technical Setup (12%)
// ---------------------------------------------------------------------------
function scoreTechnical(s: StockInput, t: Technicals): PillarScore {
  const oversold = scale(-t.rsi14, -55, -22); // RSI 22 → 100, RSI 55 → 0
  // A shelf only counts if it exists; fresh 52-week lows have nothing beneath them.
  const supportDist = t.supportDefined ? scale(-((s.price - t.supportLevel) / s.price) * 100, -12, -0.5) : 0;
  // Oversold in an uptrend is a pullback; oversold in a downtrend is just Tuesday.
  const trendIntact = s.price > t.sma200 ? 85 : scale((s.price / t.sma200 - 1) * 100, -35, -5);

  const score = oversold * 0.4 + supportDist * 0.25 + trendIntact * 0.35;

  let note: string;
  if (!t.supportDefined)
    note = `RSI ${t.rsi14.toFixed(0)}, but the stock is in open price discovery at fresh 52-week lows. There is no defended shelf beneath this print, so risk cannot be defined technically.`;
  else if (score >= 65)
    note = `Deeply oversold (RSI ${t.rsi14.toFixed(0)}) and sitting ${(((s.price - t.supportLevel) / s.price) * 100).toFixed(1)}% above a well-defended shelf at $${t.supportLevel.toFixed(2)}. Risk is definable here.`;
  else if (score >= 40)
    note = `Stretched but not extreme: RSI ${t.rsi14.toFixed(0)}, support at $${t.supportLevel.toFixed(2)}. A tradeable level exists, though the tape hasn't fully reset.`;
  else
    note = `No technical floor in sight: RSI ${t.rsi14.toFixed(0)} with the 200-day at $${t.sma200.toFixed(2)} ${s.price < t.sma200 ? "overhead as resistance" : "far below"}. Structure must repair first.`;
  return { key: "technical", score: Math.round(score), note };
}

// ---------------------------------------------------------------------------
// Pillar 6 — Flow & Sentiment (8%)
// ---------------------------------------------------------------------------
function scoreFlow(s: StockInput, quality: number): PillarScore {
  const volume = scale(s.volumeRatio, 0.9, 3.2);
  // High short interest is fuel on quality, kindling on junk.
  const si = quality >= 55 ? scale(s.shortInterestPct, 1, 12) : scale(-s.shortInterestPct, -15, -1);
  const score = volume * 0.55 + si * 0.45;

  let note: string;
  if (score >= 60)
    note = `${s.shortInterestPct.toFixed(1)}% short interest against a sound business is squeeze fuel; ${s.volumeRatio.toFixed(1)}x volume says weak hands are already transferring shares.`;
  else if (score >= 40)
    note = `Positioning is unremarkable: ${s.shortInterestPct.toFixed(1)}% short interest, ${s.volumeRatio.toFixed(1)}x volume. Flow won't drive the recovery; fundamentals must.`;
  else
    note = `Crowded and informed bears (${s.shortInterestPct.toFixed(1)}% short interest) with no capitulation volume. The smart money on the other side has done its work.`;
  return { key: "flow", score: Math.round(score), note };
}

// ---------------------------------------------------------------------------
// Composite, verdict, trade plan
// ---------------------------------------------------------------------------
function verdictFor(score: number, catalystScore: number, qualityScore: number): Verdict {
  // Hard overrides: no composite can rescue structural impairment.
  if (catalystScore < 25 && qualityScore < 40) return "AVOID";
  // Buy-side verdicts are gated on the catalyst: a great composite built on a
  // rotten reason to fall is a value trap, not an entry.
  if (score >= 75 && catalystScore >= 55 && qualityScore >= 55) return "BUY_THE_DIP";
  if (score >= 63 && catalystScore >= 52) return "ACCUMULATE";
  if (score >= 48) return "WATCHLIST";
  if (score >= 32) return "FALLING_KNIFE";
  return "AVOID";
}

function buildPlan(s: StockInput, t: Technicals, dipScore: number, verdict: Verdict): TradePlan {
  const support = t.supportLevel;
  const entryLow = t.supportDefined ? Math.min(s.price * 0.985, support * 1.01) : s.price * 0.985;
  const entryHigh = s.price * 1.008;
  const atrStop = s.price * (1 - (2.2 * t.atrPct) / 100);
  const stop = t.supportDefined ? Math.min(support * 0.97, atrStop) : atrStop;

  const preDip = s.price / (1 + s.dipPctWeek / 100);
  const target1 = s.price + (preDip - s.price) * 0.5;
  // Full retest of the pre-dip level; never below T1.
  const target2 = Math.max(preDip * 0.99, target1);

  const risk = s.price - stop;
  const reward = target1 - s.price;
  const rr = risk > 0 ? reward / risk : 0;

  const winProbabilityPct = clamp(28 + dipScore * 0.55, 15, 82);
  const expectedValuePct =
    (winProbabilityPct / 100) * ((target1 / s.price - 1) * 100) +
    (1 - winProbabilityPct / 100) * ((stop / s.price - 1) * 100);

  const baseSize: Record<Verdict, number> = {
    BUY_THE_DIP: 5,
    ACCUMULATE: 3,
    WATCHLIST: 1,
    FALLING_KNIFE: 0,
    AVOID: 0,
  };
  const volAdj = clamp(30 / Math.max(t.realizedVol30dPct, 15), 0.5, 1.2);
  const suggestedSizePct = Math.round(baseSize[verdict] * volAdj * 10) / 10;

  const horizon =
    s.catalyst.type === "earnings_miss" || s.catalyst.type === "guidance_cut"
      ? "4–8 weeks (one guidance cycle)"
      : s.catalyst.type === "sector_sympathy" || s.catalyst.type === "macro" || s.catalyst.type === "no_news"
        ? "2–5 weeks (mean reversion)"
        : "6–12 weeks (narrative repair)";

  return {
    entryLow,
    entryHigh,
    stop,
    target1,
    target2,
    riskRewardRatio: Math.round(rr * 100) / 100,
    horizon,
    suggestedSizePct,
    maxPortfolioRiskPct: 1,
    winProbabilityPct: Math.round(winProbabilityPct),
    expectedValuePct: Math.round(expectedValuePct * 10) / 10,
  };
}

function buildRiskFlags(s: StockInput, t: Technicals, pillars: PillarScore[]): string[] {
  const flags: string[] = [];
  const f = s.fundamentals;
  if (f.netDebtToEbitda > 2.5) flags.push(`Leverage: ${f.netDebtToEbitda.toFixed(1)}x net debt/EBITDA narrows the margin for error.`);
  if (s.catalyst.severity >= 6) flags.push("Catalyst carries real earnings impairment. The old baseline no longer applies.");
  if (s.price < t.sma200) flags.push("Trading below the 200-day moving average; the primary trend is against the position.");
  if (!t.supportDefined) flags.push("At fresh 52-week lows in open price discovery. No structural support exists beneath the print.");
  if (t.realizedVol30dPct > 45) flags.push(`Realized volatility of ${t.realizedVol30dPct.toFixed(0)}% demands reduced sizing.`);
  if (s.shortInterestPct > 10 && (pillars.find((p) => p.key === "quality")?.score ?? 0) < 50)
    flags.push(`${s.shortInterestPct.toFixed(0)}% short interest on a weak business: bears are usually early, not wrong.`);
  if (f.peForward > f.sectorPe * 1.4) flags.push("Still commands a large sector premium; multiple compression risk remains.");
  if (Math.abs(t.drawdownFrom52wHighPct) > 40) flags.push("Down over 40% from the high: recoveries from this depth take quarters, not weeks.");
  if (flags.length === 0) flags.push("No disqualifying risk flags. Standard stop discipline applies.");
  return flags;
}

function buildThesis(s: StockInput, t: Technicals, dipScore: number, verdict: Verdict): string {
  const v = VERDICT_META[verdict];
  // When the name isn't actually falling this week, there is no dip to
  // underwrite — say so plainly rather than forcing a dip narrative.
  if (s.dipPctWeek >= 0) {
    const dayWord = s.dipPctDay < 0 ? `off ${Math.abs(s.dipPctDay).toFixed(1)}% today but ` : "";
    return `${s.ticker} is ${dayWord}up ${s.dipPctWeek.toFixed(1)}% on the week: it is not in a dip. The desk publishes no entry here; this page is coverage context until the tape actually sells off. Standing view: ${s.deskNote}`;
  }
  const move = `${s.ticker} is off ${Math.abs(s.dipPctWeek).toFixed(1)}% on the week (${Math.abs(s.dipPctDay).toFixed(1)}% today) on ${CATALYST_LABELS[s.catalyst.type].toLowerCase()}`;
  switch (verdict) {
    case "BUY_THE_DIP":
      return `${move}: a ${t.dipZScore.toFixed(1)}σ dislocation in a business whose earnings power is substantially intact. The desk's read: the market is pricing a transient problem as a permanent one. ${v.action}`;
    case "ACCUMULATE":
      return `${move}. The reset is real but so is the franchise. Rather than calling the exact low, scale in across the entry zone and let the position build as the catalyst burns off. ${v.action}`;
    case "WATCHLIST":
      return `${move}. The dip has removed excess without creating a clear bargain, and the catalyst has genuine substance. There is no edge in being first here: ${v.action.toLowerCase()}`;
    case "FALLING_KNIFE":
      return `${move}, and the selling is orderly rather than climactic: the signature of repricing, not panic. History says this pattern continues lower before it stabilizes. ${v.action}`;
    case "AVOID":
      return `${move}, but the problem is the business, not the tape. Earnings power is impaired and the balance sheet offers no floor. ${v.action}`;
  }
}

export function analyze(stock: StockInput, realSeries?: PricePoint[]): Analysis {
  // Prefer a genuine price history when the live provider supplies one; fall
  // back to the deterministic synthetic series for the simulated snapshot.
  const series = realSeries && realSeries.length >= 60 ? realSeries : buildSeries(stock);
  const technicals = computeTechnicals(stock, series);

  const quality = scoreQuality(stock);
  const valuation = scoreValuation(stock);
  const dipCharacter = scoreDipCharacter(stock, technicals);
  const catalyst = scoreCatalyst(stock);
  const technical = scoreTechnical(stock, technicals);
  const flow = scoreFlow(stock, quality.score);

  const pillars = [quality, catalyst, valuation, dipCharacter, technical, flow];
  const dipScore = Math.round(
    pillars.reduce((sum, p) => sum + p.score * PILLAR_META[p.key].weight, 0),
  );

  const verdict = verdictFor(dipScore, catalyst.score, quality.score);
  const spread = Math.max(...pillars.map((p) => p.score)) - Math.min(...pillars.map((p) => p.score));
  const conviction = spread < 35 && (dipScore >= 65 || dipScore < 40) ? "HIGH" : spread < 55 ? "MODERATE" : "LOW";

  const plan = buildPlan(stock, technicals, dipScore, verdict);
  const riskFlags = buildRiskFlags(stock, technicals, pillars);
  const thesis = buildThesis(stock, technicals, dipScore, verdict);
  const isDip = stock.dipPctWeek < 0;

  return { stock, series, technicals, pillars, dipScore, verdict, conviction, thesis, riskFlags, plan, isDip };
}

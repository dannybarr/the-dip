import { Link, useParams } from "react-router-dom";
import { useMarket } from "@/context/MarketProvider";
import { LoadingView } from "@/components/terminal/DataState";
import { CATALYST_LABELS, VERDICT_META } from "@/lib/types";
import { DIP_CAUSE_LABELS } from "@/lib/engine/decompose";
import { fmtCap, fmtPct, fmtPct1, fmtPrice, fmtX } from "@/lib/fmt";
import { PriceChart } from "@/components/terminal/PriceChart";
import { PillarBars } from "@/components/terminal/PillarBars";
import { ScoreDial } from "@/components/terminal/ScoreMeter";
import { VerdictBadge } from "@/components/terminal/VerdictBadge";
import { VerDot } from "@/components/terminal/VerDot";
import { useIsWatched, watchlistStore } from "@/lib/watchlist";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowLeft, Bookmark, BookmarkCheck, TrendingDown, TrendingUp } from "lucide-react";

function Row({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | "gold" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn("num text-xs font-semibold text-foreground", tone === "up" && "text-up", tone === "down" && "text-down", tone === "gold" && "text-gold")}>
        {value}
      </span>
    </div>
  );
}

function PlanCell({ label, value, tone, hint }: { label: string; value: string; tone?: "up" | "down" | "gold" | "cyan"; hint?: string }) {
  return (
    <div className="border-b border-r border-hairline px-4 py-3 last:border-r-0">
      <div className="micro">{label}</div>
      <div
        className={cn(
          "num mt-1 text-lg font-bold text-foreground",
          tone === "up" && "text-up",
          tone === "down" && "text-down",
          tone === "gold" && "text-gold",
          tone === "cyan" && "text-cyanline",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Signed contribution bar for the dip decomposition. Width is the part's
 *  share of the total move; red for a drag, green for a lift. */
function DecompBar({ label, value, total, accent }: { label: string; value: number; total: number; accent?: boolean }) {
  const share = total !== 0 ? Math.min(100, Math.abs(value / total) * 100) : 0;
  const down = value < 0;
  return (
    <div className="flex items-center gap-3">
      <span className={cn("w-32 shrink-0 text-[11px]", accent ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</span>
      <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-panel-2">
        <div className={cn("h-full rounded-full", down ? "bg-down" : "bg-up")} style={{ width: `${share}%` }} />
      </div>
      <span className={cn("num w-14 text-right text-xs font-semibold", down ? "text-down" : "text-up")}>{fmtPct1(value)}</span>
    </div>
  );
}

export default function StockAnalysis() {
  const { ticker = "" } = useParams();
  const { analyses, byTicker, isLoading } = useMarket();
  const analysis = byTicker(ticker);
  const watched = useIsWatched(ticker.toUpperCase());

  if (isLoading) return <LoadingView label={`Loading ${ticker.toUpperCase()}`} />;

  if (!analysis) {
    return (
      <div className="container py-16 text-center">
        <div className="font-mono text-2xl font-bold text-foreground">{ticker.toUpperCase()}: NOT IN COVERAGE</div>
        <p className="mt-2 text-sm text-muted-foreground">The desk hasn't underwritten this name yet.</p>
        <Link to="/" className="mt-6 inline-block font-mono text-xs uppercase tracking-wider text-gold hover:underline">
          ← Back to scanner
        </Link>
      </div>
    );
  }

  const { stock: s, technicals: t, plan, pillars, dipScore, signalScore, overlayScore, decomposition, verdict, conviction, thesis, riskFlags, isDip } = analysis;
  const f = s.fundamentals;
  const peers = s.peers.map((p) => analyses.find((a) => a.stock.ticker === p)).filter(Boolean);

  return (
    <div className="container max-w-[1480px] space-y-4 py-4">
      {/* Quote header */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link to="/" className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Scanner
        </Link>
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="font-mono text-3xl font-bold tracking-tight text-foreground">{s.ticker}</h1>
            <span className="text-sm text-muted-foreground">{s.name}</span>
          </div>
          <div className="micro mt-1">{s.sector} · {s.industry} · {fmtCap(s.marketCapB)}</div>
        </div>
        <div className="num flex items-baseline gap-4">
          <span className="text-3xl font-bold text-foreground">${fmtPrice(s.price)}</span>
          <span className={cn("flex items-center gap-1 text-base font-semibold", s.dipPctDay < 0 ? "text-down" : "text-up")}>
            {s.dipPctDay < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
            {fmtPct(s.dipPctDay)} 1D
          </span>
          <span className={cn("text-base font-semibold", s.dipPctWeek < 0 ? "text-down" : "text-up")}>{fmtPct(s.dipPctWeek)} 1W</span>
        </div>
        <button
          onClick={() => watchlistStore.toggle(s.ticker)}
          className={cn(
            "ml-auto flex items-center gap-2 rounded-sm border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors",
            watched ? "border-gold/60 bg-gold/10 text-gold" : "border-hairline text-muted-foreground hover:text-foreground",
          )}
        >
          {watched ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
          {watched ? "On Watchlist" : "Add to Watchlist"}
        </button>
      </div>

      {/* Verdict banner */}
      <section className="panel flex flex-col gap-5 p-5 md:flex-row md:items-center">
        <div className="flex flex-col items-center gap-2">
          <ScoreDial score={signalScore} label="Signal Score" />
          <div className="flex gap-3">
            <span className="micro">Composite <span className="num font-semibold text-foreground">{dipScore}</span></span>
            <span className="micro">Overlay <span className="num font-semibold text-foreground">{overlayScore}</span></span>
          </div>
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <VerdictBadge verdict={verdict} size="lg" />
            <span className="micro">Conviction: <span className={cn(conviction === "HIGH" ? "text-gold" : "text-foreground")}>{conviction}</span></span>
            <span className="micro">Cause: {DIP_CAUSE_LABELS[decomposition?.cause ?? "UNKNOWN"]}</span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-foreground/90">{thesis}</p>
          <p className="mt-2 text-xs italic text-muted-foreground">“{s.deskNote}”<span className="not-italic"> (Desk note)</span></p>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {/* Chart */}
          <section className="panel">
            <div className="panel-title">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-foreground">Price · 1Y Daily</h2>
              <span className="micro ml-auto">Support / stop / targets overlaid</span>
            </div>
            <div className="h-[360px] p-2">
              <PriceChart analysis={analysis} />
            </div>
          </section>

          {/* Trade plan */}
          <section className="panel">
            <div className="panel-title">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-foreground">Trade Plan</h2>
              <span className="micro ml-auto">{VERDICT_META[verdict].action}</span>
            </div>
            {!isDip ? (
            <div className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:gap-6">
              <div className="font-mono text-lg font-bold uppercase tracking-wider text-muted-foreground">No active dip</div>
              <p className="max-w-xl text-[13px] leading-relaxed text-muted-foreground">
                {s.ticker} is not selling off this week, so there is no dip to trade and the desk publishes no levels.
                This page is standing coverage: the thesis, moat and valuation read stay current so the name is ready to underwrite the moment it actually drops.
              </p>
            </div>
            ) : verdict === "FALLING_KNIFE" || verdict === "AVOID" ? (
            <div className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:gap-6">
              <div className="font-mono text-lg font-bold uppercase tracking-wider text-down">No levels published</div>
              <p className="max-w-xl text-[13px] leading-relaxed text-muted-foreground">
                The desk does not construct entries where expected value is negative: a price target on a{" "}
                {verdict === "AVOID" ? "structurally impaired business" : "falling knife"} is an invitation, not a plan.
                Re-underwrite {verdict === "AVOID" ? "if the balance-sheet or demand picture changes sign" : "after the tape stabilizes, on a higher low with declining volume or a reclaimed short-term moving average"}.
              </p>
            </div>
            ) : (
            <div className="grid grid-cols-2 md:grid-cols-4">
              <PlanCell label="Entry Zone" value={`$${fmtPrice(plan.entryLow)}–${fmtPrice(plan.entryHigh)}`} tone="cyan" hint="scale in across the zone" />
              <PlanCell label="Stop Loss" value={`$${fmtPrice(plan.stop)}`} tone="down" hint={`${fmtPct1(((plan.stop - s.price) / s.price) * 100)} from last`} />
              <PlanCell label="Target 1" value={`$${fmtPrice(plan.target1)}`} tone="up" hint={`${fmtPct1(((plan.target1 - s.price) / s.price) * 100)} · 50% dip retrace`} />
              <PlanCell label="Target 2" value={`$${fmtPrice(plan.target2)}`} tone="up" hint="full retest of pre-dip level" />
              <PlanCell label="Risk / Reward" value={`${plan.riskRewardRatio.toFixed(2)}:1`} tone={plan.riskRewardRatio >= 1.5 ? "up" : "gold"} hint="to Target 1" />
              <PlanCell label="Est. Win Rate" value={`${plan.winProbabilityPct}%`} hint="model-implied probability" />
              <PlanCell label="Expected Value" value={fmtPct1(plan.expectedValuePct)} tone={plan.expectedValuePct > 0 ? "up" : "down"} hint="per unit of capital" />
              <PlanCell label="Suggested Size" value={`${plan.suggestedSizePct.toFixed(1)}%`} tone="gold" hint={`max ${plan.maxPortfolioRiskPct}% portfolio risk · ${plan.horizon}`} />
            </div>
            )}
          </section>

          {/* Catalyst — measured decomposition of why the stock fell */}
          <section className="panel">
            <div className="panel-title">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-foreground">Why It Fell</h2>
              <span className="micro ml-auto">Measured from price · {DIP_CAUSE_LABELS[decomposition?.cause ?? "UNKNOWN"]}</span>
            </div>
            <div className="p-4">
              {decomposition && decomposition.cause !== "UNKNOWN" ? (
                <>
                  <p className="text-[13px] leading-relaxed text-foreground/90">{decomposition.note}</p>
                  <div className="mt-4 space-y-2">
                    <DecompBar label="Market beta" value={decomposition.marketPct} total={decomposition.totalPct} />
                    <DecompBar label="Sector rotation" value={decomposition.sectorPct} total={decomposition.totalPct} />
                    <DecompBar label="Company-specific" value={decomposition.idioPct} total={decomposition.totalPct} accent />
                  </div>
                  <div className="mt-4 grid max-w-md grid-cols-2 gap-x-6 gap-y-1.5">
                    <Row label="Residual (sigma)" value={`${decomposition.residualZ.toFixed(1)}σ`} tone={decomposition.residualZ <= -2 ? "down" : undefined} />
                    <Row label="Systematic share" value={fmtPct1(decomposition.systematicShare * 100, false)} />
                    <Row label="Overnight gap share" value={decomposition.gapShare === null ? "n/a" : fmtPct1(decomposition.gapShare * 100, false)} />
                    <Row label="Confidence" value={decomposition.confidence} />
                  </div>
                </>
              ) : (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  The cause of this move could not be measured without a market and peer context. The catalyst is treated as undetermined rather than assumed benign.
                </p>
              )}
              <div className="mt-5 border-t border-hairline pt-4">
                <div className="micro mb-1.5">Desk standing read · {CATALYST_LABELS[s.catalyst.type]}</div>
                <h3 className="text-sm font-semibold text-foreground">{s.catalyst.headline}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{s.catalyst.detail}</p>
                <p className="mt-2 text-[11px] italic text-muted-foreground/70">Context only. This standing thesis no longer feeds the score.</p>
              </div>
            </div>
          </section>

          {/* Bull / Bear */}
          <div className="grid gap-4 md:grid-cols-2">
            <section className="panel">
              <div className="panel-title">
                <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-up">Bull Case</h2>
              </div>
              <ul className="space-y-2.5 p-4">
                {s.bullCase.map((b, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-foreground/85">
                    <span className="num mt-px shrink-0 text-up">▲</span>{b}
                  </li>
                ))}
              </ul>
            </section>
            <section className="panel">
              <div className="panel-title">
                <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-down">Bear Case</h2>
              </div>
              <ul className="space-y-2.5 p-4">
                {s.bearCase.map((b, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-foreground/85">
                    <span className="num mt-px shrink-0 text-down">▼</span>{b}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Risk flags */}
          <section className="panel">
            <div className="panel-title">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-warnhot">Risk Flags</h2>
            </div>
            <ul className="space-y-2 p-4">
              {riskFlags.map((r, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warnhot" />{r}
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Right rail */}
        <aside className="space-y-4">
          <section className="panel">
            <div className="panel-title">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-foreground">Score Pillars</h2>
              <span className="micro ml-auto">weighted composite</span>
            </div>
            <PillarBars pillars={pillars} detailed />
          </section>

          <section className="panel">
            <div className="panel-title">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-foreground">Fundamentals</h2>
            </div>
            <div className="divide-y divide-hairline/60 py-1">
              <Row label="Fwd P/E vs 5Y avg" value={`${f.peForward.toFixed(1)}x / ${f.pe5yAvg.toFixed(1)}x`} tone={f.peForward < f.pe5yAvg ? "up" : "down"} />
              <Row label="Sector P/E" value={fmtX(f.sectorPe)} />
              <Row label="EV / EBITDA" value={fmtX(f.evEbitda)} />
              <Row label="FCF Yield" value={fmtPct1(f.fcfYieldPct, false)} tone={f.fcfYieldPct >= 4 ? "up" : undefined} />
              <Row label="Gross Margin" value={fmtPct1(f.grossMarginPct, false)} />
              <Row label="Operating Margin" value={fmtPct1(f.opMarginPct, false)} />
              <Row label="Revenue Growth (fwd)" value={fmtPct1(f.revGrowthFwdPct)} tone={f.revGrowthFwdPct < 0 ? "down" : undefined} />
              <Row label="EPS Growth (fwd)" value={fmtPct1(f.epsGrowthFwdPct)} />
              <Row label="ROIC" value={fmtPct1(f.roicPct, false)} tone={f.roicPct >= 15 ? "up" : undefined} />
              <Row label="Net Debt / EBITDA" value={fmtX(f.netDebtToEbitda)} tone={f.netDebtToEbitda > 2.5 ? "down" : undefined} />
              <Row label="Moat Rating" value={`${f.moat} / 5`} tone={f.moat >= 4 ? "gold" : undefined} />
              <Row label="Balance Sheet" value={`${f.balanceSheet} / 5`} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-foreground">Technicals</h2>
            </div>
            <div className="divide-y divide-hairline/60 py-1">
              <Row label="RSI (14)" value={t.rsi14.toFixed(1)} tone={t.rsi14 < 30 ? "gold" : undefined} />
              <Row label="vs 50-DMA" value={fmtPct1((s.price / t.sma50 - 1) * 100)} tone={s.price < t.sma50 ? "down" : "up"} />
              <Row label="vs 200-DMA" value={fmtPct1((s.price / t.sma200 - 1) * 100)} tone={s.price < t.sma200 ? "down" : "up"} />
              <Row label="52W Range" value={`$${fmtPrice(t.low52w)} – $${fmtPrice(t.high52w)}`} />
              <Row label="Off 52W High" value={fmtPct1(t.drawdownFrom52wHighPct)} tone="down" />
              <Row label="Dip Z-Score (1W)" value={`${t.dipZScore.toFixed(1)}σ`} tone={t.dipZScore >= 2 ? "gold" : undefined} />
              <Row label="Support Shelf" value={t.supportDefined ? `$${fmtPrice(t.supportLevel)}` : "None, new lows"} tone={t.supportDefined ? undefined : "down"} />
              <Row label="Realized Vol (30D)" value={fmtPct1(t.realizedVol30dPct, false)} />
              <Row label="Volume vs 90D Avg" value={`${s.volumeRatio.toFixed(1)}x`} tone={s.volumeRatio >= 2.5 ? "gold" : undefined} />
              <Row label="Short Interest" value={fmtPct1(s.shortInterestPct, false)} />
              <Row label="Beta" value={s.beta.toFixed(2)} />
            </div>
          </section>

          {peers.length > 0 && (
            <section className="panel">
              <div className="panel-title">
                <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-foreground">Covered Peers</h2>
              </div>
              <div className="divide-y divide-hairline">
                {peers.map((p) => p && (
                  <Link key={p.stock.ticker} to={`/stock/${p.stock.ticker}`} className="row-hover flex items-center justify-between px-3 py-2.5">
                    <span className="flex items-center font-mono text-xs font-bold text-foreground">
                      <VerDot verdict={p.verdict} />{p.stock.ticker}
                    </span>
                    <span className={cn("num text-xs", p.stock.dipPctWeek < 0 ? "text-down" : "text-up")}>{fmtPct(p.stock.dipPctWeek)} wk</span>
                    <span className="num text-xs text-muted-foreground">score {p.signalScore}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

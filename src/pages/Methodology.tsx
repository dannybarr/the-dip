import { Link } from "react-router-dom";
import { PILLAR_META, VERDICT_META, type PillarKey, type Verdict } from "@/lib/types";
import { VerdictBadge } from "@/components/terminal/VerdictBadge";

const PILLAR_DETAIL: Record<PillarKey, string[]> = {
  quality: [
    "Return on invested capital vs the 10% hurdle that separates compounders from capital destroyers",
    "Gross and operating margin structure: pricing power leaves fingerprints in the margins",
    "Moat rating (1–5): switching costs, network effects, brand, scale, regulatory position",
    "Balance sheet: net cash scores best; leverage above 2.5x EBITDA triggers a risk flag",
  ],
  catalyst: [
    "Every dip has a cause, and we measure it from price rather than assume it. The stock's return is regressed on a market factor and an orthogonalised peer basket over the prior 120 sessions, splitting the fall into market beta, sector rotation and a company-specific residual",
    "A move the market or sector caused is not impairment: the business did not change, and it recovers when the tape does. These score well",
    "A company-specific fall is graded by how unusual it is (residual sigma) and how it arrived: an overnight gap is the fingerprint of news, an intraday bleed the fingerprint of flow",
    "An idiosyncratic move with an information signature is treated as a falling knife. Prices that fall on news keep drifting the same way for weeks (post-earnings-announcement drift), so this is the dip to leave alone, and it hard-caps the verdict regardless of the rest of the composite",
  ],
  valuation: [
    "Discount vs the stock's own 5-year average forward multiple: the market's memory of what it paid for this quality",
    "Discount or premium vs the sector multiple",
    "Free-cash-flow yield: above ~4-5% you are paid to wait for the recovery",
    "Growth-adjusted check (PEG) so 'cheap' deceleration doesn't masquerade as value",
  ],
  dipCharacter: [
    "Depth in sigma units: the weekly move divided by the stock's own pre-dip weekly volatility. Beyond ~2.5σ, moves systematically overshoot fundamentals",
    "Speed: one-session shocks mean-revert; multi-month bleeds trend",
    "Volume signature: 2.5x+ average volume is capitulation, a forced transfer from weak to strong hands. Quiet declines are distribution",
    "Trend context: a dip inside an intact long-term uptrend is a pullback; below a broken 200-day it's a downtrend rally to fade",
  ],
  technical: [
    "RSI(14) below 30 marks statistically stretched selling",
    "Distance to the support shelf: the price level buyers defended repeatedly over the past nine months",
    "Position vs the 200-day moving average: buying above it is buying a dip; below it, a downtrend",
  ],
  flow: [
    "Short interest is fuel on quality names (squeeze potential) and kindling on weak ones (informed sellers)",
    "Volume expansion confirms the repricing is being absorbed rather than ignored",
  ],
};

const VERDICT_DETAIL: Array<{ v: Verdict; range: string; text: string }> = [
  { v: "BUY_THE_DIP", range: "Signal ≥ 62 + gates", text: "A measured non-impairing cause (market or sector, not company-specific news), a stretched, capitulatory tape, and a business the overlay does not veto. Requires the Signal Score AND a passing catalyst gate: a great tape on a rotten reason to fall never earns a buy. Deploy at full suggested size with the plan's stop." },
  { v: "ACCUMULATE", range: "Signal ≥ 50 + gates", text: "The signal is right but timing confidence is lower, and the catalyst gate must still clear. Scale in across the entry zone in 2–3 tranches instead of calling the exact low." },
  { v: "WATCHLIST", range: "Signal ≥ 38", text: "The dip removed excess without creating a clear edge, or the overlay vetoes the business quality. No edge in being early: set alerts and wait." },
  { v: "FALLING_KNIFE", range: "Signal ≥ 25, or shock", text: "Orderly, persistent selling, or a company-specific fall with an information signature. These patterns continue more often than they reverse. Stand aside." },
  { v: "AVOID", range: "Signal < 25", text: "Weak on every price-derived axis, or an information shock with no floor beneath it. Cheapness is a description, not a thesis." },
];

export default function Methodology() {
  return (
    <div className="container max-w-4xl space-y-6 py-6">
      <header>
        <div className="micro text-gold">The Dip Research Desk</div>
        <h1 className="mt-1 font-mono text-2xl font-bold uppercase tracking-wide text-foreground">Methodology</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          "Buy the dip" is a slogan. This is the underwriting discipline behind it. Every name that sells off hard enters the same
          six-pillar examination a portfolio manager would run before risking client capital, because the only question that matters
          is not <em>how far</em> a stock has fallen, but <em>why</em>, and whether the business the price represents still deserves its recovery.
        </p>
      </header>

      <section className="panel">
        <div className="panel-title">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-foreground">First Principles</h2>
        </div>
        <div className="space-y-3 p-5 text-sm leading-relaxed text-foreground/85">
          <p><span className="font-mono font-bold text-gold">1.</span> A falling price is information, not opportunity. Most dips are the market being right. The edge is in the minority of cases where it is overreacting, and those cases have a signature: transient catalyst, intact earnings power, capitulation volume, definable support.</p>
          <p><span className="font-mono font-bold text-gold">2.</span> We buy temporary problems in permanent businesses. Never permanent problems in any business, however temporary the price looks.</p>
          <p><span className="font-mono font-bold text-gold">3.</span> Short-term dip trading is a probabilities business, not a certainties business. Every position therefore carries three numbers before it carries a fill: an entry zone, a stop, and a target. The stop is not optional; it is the cost of being in the game when you're wrong.</p>
          <p><span className="font-mono font-bold text-gold">4.</span> Position size is the output of conviction and volatility, never of excitement. Suggested sizes cap single-position portfolio risk at 1%.</p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-foreground">The Six Pillars</h2>
          <span className="micro ml-auto">weights sum to 100%</span>
        </div>
        <div className="divide-y divide-hairline">
          {(Object.keys(PILLAR_META) as PillarKey[]).map((k) => (
            <div key={k} className="p-5">
              <div className="flex items-baseline gap-3">
                <h3 className="text-sm font-semibold text-foreground">{PILLAR_META[k].label}</h3>
                <span className="num text-xs font-bold text-gold">{(PILLAR_META[k].weight * 100).toFixed(0)}%</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{PILLAR_META[k].blurb}</p>
              <ul className="mt-3 space-y-1.5">
                {PILLAR_DETAIL[k].map((d, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-foreground/80">
                    <span className="text-gold">·</span>{d}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-foreground">Verdict Bands</h2>
        </div>
        <div className="divide-y divide-hairline">
          {VERDICT_DETAIL.map(({ v, range, text }) => (
            <div key={v} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-start sm:gap-5">
              <div className="flex w-44 shrink-0 flex-col gap-1.5">
                <VerdictBadge verdict={v} />
                <span className="num text-xs text-muted-foreground">score {range}</span>
              </div>
              <p className="text-[13px] leading-relaxed text-foreground/85">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-foreground">Trade Construction</h2>
        </div>
        <div className="space-y-3 p-5 text-[13px] leading-relaxed text-foreground/85">
          <p><span className="font-semibold text-cyanline">Entry zone</span>: from just below the last price down to the support shelf. Accumulation verdicts split entries into tranches across the zone.</p>
          <p><span className="font-semibold text-down">Stop</span>: below the support shelf or 2.2 ATRs under the entry, whichever is more conservative. A close below it means the dip thesis is wrong; the position exits without renegotiation.</p>
          <p><span className="font-semibold text-up">Target 1</span>: a 50% retracement of the dip, the historical median recovery for transient-catalyst dislocations. <span className="font-semibold text-up">Target 2</span>: a full retest of the pre-dip level, held for high-score names only.</p>
          <p><span className="font-semibold text-gold">Expected value</span>: the model-implied win rate applied to the target-1 gain, netted against the stop loss. Positions with negative EV never receive a size, whatever the narrative.</p>
        </div>
      </section>

      <section className="panel border-warnhot/30">
        <div className="panel-title">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-warnhot">Honest Limits</h2>
        </div>
        <div className="space-y-3 p-5 text-[13px] leading-relaxed text-muted-foreground">
          <p>The terminal runs on <span className="font-semibold text-foreground">live quotes, technicals and fundamentals from Financial Modeling Prep</span>, with automatic fallback to a simulated research snapshot when the feed is unavailable or rate-limited. The engine, scoring, and workflow are identical in either mode; only the source of the quantitative inputs changes, and the terminal always labels which mode it's in. Catalyst reads, moat and balance-sheet ratings, and desk notes are analyst judgment in both modes: no data feed supplies them.</p>
          <p>Nothing on this platform is investment advice. Verdicts are model output intended to structure your own judgment. Short-term trading involves substantial risk of loss, and most short-term traders underperform. The stop-loss discipline exists because the model, like every model, is frequently wrong.</p>
        </div>
      </section>

      <div className="pb-4 text-center">
        <Link to="/" className="font-mono text-xs uppercase tracking-wider text-gold hover:underline">← Back to the scanner</Link>
      </div>
    </div>
  );
}

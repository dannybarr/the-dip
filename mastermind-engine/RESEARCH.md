# Mastermind Engine — Research Foundation

> The intellectual bedrock of the engine. This document is the "why" behind every
> module in `mastermind/`. It is written to be read by a portfolio manager first
> and an engineer second. Every design decision in the code traces back to a
> principle stated here.

---

## 0. The Goal (restated precisely)

Build a **world-class swing-trading research engine** that repeatedly finds
**short-to-medium-horizon** opportunities (typically **3 trading days to ~4 weeks**,
i.e. within or between earnings windows) with **asymmetric, high-margin payoffs**.

It stands on three pillars:

1. **Swing trading** — capture multi-day-to-multi-week price moves, not intraday
   noise and not multi-year buy-and-hold.
2. **Undervalued / "discounted" stocks** — buy quality that the market has
   temporarily mispriced (margin of safety).
3. **Educated strategic bets** — theses where the *dominant narrative is wrong or
   overweighted*. The canonical example: **Ferrari (RACE)** sells off on "EVs will
   commoditize luxury autos," but the real drivers — brand scarcity, pricing power,
   waitlists, and resilient China/US ultra-high-net-worth demand — cause a strong
   rebound. The crowd priced the headline; the edge is pricing the *mechanism*.

Overlaid on all three: the discipline of **"JP Morgan's #1 employee"** — a
relentless, unbiased, self-critical operator who compounds capital by avoiding
unforced errors, respecting risk, and updating on evidence rather than ego.

The engine must **critique its own performance without bias** and **optimise
continuously** as news, trends, and indicators evolve.

---

## 1. Why an edge can exist here (the theory of the trade)

Efficient-market purists say you can't beat the market. The honest, evidence-based
position is narrower and more useful: **markets are *mostly* efficient, and the
inefficiencies that remain are concentrated in specific, identifiable places.** Our
entire job is to fish only in those pools.

The durable sources of edge we target:

| Source of edge | Why it persists | How we exploit it |
|---|---|---|
| **Overreaction to salient news** | Humans over-weight vivid, recent, emotionally-charged headlines (availability + affect bias). | Buy quality names on catalyst-driven selloffs where the fundamental damage is smaller than the price reaction. (Pillar 3) |
| **Post-earnings-announcement drift (PEAD)** | Under-reaction to earnings surprises; information diffuses slowly. One of the most robust anomalies in finance (Ball & Brown 1968 → present). | Trade the drift after genuine surprises, gated by quality. |
| **Value / mean-reversion at short horizons** | Short-term price pressure (forced sellers, tax-loss, index rebalancing) is not information. | Buy statistically stretched-but-healthy names; fade the dislocation. (Pillar 2) |
| **Momentum (cross-sectional & time-series)** | Under-reaction + herding create autocorrelation over weeks-to-months. Jegadeesh & Titman 1993. | Ride established trends until exhaustion signals. |
| **Regime-conditional risk premia** | Most factors only pay in the right macro regime; crowds forget this. | Turn factors on/off by detected regime (trend vs mean-reversion, low vs high vol). |
| **Complexity / narrative mispricing** | Multi-step theses ("EV headline is noise, scarcity is signal") are hard, so few do the work. | The strategic-bet layer scores the *mechanism*, not the headline. |

**Design consequence:** the engine is not one model. It is a **portfolio of edges,
each valid in a specific regime**, combined by a meta-model and gated by
fundamental principles. This is why the code separates `features/`
(edge detection), `strategy/principles.py` (the JPM-grade gates), `review/`
(regime-aware self-critique), and `risk/` (survival).

---

## 2. The swing-trading horizon — why 3d–4wk

- **Below ~3 days**: dominated by microstructure, HFT, and slippage. Retail/AI
  research has no durable edge and costs eat everything.
- **Above ~1–2 months**: dominated by fundamentals and macro that a small operator
  can't forecast better than the Street, and capital is tied up (opportunity cost).
- **The 3d–4wk sweet spot**: long enough that *behavioural* mispricings resolve
  (overreactions fade, drift plays out, dislocations mean-revert), short enough to
  compound many independent bets per year and to sit *between earnings prints* so
  each trade has a bounded, analysable catalyst window.

This horizon directly sets: the **labeling** (triple-barrier with a ~5–20 day
vertical barrier), the **features** (lookbacks of days-to-weeks), and the **risk**
(per-trade stops sized to multi-day ATR).

---

## 3. The three pillars → concrete, computable signals

### Pillar 1 — Swing / technical structure
Momentum and mean-reversion are **regime-dependent opposites**, so we compute both
and let the regime detector decide which to trust:
- **Trend/momentum:** 20/50-day returns, MA slope & alignment, ADX-style trend
  strength, breakout vs range.
- **Mean-reversion:** RSI(14), distance from 20-day mean in ATR units (z-score),
  Bollinger position, consecutive down-days.
- **Volatility & liquidity context:** ATR%, realized-vol regime, volume surge
  (climax vs accumulation), gap behavior.

→ `mastermind/features/technical.py`

### Pillar 2 — Undervaluation / discount
"Discount" is only meaningful relative to a name's own quality and history:
- **Relative value:** valuation percentile vs the stock's own trailing history and
  vs sector (P/E, EV/EBITDA, P/S, FCF yield when fundamentals are available).
- **Quality gate (so we buy *discounted quality*, not *cheap garbage* — the value
  trap):** profitability, margin stability, balance-sheet strength, FCF generation.
- **Margin of safety:** how far below a conservative fair-value anchor.

→ `mastermind/features/value.py` and the quality gate in `strategy/principles.py`

### Pillar 3 — Educated strategic bets (the catalyst engine)
This is the differentiator. A strategic bet fires when a **salient negative
narrative** has driven price down **out of proportion to the mechanistic damage**,
and a **counter-mechanism** supports a rebound:
- **Catalyst detection:** abnormal gap-down on volume, news-sentiment shock,
  earnings-reaction asymmetry.
- **Overreaction score:** size of the price move vs the historical price response
  to comparable events; divergence between price reaction and fundamental revision.
- **Counter-thesis features:** does the name have the durable moat (pricing power,
  scarcity, sticky demand) that makes the headline *transient*? (the Ferrari
  pattern — encoded as `resilience`/`moat` factors and a `narrative_gap` score).

→ `mastermind/features/catalyst.py`

**These three feature families are the model's inputs.** No single pillar is a
trade by itself; the ML meta-model learns how they combine, and the principles
layer vetoes anything that violates non-negotiable rules.

---

## 4. Labeling: how we define "a good trade" (avoiding the #1 backtest sin)

We do **not** predict raw next-day return (noisy, and lookahead-prone). We use
**triple-barrier labeling** (López de Prado, *Advances in Financial ML*):

For each candidate entry, set three barriers over the swing horizon:
1. **Profit-take** barrier (e.g. +2.0×ATR or a target %),
2. **Stop-loss** barrier (e.g. −1.0×ATR),
3. **Vertical/time** barrier (e.g. 15 trading days).

The label is **which barrier is hit first** → {win, loss, timeout}. This is the
*actual* outcome of a realistically-managed swing trade, so the model learns to
predict *tradeable, risk-defined* success — not statistical curiosities. Barriers
are ATR-scaled so labels are comparable across volatility regimes.

→ `mastermind/labeling/triple_barrier.py`

---

## 5. The model: probability of a favorable, risk-defined swing

- **Primary learner:** gradient-boosted trees (`HistGradientBoostingClassifier`,
  drop-in swappable for LightGBM/XGBoost). Chosen for tabular strength, native
  handling of nonlinear factor interactions, robustness, and calibratable
  probabilities.
- **Target:** P(profit-take barrier hit before stop / timeout).
- **Meta-labeling:** a second layer decides *whether to act* on a primary signal and
  *how big* — this cleanly separates "direction" from "bet sizing" and lifts
  precision (fewer, better trades), exactly the JPM-grade discipline of passing on
  marginal setups.
- **Calibration:** probabilities are isotonic/Platt-calibrated so that a "0.7" means
  70% — essential because position sizing (Kelly-style) consumes the probability
  directly.
- **Conviction score** = calibrated edge × quality gate × regime fit. This single
  number drives ranking and sizing.

→ `mastermind/models/` and `mastermind/strategy/signals.py`

---

## 6. Validation: the part that separates real edges from self-deception

Backtesting is where 95% of "amazing" strategies die. Non-negotiable rules baked
into the engine:

1. **Walk-forward, purged, embargoed** — train on the past, test on the strictly
   future; **purge** overlapping-label samples and **embargo** a gap so leakage from
   overlapping horizons can't inflate results. → `backtest/engine.py`
2. **No lookahead** — every feature at time *t* uses only data available at *t*
   (point-in-time). Adapters and the feature pipeline enforce this.
3. **Costs are real** — commissions, spread, and slippage modeled on every fill.
   An edge that dies on costs is not an edge.
4. **Out-of-sample honesty** — the final reported metrics come only from data the
   model never touched in any tuning pass.
5. **Deflated expectations** — with many trials, some strategy looks great by luck.
   We track number of trials and prefer the deflated Sharpe intuition (report,
   don't cherry-pick).

Metrics reported: CAGR, **Sharpe & Sortino**, max drawdown & recovery, **hit rate,
profit factor, expectancy**, average win/loss, turnover, and exposure.
→ `backtest/metrics.py`

---

## 7. Risk management: how the engine *survives* to compound (the JPM core)

Edge is worthless without survival. The mandate: *never risk ruin, and let winners
compound.*
- **Fixed-fractional risk per trade** (default **1.0% of equity at risk** to the
  stop), so no single idea can wound the book.
- **Fractional-Kelly sizing** (default ½-Kelly cap) from the calibrated edge —
  aggressive enough to matter, damped enough to survive estimation error.
- **Hard stops** at the triple-barrier stop level; **no averaging down** into losers
  (the classic account-killer).
- **Portfolio constraints:** max positions (default 8, "balanced conviction"),
  per-name cap, gross-exposure cap, and correlation/sector concentration limits so
  we don't own eight versions of the same bet.
- **Regime-aware throttle:** cut gross exposure in high-volatility / risk-off
  regimes.

→ `mastermind/risk/manager.py`

---

## 8. The self-review & optimisation loop (the "critically, unbiasedly reviews itself")

The engine treats its own track record as a dataset. After each walk-forward fold
(and, in production, on a schedule), the **review layer**:

1. **Attributes performance** — by regime, by pillar, by sector, by conviction
   bucket, by holding period. *Where* is the edge real, and where is it noise?
2. **Runs an unbiased self-critique checklist** — is the OOS Sharpe holding vs
   in-sample (overfit check)? Is hit-rate decaying (alpha decay)? Are losses
   clustering in a regime the model misreads? Is calibration drifting?
3. **Proposes concrete adjustments** — reweight/disable a decaying factor, retune
   barriers, tighten the conviction threshold, shrink exposure in a losing regime.
4. **Guards against overfitting its own review** — changes must improve *out-of-
   sample* and clear a minimum-evidence bar (enough trades) before adoption;
   otherwise they're logged as hypotheses, not applied. This is the antidote to
   curve-fitting the past.

The output is a structured, human-readable **self-review report** plus a machine
-readable set of proposed parameter deltas. This is the "reviews itself constantly
to keep up to date" requirement, implemented as a disciplined feedback controller
rather than a black box that silently mutates.

**Capital-utilisation sweep.** Beyond the fold-to-fold controller, a constrained
optimiser (`optimize/sweep.py`) grids the deployment levers — niche breadth, cooldown,
and sizing aggressiveness — and picks the point that **maximises return subject to a
drawdown budget**. It shares one fold-cache across the grid (the model training doesn't
depend on these knobs), so the whole sweep costs about two backtests instead of dozens.
This is how the engine answers "how hard should the book work?" with evidence, not a
guess — and it exposed that per-trade risk saturates the per-name weight cap, so the two
must be tuned together.

→ `mastermind/review/self_review.py`

---

## 9. Staying current: news, trends, indicators

Two clocks:
- **Slow clock (weekly/off-hours):** refit models on the expanded window, re-detect
  regime, re-estimate factor efficacy, run the full self-review, update the
  watchlist universe.
- **Fast clock (daily/intraday):** refresh prices/indicators, re-score the universe,
  ingest fresh catalysts (news-sentiment + event feeds via adapters), emit ranked
  signals.

News/sentiment enters through the **catalyst adapter interface** so any provider
(FMP, news APIs, an LLM-based sentiment scorer) can plug in without touching the
model. In this build sandbox the live *keyed* feeds (FMP/Yahoo) are firewalled, so the
FMP adapter is import-safe and switches on at deploy — the same pattern The Dip uses.
The full stack has been run end-to-end on **real S&P-500 daily OHLCV (2013–2018)** via
the CSV adapter and a public dataset (`scripts/fetch_real_data.py`); see RESULTS.md §9
for the honest walk-forward numbers. On price-only real data the value/quality pillar
falls back to price proxies and the catalyst pillar to price-derived shock detection —
point-in-time fundamentals and a real news feed are the next unlocks.

---

## 10. Honest limitations & anti-hype stance (JPM-grade intellectual honesty)

- **No guarantees, ever.** The engine outputs *probabilities and risk-defined
  ideas*, not certainties. Reported edges are hypotheses that must survive OOS.
- **Backtests overstate.** Regime shifts, crowding, and slippage degrade live
  results vs paper. We deliberately model costs high and size conservatively.
- **Data quality dominates.** Survivorship bias, point-in-time fundamentals, and
  corporate actions can fabricate fake alpha; adapters must deliver clean,
  point-in-time data before any live capital.
- **This is decision support, not a licensed advisor.** It informs a human
  operator. Nothing here is investment advice.
- **Regime risk is the real killer.** The self-review loop exists precisely because
  yesterday's edge decays; the discipline is to notice fast and adapt without
  overfitting.

---

## 10b. Niche specialisation & concentration (differentiate for maximal upside)

A world-class book does not trade every name the same way — it **specialises where its
edge actually lives** and **concentrates capital** into its best ideas. Two mechanisms:

- **Adaptive niche selection.** Every fold, the engine scores each name's
  *exploitability for this strategy* — do its shocks reliably bounce (catalyst
  recovery win-rate), does it give enough shots (event frequency), how big is the net
  bounce, is it a resilient/quality name, and is its volatility governable — using only
  point-in-time data. It keeps the top-K "niche" and **re-selects over time, so the
  niche EVOLVES**: a name that stops behaving this way drops out; a newly-resilient one
  enters. The selection is driven purely by realised behaviour, not our priors about a
  ticker — the unbiased specialisation the mandate asks for. → `universe/selector.py`
- **Concentration.** A per-name **cooldown** enforces one clean shot per catalyst
  (no re-entry dilution while a signal stays flagged), and **conviction-tilted sizing**
  puts more capital behind the highest-conviction names — fewer, bigger, better bets.
  On the synthetic harness this lifted per-trade expectancy 3.5× (see RESULTS.md §7).

This is the differentiator: the crowd trades a broad watchlist uniformly; the engine
concentrates on the specific names and specific dislocations where the overreaction
edge is strongest, and rotates that focus as the market changes.

## 11. From research to code — the module map

| Principle (this doc) | Module |
|---|---|
| §3 Pillar 1 technical structure | `mastermind/features/technical.py` |
| §3 Pillar 2 value + quality | `mastermind/features/value.py` |
| §3 Pillar 3 strategic-bet catalysts | `mastermind/features/catalyst.py` |
| §4 triple-barrier labels | `mastermind/labeling/triple_barrier.py` |
| §5 model + meta-label + calibration | `mastermind/models/` |
| §5 conviction, §7 principle gates | `mastermind/strategy/` |
| §6 walk-forward + costs | `mastermind/backtest/` |
| §7 sizing & survival | `mastermind/risk/manager.py` |
| §8 self-review & optimisation | `mastermind/review/self_review.py` |
| §10b niche selection & evolution | `mastermind/universe/selector.py` |
| §8 capital-utilisation sweep | `mastermind/optimize/sweep.py` |
| §9 data/news adapters | `mastermind/data/` |
| orchestration of all of it | `mastermind/engine.py` |

Everything downstream is an implementation of the principles above. When in doubt,
this document wins.

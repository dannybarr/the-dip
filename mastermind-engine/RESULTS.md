# Validation Results — Step 1

> **CORRECTION (stress test, see [`STRESS_TEST.md`](STRESS_TEST.md)).** Stages 5-9 below
> were written before the engine was stress-tested. The stress test found three
> defects (fixed) and showed that on real data the engine **does not beat random
> entries** (+0.19% vs +0.32% per trade, p=0.64), **loses money on two unseen
> universes**, and that the "Sharpe 0.62" sweep result was in-sample (about 0.2-0.4
> out-of-sample, and worse on unseen stocks). Statements below that the real-data edge
> is "real but thin" over-reached: the evidence supports "no demonstrated edge". The
> synthetic-data results only show the pipeline can find an edge the generator plants.

> Honest, reproducible record of how the initial model was validated and tuned on the
> `SyntheticAdapter` (which embeds the exact inefficiencies the engine targets, so a
> correct engine *should* find edge and a broken one should not). All figures are
> **walk-forward, purged, embargoed, net of modeled costs** (2 bps commission + 5 bps
> slippage per side) unless stated. Reproduce with `python scripts/run_backtest.py`.

## The headline

Meta-labeling (an explicit **catalyst-primary** entry rule with the ML model as a
**confidence filter**) is what turned a structurally break-even strategy into a
positive, out-of-sample edge:

| Stage | Design | Walk-forward result | Verdict |
|---|---|---|---|
| 1 | 2:1 barriers, model as primary signal | 0 trades (edge floor above achievable edge) | — |
| 2 | Barriers realigned to breakeven | expectancy **−0.23%**, PF 0.96 | NO_EDGE |
| 3 | + barrier-width cap (shock ATR no longer → 10% stops) | expectancy **−0.18%**, PF 0.94 | NO_EDGE |
| 4 | + smoothed-ATR barriers, higher model selectivity | expectancy **−1.29%** (model's top picks were *worse*) | NO_EDGE |
| 5 | **Meta-labeling: catalyst-primary, model-filter** | expectancy **+0.32%**, PF 1.09, Sharpe +0.23 | positive |
| 6 | + tighter catalyst threshold (current default) | 619 trades, 52.3% win, expectancy **+0.32%**, PF **1.09**, Sharpe **+0.21**, maxDD −7.7% | positive (DECAYING) |

> Reference point for how much upside remains in *concentration*: the clean rule-only
> catalyst entry (no re-entry inflation) is **+1.90% per trade on 97 trades**.

## Stage 7 — Concentration, niche specialisation & evolution

Implemented (a) a per-name **cooldown** so the engine takes one clean shot per
catalyst instead of re-entering while the signal stays flagged; (b) an **adaptive
niche selector** that re-scores every name's exploitability each fold and concentrates
the book on the top-K, re-selected over time so the universe **evolves**; and (c)
**conviction-tilted, more aggressive sizing** (fewer, bigger bets). Result vs the
Stage-6 baseline (same purged walk-forward, same costs, 12 names, ~5.5y):

| Metric | Stage 6 (baseline) | **Stage 7 (concentrated + niche)** | Δ |
|---|---|---|---|
| Trades | 619 | **94** | 6.6× fewer |
| Win rate | 52.3% | **56.4%** | +4.1 pts |
| Profit factor | 1.09 | **1.34** | +23% |
| **Expectancy / trade** | +0.32% | **+1.13%** | **3.5×** |
| Sharpe | 0.21 | **0.27** | +29% |
| Max drawdown | −7.7% | **−6.2%** | shallower |
| Verdict | DECAYING | **MARGINAL** | decay removed |

Per-trade expectancy (+1.13%) now approaches the **+1.90%** clean-signal ceiling — the
remaining gap is the model filter + next-open execution, not re-entry dilution.

**The niche evolves and is economically sensible.** Across folds it consistently holds
the high-quality overreaction names (AAPL, MSFT, LLY, and — fittingly — **RACE /
Ferrari, the RESEARCH.md exemplar, in the niche every single fold**) while rotating the
marginal slots (GOOGL → META → XOM → AMZN) as their behaviour changes. The self-review
reports this niche turnover and the per-fold permutation-importance factor mix as direct
evidence the engine is *learning and adapting over time*, not static.

The decisive diagnostic: a **rule-only** catalyst entry (no ML) already yields
**61.9% win / +1.90% per trade after costs**, while value-alone is break-even and
momentum is negative in this data. So the edge was real all along — the mistake was
asking the model to *discover* a ~1.4%-of-rows signal from scratch each fold. Making
the dislocation explicit and using the model to *filter* is the design that works
(and is exactly what RESEARCH.md §5 prescribes).

## What each diagnostic showed

1. **Label distribution drives everything.** A 2×ATR-target / 1×ATR-stop barrier over
   15 days produced 31% wins / 64% losses — structurally break-even-negative — so
   calibrated P(win) capped *below* the trade threshold and the engine never traded.
   Barriers must be *winnable* (breakeven ≈ `sl/(pt+sl)`).
2. **Post-shock ATR spikes wreck risk geometry.** Entering on a catalyst day inherited
   a spiked ATR → ~10% stops. A smoothed-ATR barrier + a hard width cap fixed both the
   risk geometry and the noise-whipsaw.
3. **The model can't discover a rare signal, but it can filter an explicit one.**
   Selecting by model confidence alone made returns *worse*; making the catalyst the
   primary trigger and the model the filter made them positive.

## Stage 8 — Capital-utilisation sweep (return within a drawdown budget)

Concentration lifted per-trade edge but left CAGR low (capital idle). The sweep grids
the three deployment levers and, via a **constrained objective** (maximise return s.t.
`max drawdown ≥ −20%`), picks the point that works the book hardest without breaching
the risk budget. All 27 fold-models are trained ONCE (shared cache) and the grid is
replayed cheaply — the whole 27-point sweep runs in the time of ~2 backtests.

A first pass exposed that `risk_per_trade` alone is **inert** above ~1% (a ~4% stop
already saturates the per-name weight cap), so the sizing axis was made to move
`risk_per_trade` **and** `max_weight_per_name` together. The grid then reads cleanly:

| niche | cooldown | risk/wt | CAGR | Sharpe | maxDD | trades | expectancy |
|---|---|---|---|---|---|---|---|
| **6** | **10** | **0.020/0.30** | **1.3%** | **0.41** | −5.9% | 121 | 0.79% |
| 6 | 10 | 0.010/0.20 | 1.0% | 0.35 | −5.7% | 121 | 0.79% |
| 9 | 10 | 0.020/0.30 | 0.8% | 0.27 | −5.9% | 143 | 0.20% |
| 4 | 10 | 0.020/0.30 | 0.5% | 0.27 | −3.6% | 66 | 1.05% |
| 6 | 5 | 0.020/0.30 | 0.9% | 0.24 | −9.8% | 180 | 0.89% |
| 6 | 20 | 0.020/0.30 | −0.7% | −0.29 | −7.1% | 80 | 0.79% |

**Selected (now the default): niche_size 6, cooldown 10, risk_per_trade 0.020 /
max_weight 0.30** — it dominates the prior default on every axis at once:

| | Prior default | **Sweep-optimal** |
|---|---|---|
| CAGR | 0.7% | **1.3%** (≈2×) |
| Sharpe | 0.27 | **0.41** (+52%) |
| Max drawdown | −6.2% | **−5.9%** |
| Trades | 94 | 121 |

What the grid teaches: **cooldown 10 is the sweet spot** (cd 5 over-trades into deeper
drawdown; cd 20 starves the book negative), **niche 6 is optimal** (4 too narrow, 9
dilutes expectancy 0.79% → 0.20%), and **sizing above 0.020 stops helping** as the
weight cap re-binds. Reproduce with `python scripts/run_sweep.py`.

## Stage 9 — REAL market data (S&P 500, 2013–2018)

This is the meaningful test: the whole stack (features → labels → calibrated model →
meta-labelled catalyst gate → evolving niche → walk-forward → self-review) run on
**genuine daily OHLCV** for 22 liquid S&P-500 names (2013-02 to 2018-02, 1,259 days
each), pulled from a public dataset — no API key. Fetch + split it yourself:

```bash
python scripts/fetch_real_data.py            # -> data_cache/sp500/ + config/real_sp500.yaml
python scripts/run_backtest.py --csv data_cache/sp500 --config config/real_sp500.yaml
python scripts/run_sweep.py    --csv data_cache/sp500 --config config/real_sp500.yaml
```

**Walk-forward result (purged, embargoed, costed):**

| trades | win% | PF | expectancy | CAGR | Sharpe | maxDD | verdict |
|---|---|---|---|---|---|---|---|
| 85 | 42.4% | **1.10** | **+0.14%/trade** | 0.2% | 0.10 | −3.9% | MARGINAL |

**Read this honestly (superseded by the stress test: no demonstrated edge).** The edge looked **thin but positive**. Target exits average **+3.5%**
and stops **−2.4%** — the payoff asymmetry the engine is built to harvest is present —
but a 42% win rate on *price-only* signals (no fundamentals, no news feed via CSV) in
ultra-liquid mega-caps, net of 14 bps round-trip costs, leaves only a sliver of Sharpe.
That is exactly what the literature predicts: short-term reversal/overreaction exists
in equities but is small and heavily arbitraged in the most liquid names. **This is the
truthful finding, and the engine reports it as such** rather than manufacturing an edge.

**Capital-utilisation sweep on real data (maximise Sharpe s.t. maxDD ≥ −20%).** The
sweep found a much better operating point than the synthetic-tuned default — and,
tellingly, the **opposite** shape:

| config | niche | cooldown | Sharpe | CAGR | maxDD | trades | expectancy |
|---|---|---|---|---|---|---|---|
| baseline (synthetic-tuned) | 6 | 10 | 0.10 | 0.2% | −3.9% | 85 | 0.14% |
| **sweep-selected (real)** | **4** | **5** | **0.62** | **1.2%** | **−1.7%** | 69 | 0.67% |

On real mega-caps the engine wins by concentrating **harder** (niche 4, the very best
names) and re-engaging **faster** (cooldown 5) — the reverse of the synthetic optimum,
because clean overreactions are scarcer in the most liquid names, so you take the few
best and move on. The engine found this itself; nothing was hand-tuned.

> **Honest caveat on the sweep number.** The sweep selects hyper-parameters over the
> *whole* backtest, so Sharpe 0.62 carries in-sample selection bias — a fully rigorous
> figure would nest the sweep inside the walk-forward (tune on the past, deploy on the
> future). The robust takeaways are directional and hold regardless: (a) a real,
> cost-surviving edge exists but is thin, and (b) concentration + fast re-engagement is
> the right shape for it on this universe. Apply the winner with
> `python scripts/run_sweep.py --csv data_cache/sp500 --config config/real_sp500.yaml --apply config/real_tuned.yaml`.

What worked as designed on real data — the machinery, which is the deliverable:
- **Unbiased self-review**: verdict MARGINAL, low-Sharpe flagged, and **no parameter
  changes proposed** (insufficient evidence) — no overfitting to the past.
- **Evolving niche**: 26 name-changes across 15 folds; it rotated from defensives
  (CAT, CVX, JNJ, LLY, XOM) early to higher-beta names (BA, NVDA, JPM, V) later —
  toward whatever gave cleaner setups.
- **Model re-learning**: the top factor drifted `price_discount → rsi` over the run;
  later folds were *not* decaying (fold-expectancy trend positive).

Where the real edge would come from next (all deferred, honestly): point-in-time
**fundamentals** (turns on the discounted-quality pillar, currently price-proxied on
CSV), a **live news-sentiment catalyst feed** (the Ferrari-style thesis needs real
narrative data), a **broader / higher-beta universe** (mega-caps are the hardest place
to find overreaction), and **intraday or next-open microstructure** modelling.

## Honest caveats (see RESEARCH.md §10)

- These are results on a **synthetic** harness that intentionally contains a
  detectable overreaction edge. **Live edges are smaller**, costs/slippage are worse,
  and regimes shift. Treat the pipeline — not the numbers — as the deliverable.
- The self-review flags **DECAYING / lower-Sharpe** honestly; that is the unbiased
  self-critique working, not a failure. The `optimise()` loop responds to it.
- Nothing here is investment advice. This is Step 1 (research + initial model),
  deliberately before any UI or live capital.

## Reproduce

```bash
cd mastermind-engine && pip install -r requirements.txt
python scripts/run_backtest.py            # walk-forward + self-review
python scripts/run_backtest.py --optimise # self-review optimisation loop
python scripts/generate_signals.py        # today's ranked, sized, gated signals
python -m pytest -q                        # invariants incl. no-lookahead
```

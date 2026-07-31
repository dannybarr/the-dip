# Mastermind Engine

A self-reviewing **swing-trading research engine** built on three pillars:

1. **Swing trading** — capture 3-day-to-4-week behavioural mispricings (within/between
   earnings windows), not intraday noise or multi-year holds.
2. **Undervalued / discounted quality** — buy quality the market has temporarily
   mispriced, with a margin of safety (and a quality gate against value traps).
3. **Educated strategic bets** — theses where the dominant narrative is wrong. The
   canonical case: *Ferrari sells off on "EVs commoditize luxury," but scarcity,
   pricing power and resilient demand drive a strong rebound.* The engine scores the
   **mechanism**, not the headline.

Overlaid with **JP-Morgan-grade risk discipline** and a **continuous, unbiased
self-review loop** that critiques its own track record and proposes optimisations
without overfitting.

> **This is decision-support research tooling, not investment advice, and not a
> licensed advisor.** It outputs probabilities and risk-defined ideas. Backtests
> overstate live results. See `RESEARCH.md` §10.

The full "why" behind every module is in **[`RESEARCH.md`](./RESEARCH.md)** — read it
first. The honest, reproducible validation record (how meta-labeling turned a
break-even strategy into a positive purged walk-forward edge) is in
**[`RESULTS.md`](./RESULTS.md)**. This README is the "how to run it."

---

## Architecture

```
data/         Source-agnostic adapters (Synthetic | CSV | FMP). Point-in-time OHLCV,
              fundamentals, catalysts. Live feeds switch on at deploy.
features/     The 3 pillars as computable, no-lookahead signals:
                technical.py  momentum + mean-reversion + vol/liquidity
                value.py      relative-value discount + quality composite
                catalyst.py   shock detection + overreaction + narrative-gap
labeling/     triple_barrier.py — labels = which of {profit, stop, timeout} hits first
models/       gbm.py — calibrated gradient-boosted P(win), meta-labeled
strategy/     principles.py  the non-negotiable JPM gates (margin of safety, quality,
                             thesis, no falling knives) + META-LABELING (catalyst is
                             the primary trigger; the model is the confidence filter)
              signals.py     conviction score -> ranked signals
universe/     selector.py — adaptive NICHE selection: score each name's exploitability
                            and concentrate on the best K, re-selected/EVOLVING per fold
risk/         manager.py — fixed-fractional + fractional-Kelly sizing, conviction tilt,
                            per-name cooldown, portfolio caps (concentration)
optimize/     sweep.py — capital-utilisation sweep: grid the deployment knobs and pick
                         the point that maximises return within a drawdown budget
                         (shared fold-cache trains once, replays the grid cheaply)
backtest/     engine.py  walk-forward, purged, embargoed, realistic costs
              metrics.py Sharpe/Sortino/DD/PF/expectancy
review/       self_review.py — unbiased self-critique + evidence-gated optimisation
engine.py     MastermindEngine — orchestrates the slow clock (backtest+review) and
              the fast clock (today's signals)
```

## Quickstart

```bash
cd mastermind-engine
pip install -r requirements.txt

# Walk-forward backtest + self-review on synthetic data (runs out of the box):
python scripts/run_backtest.py

# Run the self-review OPTIMISATION loop (backtest -> critique -> re-test):
python scripts/run_backtest.py --optimise

# Capital-utilisation sweep: grid niche_size x cooldown x sizing, and pick the point
# that MAXIMISES return within a drawdown budget (trains folds once, replays the grid):
python scripts/run_sweep.py --max-dd 0.20 --objective cagr
python scripts/run_sweep.py --max-dd 0.15 --apply config/tuned.yaml   # save the winner

# Today's ranked, risk-sized, principle-gated signals:
python scripts/generate_signals.py

# Backtest on your OWN data (a directory of <TICKER>.csv with date,open,high,low,close,volume):
python scripts/run_backtest.py --csv /path/to/csvs

# Tests:
python -m pytest -q
```

## Using real, live data (at deploy)

In this build sandbox, outbound finance hosts are firewalled, so everything is proven
on the `SyntheticAdapter` (which embeds the exact inefficiencies the engine targets)
and on CSVs. To go live, point the FMP adapter at your key or at The Dip's existing
FMP proxy — no engine code changes:

```bash
export FMP_API_KEY=...              # or:
export FMP_BASE_URL=https://<your-dip-vercel-app>/api/fmp   # keeps the key server-side
```

```python
from mastermind import load_config, MastermindEngine
from mastermind.data import FMPAdapter

cfg = load_config()
engine = MastermindEngine(cfg, adapter=FMPAdapter())
print(engine.scan().sized)          # today's book
```

Any provider works by implementing the small `DataAdapter` contract in
`mastermind/data/base.py` (history + optional fundamentals + optional catalysts/news).

## Configuration

All strategy parameters live in `config/default.yaml` (profile: **balanced
conviction**) — nothing is hard-coded, so the self-review loop can propose deltas and
you can trial them immutably via `Config.with_overrides({...})`. Key knobs: the swing
horizon, triple-barrier ATR multiples, the conviction/edge floors, the risk budget and
portfolio caps, and the walk-forward windows.

## What "done" means for Step 1

This is **Step 1: research foundation + a runnable, tested initial model** — deliberately
*before* any UI. It proves the full pipeline end-to-end (features → labels → calibrated
model → principle-gated signals → risk-sized portfolio → walk-forward backtest →
unbiased self-review) on data where a correct engine *should* find an edge and a broken
one should not. Next steps live in `RESEARCH.md` §9 (real-data wiring, live news
sentiment, then the UI).

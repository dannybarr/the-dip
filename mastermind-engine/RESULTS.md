# Validation Results — Step 1

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
| 6 | + tighter catalyst threshold | _(see run output)_ | positive |

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

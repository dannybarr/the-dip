# Stress Test — can we trust the engine?

**Verdict: no. Not yet, and not as an alpha source.** The *infrastructure* passed
every integrity check. The *strategy* did not show an edge over random entries on real
data, and it lost money on stocks it had not been tuned on.

Run on real S&P-500 daily data (2013-02 → 2018-02, out-of-sample from 2014-06), 22
curated large-caps plus two random 25-stock universes, walk-forward with purged
labels, after fixing three defects found by a code audit (below). Reproduce:

```bash
python scripts/fetch_real_data.py
python scripts/stress_test.py --csv data_cache/sp500 --config config/real_sp500.yaml \
    --master data_cache/all_stocks_5yr.csv --out reports/stress_full
```

Raw output: [`validation/stress_full.json`](validation/stress_full.json).

## Scorecard

| # | Test | Question | Result | Pass? |
|---|------|----------|--------|-------|
| 1 | Causality (static) | Do features / labels / niche choice use the future? | 0 leaking features (218,700 cells), 0 label mismatches, 0 niche mismatches | **Pass** (after fixes) |
| 2 | Causality (end-to-end) | Does a backtest on truncated data reproduce the same trades? | 54/54 trades identical, 0 differences either way | **Pass** |
| 3 | Null: random entries | Is the engine better than random entries with identical stops/targets/costs? | Engine **+0.19%**/trade vs random **+0.32%** (p = 0.64); same entry dates, random tickers **+0.49%** (p = 0.82) | **Fail** |
| 4 | Unseen universes | Does it work on stocks it was not tuned on? | Random #1: **−0.37%**/trade, PF 0.79. Random #2: **−0.21%**/trade, PF 0.88. Engine below random-entry null in both (p = 0.68, 0.73) | **Fail** |
| 5 | Statistical power | Can 85 trades prove an edge? | Expectancy 95% CI **[−0.55%, +0.94%]**, P(>0) = 69%. ~1,300 trades needed | **Inconclusive** |
| 6 | Costs | Does it survive higher costs? | +0.19% at 1×, +0.05% at 2×, **−0.09% at 3×**, −0.37% at 5× | **Fragile** |
| 7 | Stability | Consistent across years? | By year: +0.67, +0.38, **−0.56**, +0.32, −0.01 %/trade | **Weak** |
| 8 | Benchmark | Beats buy-and-hold? | CAGR **0.4%** vs equal-weight buy-and-hold **21.3%**; beta 0.03; alpha −0.3%/yr | **Fail** |
| 9 | Nested tuning | Does a sweep tuned on one half work on the other? | In-sample Sharpe 1.53 → **0.17** OOS; 0.85 → **0.43** OOS; rank-corr +0.55 | **Partial** |
| 10 | Realistic exits | Did naive stop fills flatter the result? | Win rate 42.4% → 41.2%, expectancy +0.23% → +0.19% | Minor |

## What this means

1. **The positive expectancy is market drift, not skill.** Random entries using the
   same stops, targets and costs earn *more* than the engine (+0.32% vs +0.19%).
   2014-2018 was a strong bull market (equal-weight buy-and-hold +21%/yr), so almost
   any long entry looked profitable. The engine's selection added nothing, and on
   two independent universes it was worse than random.
2. **The "Sharpe 0.62" reported after the real-data sweep was inflated.** It was
   selected in-sample. Out-of-sample the same procedure gave roughly 0.2-0.4, and the
   tuned parameters (niche 4, cooldown 5) did *worse* on an unseen universe
   (−0.90%/trade, PF 0.60). Treat that figure as superseded.
3. **The thin margin disappears under realistic frictions.** Break-even is roughly
   2-3× the assumed costs (2 bps commission + 5 bps slippage per side). Less-liquid
   names or retail execution could easily sit there.
4. **The strategy is mostly cash** (beta 0.03). Low drawdown (−3.3%) is a product of
   barely being invested, not of skill; it earned 0.4%/yr while the stocks it
   trades returned 21%/yr.
5. **We cannot prove the edge is zero either.** 85 trades over ~3.6 years is far too
   few to detect a small edge (~1,300 needed). The honest reading is "no evidence of
   edge, and point estimates at or below random", not "proven worthless".

## Defects found by the audit (fixed)

The stress test began with a code audit that found three real defects. All are fixed
and covered by the causality tests above.

- **Look-ahead leak in niche selection.** Niche scoring used triple-barrier labels
  that look up to 20 bars *past* the as-of date, so the niche choice peeked at the
  future. Now only events whose barrier was touched on or before the cutoff count.
- **Optimistic stop fills.** A stock gapping down through the stop filled at the
  stop price (and, on an entry-day gap-down, could book a phantom win). Now fills at
  the worse open (`backtest.gap_aware_exits`).
- **Trade accounting.** Entry slippage was double-counted in per-trade return.
- **End-of-data labels.** Windows truncated by the end of the data were labelled 0
  "timeouts", so a live `scan()` would have trained the newest rows as false
  non-wins. Now unresolved (NaN).

Impact on the headline was small (expectancy +0.14% → +0.19%, Sharpe 0.10 → 0.15 on
the 22-name baseline), so these defects did not manufacture the earlier result; the
earlier *conclusions* over-reached for the reasons above.

## What is solid vs what is not

**Solid (worth keeping):** the validation machinery. Causality is verified end to
end, the null/bootstrap/nested/universe tests now exist and run in one command, and
the engine's own self-review correctly refused to propose changes on thin evidence.
This harness is what stopped us from building on a mirage.

**Not supported:** the alpha. The synthetic-data results (Sharpe 0.4-0.6, +1.1%/trade)
only show that the pipeline can find an edge *that the generator deliberately plants*.
They say nothing about real markets, and real markets did not reproduce them.

## Limitations of this stress test

- Only ~3.6 years out-of-sample, one regime (a bull market), survivors of the 2018
  S&P 500 index. The universe is large-cap, the hardest place to find overreaction.
- Price-only: no fundamentals, no news. The "discounted quality" and "narrative gap"
  pillars run on price proxies, so the Ferrari-style thesis was never actually
  tested with real narrative data.
- Parameter sensitivity of the labeling/model (barrier multiples, thresholds) was not
  swept, since each variant needs a full retrain.
- Random universes were drawn from the same 2018 survivors.

## Recommended next step

Before any UI, capital or further tuning: **test the thesis directly with an event
study** on all ~500 stocks already downloaded. Do quality large-caps that drop >N
sigma on heavy volume rebound over 5-20 days *more than matched non-event days*?
That is one clean, null-controlled question answerable from thousands of events (the
engine's 85 trades cannot answer it). If there is no abnormal rebound on price-only
data, the thesis needs real catalyst data (earnings surprises, news sentiment,
fundamentals), which is where the Ferrari-type edge would have to come from. If there
*is* an abnormal rebound, we know where to aim the model.

# Trend-following terms inside the reversion pillars were inverting them

Summary: the Signal Score had no measured edge (IC 0.003 / 0.017 / 0.020 at
5 / 20 / 60 sessions, negative quintile spread at every horizon). The cause was
not missing signal. It was two trend-following terms buried inside the two
mean-reversion pillars, cancelling the content their own inputs carried.

## The diagnosis

Component-level rank IC against forward returns, over the covered universe:

| Component | IC 20d | IC 60d |
| --- | --- | --- |
| catalyst pillar | +0.033 | +0.046 |
| dip z-score | +0.032 | +0.043 |
| volume ratio | +0.011 | +0.039 |
| RSI(14) | -0.039 | -0.032 |
| weekly move % | -0.043 | -0.082 |
| drawdown from high | -0.024 | -0.065 |
| **dipCharacter pillar** | **-0.009** | **-0.011** |
| **technical pillar** | **-0.007** | **-0.032** |

Read the signs. RSI at -0.039 means *more oversold predicts better returns*. The
technical pillar consumes RSI and correctly inverts it (`scale(-rsi14, ...)`),
yet the pillar scored -0.032. It was reversing its own best input.

The culprit was `trendIntact`, 35% of the technical pillar, which paid 85/100 to
any name above its 200-day. Deeper falls reverted harder (weekly move -0.082,
drawdown -0.065) and the pillar was scoring them down. `notBrokenTrend`, 20% of
dip character, did the same thing with drawdown.

Both are trend-following terms inside a mean-reversion engine. Buying a dip is a
bet against trend, so rewarding trend-intactness is a design contradiction before
it is an empirical error. That is why removing them is a principled change and
not a curve fit.

## The fix and its effect

Removed both terms, redistributed their weight within each pillar. No parameter
was tuned, no threshold moved, no term added. Degrees of freedom went down.

| | IC 5d | IC 20d | IC 60d | Spread 5d | Spread 20d | Spread 60d |
| --- | --- | --- | --- | --- | --- | --- |
| Before | 0.003 | 0.017 | 0.020 | -0.09% | -0.23% | -1.75% |
| After | 0.019 | 0.049 | 0.070 | +0.22% | +1.69% | +3.83% |

The quintile spread flipped from negative to positive at all three horizons. Top
quintile at 60 sessions went from +6.00% to +8.01% while the bottom fell from
+7.75% to +4.18%: the ranking now separates in the right direction.

## Why this is still not tradeable

IC by calendar year, 60 sessions:

| Year | N | IC60 | Spread60 |
| --- | --- | --- | --- |
| 2022 (partial) | 565 | -0.010 | -2.23% |
| 2023 | 2682 | +0.086 | +5.52% |
| 2024 | 2792 | +0.002 | -0.44% |
| 2025 | 2770 | +0.106 | +6.17% |
| 2026 (partial) | 1742 | +0.159 | +7.53% |

It works in three years out of five and does nothing in two. Chronological halves
give IC60 of 0.053 then 0.092, so it is not decaying and not the artefact of a
single window, which is the main thing the split was there to rule out. But a
signal that disappears in 40% of years is not one to size positions on.

Two caveats that do not go away by looking harder at this data. The fix was
diagnosed on the same sample it is measured on, so the headline numbers are
in-sample by construction. And the universe is 24 mega-cap survivors, so every
return here is inflated by names that lived.

## How to apply

When a composite scores worse than its own inputs, do not add signal. Look for a
component pulling the other way and check each one's IC separately before
touching weights. A pillar that scores below the rank IC of its best input is
destroying information, and the fix is subtraction, not addition.

Related: [[signal-score-has-no-measured-edge]],
[[authored-inputs-masquerading-as-signal]], [[regime-dominates-dip-returns]]

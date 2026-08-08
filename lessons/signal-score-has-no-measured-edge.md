# The Signal Score has no measured edge, and the core hypothesis failed

Summary: the first honest walk-forward run (2026-08-08, 24 covered names, 1255
sessions each, 10,551 dip observations) says the Signal Score does not rank
forward returns. IC is 0.003 / 0.017 / 0.020 at 5 / 20 / 60 sessions, and the
top-minus-bottom quintile spread is *negative* at every horizon (-0.09%, -0.23%,
-1.75%). Mean 20d forward return by score bucket is flat across every bucket
with a usable sample: 30-39 +1.47%, 40-49 +1.66%, 50-59 +1.92%, 60-69 +1.71%.

The score is not degenerate. Mean 51.8, sd 7.0, range 19-79. It varies. The
variation carries no information.

## What this falsifies

The decomposition's central claim was that an idiosyncratic fall carrying an
information signature (residualZ <= -2.5, or gap-dominated with residualZ <=
-1.5) marks post-earnings-announcement drift and should be avoided, while a
company-specific fall with no such signature is the reversion trade. The engine
encodes that as catalyst base scores of 22 versus 60, and 22 trips a hard gate
that forces FALLING_KNIFE or AVOID.

Realised mean forward returns:

| Cause | N | 5d | 20d | 60d |
| --- | --- | --- | --- | --- |
| IDIOSYNCRATIC_NO_NEWS | 5735 | +0.34 | +1.35 | +4.79 |
| MARKET_BETA | 3323 | +0.63 | +2.74 | +8.49 |
| SECTOR_ROTATION | 936 | +0.35 | +1.36 | +4.54 |
| IDIOSYNCRATIC_SHOCK | 557 | +0.56 | +1.92 | +4.34 |

IDIOSYNCRATIC_SHOCK *beat* IDIOSYNCRATIC_NO_NEWS at 5d and 20d. The 22-versus-60
scoring gap, which gates every buy verdict in the product, is not supported.
Treat it as not supported rather than disproven: 557 shock observations across 24
names over five years is a modest and heavily clustered effective sample.

This result is independent of the session-window fix made the same day. Cause
classification reads residualZ and gapShare over the 120-session pre-dip
estimation window, which sits inside the 300-bar slice either way. Only
`high52w` and `sma200`, which feed dipCharacter and technical, were affected.

## What survived

MARKET_BETA outperformed every other class at every horizon, and it is the
highest-scoring class (base 82). That is the one mapping the data supports. It
is also the one most likely to be an artefact: 24 mega-cap survivors over a
five-year bull sample will reward buying market-wide dips regardless of skill.
It is a hypothesis to test on a survivorship-free universe, not a finding.

## The concentration risk, now measured

Buy-grade signals (signalScore >= 62) are 710 of 10,551 observations, 6.7%. Of
those, **83.9% are MARKET_BETA**. The engine's buy recommendation is, five times
in six, "the market fell and this name has beta."

They arrive in clusters. Up to 12 of 24 names fire on the same day, and 29% of
all buy signals land on days where five or more names fire at once. At the
plan's 5% base position size, one such day deploys 60% of the book into a single
market-wide drawdown. There is no correlation cap anywhere in the engine.

And they do not pay at the horizon the product trades. At 20 sessions, roughly
the middle of the plan's stated 2-8 week horizon, buy-grade signals returned
+1.75% against +1.82% for everything else. They only look better at 60 sessions
(+7.30% vs +5.82%), and that gap is almost entirely the MARKET_BETA class effect.

## How to apply

Do not ship scores as trade recommendations before a walk-forward run exists.
The engine was architecturally sound, internally consistent, well documented and
fully tested, and none of that is evidence of predictive content. Build the
measurement before the conviction.

Two structural reasons this universe cannot settle the question, both known in
advance and both now confirmed as binding: mega-caps are the most efficiently
priced names in the market, so a mean-reversion edge is least likely to survive
there; and a present-day ticker list excludes every name that dipped and never
recovered, which is precisely the failure mode dip-buying needs to be measured
against. Widen to a survivorship-free universe before recalibrating anything.

## Superseded in part, same day

Two follow-ups changed these conclusions and should be read with this file:

- The null result was an aggregation fault, not an absence of signal. Two
  trend-following terms inside the mean-reversion pillars were reversing their
  own inputs. Removing them took IC from 0.020 to 0.070 at 60 sessions and
  flipped the quintile spread positive at every horizon. See
  [[trend-terms-inverted-the-reversion-pillars]].
- "The shock/no-news split is not supported" holds only unconditionally. Split by
  market regime, shock underperforms exactly as predicted inside a bull regime
  (+1.29% vs +3.67% at 60 sessions) and inverts in a bear one. See
  [[regime-dominates-dip-returns]].

What still stands from this file: the score is not tradeable, the universe cannot
settle the question, and nothing here should size a position.

Related: [[trend-terms-inverted-the-reversion-pillars]],
[[regime-dominates-dip-returns]], [[authored-inputs-masquerading-as-signal]],
[[dip-engine-assumes-negative-move]], [[fmp-free-tier-constraints]]

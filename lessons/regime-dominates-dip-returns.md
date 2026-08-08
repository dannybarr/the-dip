# Market regime dominates dip returns, and it flips the catalyst hypothesis

Summary: splitting every dip observation by whether the cap-weighted market
factor sat above or below its own 200-day average produces a larger effect than
anything inside the six pillars. It also resolves why the shock/no-news
hypothesis looked dead unconditionally when it is alive within a regime.

## The split

| Regime | N | 20d | 60d |
| --- | --- | --- | --- |
| Market above 200-day | 8461 | +1.22% | +3.89% |
| Market below 200-day | 2123 | +4.12% | +13.88% |

A 3.6x difference at 60 sessions, from one binary variable the engine does not
read. No pillar comes close to that.

**Do not trade this sign.** Over 2022-2026 the periods below the 200-day were the
2022 drawdown and later corrections, and all 24 covered names rebounded hard from
them. This is the single most survivorship-contaminated number in the whole
analysis: it is close to a measurement of "these particular mega-caps recovered".
What survives the bias is the magnitude of the conditioning effect, not its
direction. Regime belongs in the model; this estimate of it does not.

## It rescues the catalyst hypothesis

Unconditionally, IDIOSYNCRATIC_SHOCK did not underperform, which read as a
falsification of the decomposition's central claim (see
[[signal-score-has-no-measured-edge]]). Conditioned on regime, mean 60-day
forward return:

| Cause | Bull n | Bull % | Bear n | Bear % |
| --- | --- | --- | --- | --- |
| MARKET_BETA | 2493 | +4.87 | 846 | +18.96 |
| IDIOSYNCRATIC_NO_NEWS | 4743 | +3.67 | 999 | +10.05 |
| SECTOR_ROTATION | 806 | +3.48 | 135 | +10.94 |
| IDIOSYNCRATIC_SHOCK | 419 | **+1.29** | 143 | +12.80 |

In a bull regime the ordering is MARKET_BETA > NO_NEWS > SECTOR > SHOCK, and the
engine's base scores are 82 > 60 > 66 > 22. Only SECTOR and NO_NEWS are swapped,
and they sit within noise of each other. **The classifier's rank ordering is
essentially correct inside a bull regime**, and shock underperforms exactly as the
post-earnings-drift argument predicts.

In a bear regime it inverts: shock names rebound hardest. The unconditional test
mixed the two and the bear observations, with their far larger returns, swamped
the bull signal.

## How to apply

A conditioning variable that is missing from a model does not show up as a weak
term, it shows up as a *contradictory* one. Before concluding a hypothesis is
falsified by a pooled test, split the sample on the regime variable the model
omits. The finding here reversed a conclusion that had already been written up.

Related: [[signal-score-has-no-measured-edge]],
[[trend-terms-inverted-the-reversion-pillars]]

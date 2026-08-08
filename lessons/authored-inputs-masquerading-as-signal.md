# Hand-authored constants must not masquerade as a live signal

Summary: ~45% of the old Dip Score was static hand-authored opinion that never
moved when the market moved. The worst offender was the catalyst pillar (22% of
the score, and the gate on every buy verdict): it read two per-ticker constants,
`severity` and `transience`, hard-coded in `coverage.ts`. AAPL's catalyst score
was therefore permanently 70, clearing the buy gate every day forever, whatever
the actual dip was. Five names (TSLA, PFE, PYPL, COIN, BA) scored a permanent
45.5, locked out of any buy verdict for all time. The `AVOID` hard override
(`catalystScore < 25`) was unreachable, because the authored minimum was 45.5.

The tell: a "score" that is identical across every rerun for a given ticker is
not a signal, it is a fixed bias term wearing the costume of analysis. It also
makes the thing un-backtestable — a single static snapshot has no point-in-time
history, and it was authored with knowledge of how these names behaved, which is
look-ahead bias.

Fix applied (2026-07-17):
- New `decompose.ts` splits each dip into market beta, sector rotation and an
  idiosyncratic residual, from price alone (free, point-in-time). It classifies
  MARKET_BETA / SECTOR_ROTATION / IDIOSYNCRATIC_NO_NEWS / IDIOSYNCRATIC_SHOCK,
  using residual sigma and an overnight-gap-vs-intraday-drift discriminator (the
  `open` FMP already returned but the code was discarding).
- `scoreCatalyst` now reads the measured decomposition, not the constants. The
  authored catalyst copy still renders as *context*, explicitly labelled "no
  longer feeds the score".
- Pillars are tagged `signal | mixed | overlay`. The Signal Score (catalyst,
  dipCharacter, technical) drives the verdict; the Overlay can only veto down.
- Walk-forward backtest harness (`src/backtest/`) measures whether the Signal
  Score predicts forward returns. Its metrics are unit-tested against known
  relationships (IC ≈ +1/-1/0) and proven free of look-ahead.

Why it mattered: widening coverage to more tickers would have done nothing for
quality while this held. An unvalidated score applied to 4,000 names is just
being wrong at scale. The order was: fix the signal, prove it, then widen.

How to apply: when any "score" blends live data with hand-authored judgment,
tag each input by provenance and keep the authored part out of the number that
drives decisions (context only, veto-down at most). If a component of a score is
constant across reruns for the same entity, it is an assumption, not a signal —
surface it as one. Never backtest a signal that contains a look-ahead snapshot.

Related: [[dip-engine-assumes-negative-move]], [[fmp-free-tier-constraints]]

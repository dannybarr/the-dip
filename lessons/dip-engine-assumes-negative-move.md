# The dip engine only makes sense for a genuine (negative) weekly move

Summary: The whole analyst engine is built around `dipPctWeek` being negative.
`buildSeries`, `buildPlan` (preDip = price / (1 + dipPctWeek/100)), the targets,
risk:reward, expected value, and `buildThesis` all assume the name fell. With
simulated fixtures every name was a dip, so this was invisible. Live data exposed
it: on an up week (e.g. META +14.8%) the plan produced Target 1 *below* the
current price, negative R:R, and a thesis reading "off 14.8% on the week" when the
stock was up.

Fix applied: added `isDip = dipPctWeek < 0` to the Analysis type.
- Scanner shows only names with `isDip` (Danny's call: "show only real dips"),
  with a proper empty state for green days.
- `buildThesis` is sign-aware: non-dips get a "not in a dip, no entry published"
  message instead of a forced dip narrative.
- StockAnalysis suppresses the trade plan for non-dips (like it already did for
  Falling Knife / Avoid), and PriceChart hides stop/target overlays when not a
  tradeable dip (support line stays — it's a real technical level).

Why it mattered: a fixed live universe always contains rallying names. Any tool
that recomputes a "dip" verdict on live prices must gate the dip math on an
actual dip, or it publishes nonsense levels the moment a covered name rises.

How to apply: when moving any engine from curated/simulated inputs to live
inputs, audit every calculation that implicitly assumed the sign or range of the
old fixtures.

Related: [[fmp-free-tier-constraints]]

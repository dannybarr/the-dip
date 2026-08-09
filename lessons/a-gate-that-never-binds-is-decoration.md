# A gate that never binds is decoration, and it hides its own uselessness

Summary: AngelScope led with a two-gate design, "a deal must be both a good
company and a good price", presented as the thing that separates it from tools
that only ask whether a company is good. Measured, the price gate never rejected
anything the company gate had already passed. The headline feature did nothing.

## How it failed

The economic gate required `edge >= 1.25`, where edge came from an outcome
distribution tilted by the evidence score. Running the real config:

| tilt | score 20 | score 50 | score 66 | score 95 |
| --- | --- | --- | --- | --- |
| 0.35 (shipped) | 0.995 | 1.302 | ~1.52 | 2.063 |
| 0 (honest) | 1.302 | 1.302 | 1.302 | 1.302 |

The gate cleared at score 50. The score bands were watch 52, buy 66, strong buy
78. So the score gate always bound first and the price gate was unreachable.

Worse, at `tilt_strength = 0`, which the project's own README correctly called
the honest position until calibration, every deal returns an identical edge and
*everything* passes. The gate's entire discriminating power came from a parameter
the author had explicitly flagged as uncalibrated.

## The general shape

Two conditions in series only add value when they disagree somewhere in the
reachable input range. Nobody had checked. The tell is cheap: sweep one input
across its range, print both gate outcomes, and look for a row where they differ.
If no such row exists, the second gate is decoration and should be deleted or
turned into a readout.

The second-order damage is worse than the wasted code. A gate that always passes
reads as validation. Every deal that came through carried the implicit claim
"this was checked against the index and cleared", and that claim was empty.

## What replaced it

The port drops the pass/fail entirely and shows the hurdle as a readout: this
wrapper, these fees, this horizon, here is the multiple the company must return.
Same arithmetic, no false assurance. The tail-probability assumption underneath
it got a sensitivity control instead of a headline number, because the whole
conclusion moves between p(30x) of 1.0% and 0.7%.

## How to apply

Before shipping any multi-condition gate, sweep the inputs and prove the
conditions disagree somewhere. A condition that cannot change an outcome is not
conservative, it is misleading, because it looks like a check that was performed.

Related: [[authored-inputs-masquerading-as-signal]],
[[signal-score-has-no-measured-edge]], [[verify-parsers-against-the-real-source]]

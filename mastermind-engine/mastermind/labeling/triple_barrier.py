"""Triple-barrier labeling (López de Prado) — RESEARCH.md §4.

For each row (a candidate long entry at next open), look FORWARD over the swing
horizon and record which barrier is hit first:
    +1  profit-take (entry + pt_atr * ATR) hit first  -> a real, risk-defined win
    -1  stop-loss  (entry - sl_atr * ATR) hit first    -> a real loss
     0  vertical/time barrier reached first            -> timeout (small/flat)

Also returns, for each entry, the realised holding period and forward return, plus
the index of the label's resolution bar — used by the backtester to PURGE
overlapping samples (§6) so future information can't leak into training.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class TripleBarrierResult:
    label: pd.Series          # +1 / -1 / 0
    ret: pd.Series            # realised return over the trade
    hold_days: pd.Series      # bars held until a barrier hit
    touch_idx: pd.Series      # integer position of resolution bar (for purging)


def triple_barrier_labels(
    df: pd.DataFrame,
    atr: pd.Series,
    pt_atr: float,
    sl_atr: float,
    vertical_days: int,
    min_hold_days: int = 1,
    max_barrier_pct: float | None = None,
) -> TripleBarrierResult:
    close = df["close"].values
    high = df["high"].values
    low = df["low"].values
    a = atr.reindex(df.index).values
    n = len(df)

    labels = np.full(n, np.nan)
    rets = np.full(n, np.nan)
    holds = np.full(n, np.nan)
    touch = np.full(n, np.nan)

    for i in range(n):
        if not np.isfinite(a[i]) or a[i] <= 0 or i + 1 >= n:
            continue
        entry = close[i]                      # decision at close of bar i
        pt_dist = pt_atr * a[i]
        sl_dist = sl_atr * a[i]
        if max_barrier_pct is not None:       # cap barrier width (risk geometry)
            pt_dist = min(pt_dist, max_barrier_pct * entry)
            sl_dist = min(sl_dist, max_barrier_pct * entry)
        pt = entry + pt_dist
        sl = entry - sl_dist
        end = min(i + vertical_days, n - 1)
        resolved = False
        for j in range(i + 1, end + 1):
            hit_pt = high[j] >= pt
            hit_sl = low[j] <= sl
            if j - i < min_hold_days:
                # honour a minimum hold before profit-taking, but a stop still binds
                hit_pt = False
            if hit_sl and hit_pt:
                # Both touched same bar: assume stop hit first (conservative).
                labels[i], rets[i] = -1.0, (sl - entry) / entry
                holds[i], touch[i] = j - i, j
                resolved = True
                break
            if hit_sl:
                labels[i], rets[i] = -1.0, (sl - entry) / entry
                holds[i], touch[i] = j - i, j
                resolved = True
                break
            if hit_pt:
                labels[i], rets[i] = 1.0, (pt - entry) / entry
                holds[i], touch[i] = j - i, j
                resolved = True
                break
        if not resolved:
            labels[i] = 0.0
            rets[i] = (close[end] - entry) / entry
            holds[i] = end - i
            touch[i] = end

    idx = df.index
    return TripleBarrierResult(
        label=pd.Series(labels, index=idx, name="label"),
        ret=pd.Series(rets, index=idx, name="tb_ret"),
        hold_days=pd.Series(holds, index=idx, name="hold_days"),
        touch_idx=pd.Series(touch, index=idx, name="touch_idx"),
    )

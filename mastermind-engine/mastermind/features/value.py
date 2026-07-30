"""Pillar 2 — undervaluation / discount + quality (RESEARCH.md §3).

"Discount" is measured relative to a name's OWN history (valuation percentile), so a
low P/E growth compounder and a cheap cyclical are scored on their own terms. A
quality score gates against value traps. When fundamentals are unavailable the
features degrade to price-derived proxies so the pipeline never breaks.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def _pit_reindex(fund: pd.DataFrame, index: pd.DatetimeIndex) -> pd.DataFrame:
    """Forward-fill quarterly fundamentals onto the daily index, POINT-IN-TIME.

    A quarter's figures only become known on/after its report date, so we reindex
    with forward-fill (never backfill) — row t sees only the last *released* quarter.
    """
    return fund.sort_index().reindex(index, method="ffill")


def compute(df: pd.DataFrame, fundamentals, cfg) -> pd.DataFrame:
    out = pd.DataFrame(index=df.index)
    lookback = cfg.get("features.value_lookback", 252)
    close = df["close"]

    if fundamentals is not None and len(fundamentals) > 0:
        f = _pit_reindex(fundamentals, df.index)
        # Relative value: where does today's valuation sit in its own 1y range?
        # Low percentile = cheap vs own history = "discounted".
        if "pe" in f:
            out["pe_pctile"] = f["pe"].rolling(lookback, min_periods=60).apply(
                _pctile_of_last, raw=True)
            out["value_discount"] = 1.0 - out["pe_pctile"]      # high = cheap
        if "fcf_yield" in f:
            out["fcf_yield"] = f["fcf_yield"]
        # Quality composite (0..1): profitable, high-margin, low-leverage, cash-gen.
        q = []
        if "roe" in f:
            q.append(_squash(f["roe"], 0.15, 0.10))
        if "gross_margin" in f:
            q.append(_squash(f["gross_margin"], 0.40, 0.20))
        if "fcf_yield" in f:
            q.append(_squash(f["fcf_yield"], 0.03, 0.03))
        if "debt_to_equity" in f:
            q.append(1.0 - _squash(f["debt_to_equity"], 1.0, 0.8))
        out["quality"] = pd.concat(q, axis=1).mean(axis=1) if q else 0.5
    else:
        out["quality"] = np.nan  # unknown; principle gate treats NaN conservatively

    # Price-derived value proxy (always available): how far below the 1y anchor,
    # normalised — a cheap-vs-own-trend measure that works with no fundamentals.
    anchor = close.rolling(lookback, min_periods=60).median()
    out["price_discount"] = (anchor - close) / anchor           # >0 = below anchor
    out["drawdown_1y"] = close / close.rolling(lookback, min_periods=60).max() - 1.0

    if "value_discount" not in out:
        # Fall back to price-based discount, scaled to 0..1.
        out["value_discount"] = out["price_discount"].clip(-0.5, 0.5) + 0.5
    return out


def _pctile_of_last(arr: np.ndarray) -> float:
    """Percentile rank of the final element within the window (0..1)."""
    last = arr[-1]
    return float((arr <= last).mean())


def _squash(s: pd.Series, center: float, scale: float) -> pd.Series:
    """Logistic squash to 0..1 around `center` with width `scale`."""
    return 1.0 / (1.0 + np.exp(-(s - center) / (scale + 1e-9)))

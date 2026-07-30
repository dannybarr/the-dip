"""Pillar 3 — educated strategic bets (RESEARCH.md §3, the Ferrari pattern).

Fires when a SALIENT NEGATIVE shock drives price down out of proportion to the
mechanistic damage, AND the name has the durable quality/moat that makes the
headline transient. Encoded as:

  * shock detection   — abnormal gap-down on volume (price-derived, always on).
  * overreaction score — size of the move vs the name's own typical event response.
  * narrative_gap     — combines shock magnitude with moat/quality resilience:
                        a big drop in a high-quality name = high narrative gap =
                        the crowd priced the headline, not the mechanism.

If a real catalyst/news feed is supplied (sentiment, earnings surprise) it augments
the price-derived signal; otherwise the price-derived version stands alone.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def compute(df: pd.DataFrame, catalysts, quality: pd.Series | None, cfg) -> pd.DataFrame:
    out = pd.DataFrame(index=df.index)
    close = df["close"]
    rets = close.pct_change()

    # --- Shock detection (price-derived, point-in-time) --------------------
    vol_ma = df["volume"].rolling(20).mean()
    volume_surge = df["volume"] / vol_ma
    daily_gap = close.pct_change()
    ret_std = rets.rolling(60).std()
    # A "shock" day: sharp negative return (in sigma) on above-average volume.
    ret_sigma = daily_gap / ret_std
    is_shock = (ret_sigma < -2.0) & (volume_surge > 1.5)
    out["shock_magnitude"] = np.where(is_shock, -ret_sigma, 0.0)   # positive number
    # Recent shock memory (decays over the swing horizon).
    out["recent_shock"] = (
        pd.Series(np.where(is_shock, -ret_sigma, 0.0), index=df.index)
        .rolling(10).max().fillna(0.0)
    )

    # --- Overreaction score ------------------------------------------------
    # How stretched is price below its short-term mean right after the shock?
    z = (close - close.rolling(10).mean()) / close.rolling(10).std()
    out["oversold_after_shock"] = np.where(out["recent_shock"] > 0, -z.clip(upper=0), 0.0)

    # --- Narrative gap: shock magnitude weighted by resilience -------------
    if quality is not None:
        resilience = quality.reindex(out.index).fillna(0.5)
    else:
        # No fundamentals: proxy resilience by low realised-vol + positive 6m trend.
        trend = (close.pct_change(126) > 0).astype(float)
        stability = 1.0 - (rets.rolling(60).std() * np.sqrt(252)).clip(0, 1)
        resilience = (0.5 * trend + 0.5 * stability).fillna(0.5)
    out["resilience"] = resilience
    # High when a strong (resilient) name takes a big shock => classic strategic bet.
    out["narrative_gap"] = out["recent_shock"] * resilience

    # --- Optional real catalyst feed augmentation --------------------------
    if catalysts is not None and len(catalysts) > 0:
        cat = catalysts.copy()
        # Negative sentiment shock memory over the horizon.
        if "sentiment" in cat.columns:
            sent = cat["sentiment"].reindex(out.index).fillna(0.0)
            out["news_sentiment"] = sent.rolling(10, min_periods=1).mean()
        if "surprise" in cat.columns:  # earnings surprise -> PEAD driver
            out["earnings_surprise"] = cat["surprise"].reindex(out.index).ffill().fillna(0.0)
        # 'gap'/'overreaction' from the synthetic feed sharpen the narrative gap.
        if "gap" in cat.columns:
            g = (-cat["gap"]).reindex(out.index).fillna(0.0).rolling(10).max()
            out["narrative_gap"] = out["narrative_gap"] + g * resilience

    return out.fillna(0.0)

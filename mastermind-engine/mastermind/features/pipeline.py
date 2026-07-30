"""Assemble the three pillars into one point-in-time feature matrix.

The pipeline is the single place features are built for both training and live
scoring, guaranteeing train/serve consistency (no skew).
"""
from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd

from . import technical, value, catalyst

# Groups let the self-review layer attribute performance / toggle a pillar.
FEATURE_GROUPS = {
    "technical": [
        "ret_5", "ret_10", "ret_20", "ret_50", "ma_ratio", "ma_slope_20",
        "above_ma50", "adx", "rsi", "bb_z", "dist_from_high_20",
        "dist_from_low_20", "consec_down", "atr_pct", "realized_vol",
        "vol_regime", "volume_surge", "gap",
    ],
    "value": [
        "value_discount", "price_discount", "drawdown_1y", "quality",
        "fcf_yield", "pe_pctile",
    ],
    "catalyst": [
        "shock_magnitude", "recent_shock", "oversold_after_shock",
        "resilience", "narrative_gap", "news_sentiment", "earnings_surprise",
    ],
}


class FeaturePipeline:
    def __init__(self, cfg):
        self.cfg = cfg

    def build(
        self,
        df: pd.DataFrame,
        fundamentals: Optional[pd.DataFrame] = None,
        catalysts: Optional[pd.DataFrame] = None,
    ) -> pd.DataFrame:
        tech = technical.compute(df, self.cfg)
        val = value.compute(df, fundamentals, self.cfg)
        quality = val["quality"] if "quality" in val else None
        cat = catalyst.compute(df, catalysts, quality, self.cfg)

        feats = pd.concat([tech, val, cat], axis=1)
        feats = feats.loc[:, ~feats.columns.duplicated()]
        # ATR in price terms drives barrier width for labeling/risk. Use a SMOOTHED
        # ATR (rolling median) so a single shock-day volatility spike doesn't blow the
        # barriers out to ~10% — that both wrecks risk geometry and noise-whipsaws the
        # multi-day recovery trade. The raw atr_pct stays a model feature.
        atr_price = tech["atr_pct"] * df["close"]
        feats["atr"] = atr_price.rolling(10, min_periods=3).median()
        feats = feats.replace([np.inf, -np.inf], np.nan)
        return feats

    @staticmethod
    def feature_columns(feats: pd.DataFrame) -> list[str]:
        """Model input columns = all engineered features except passthroughs."""
        exclude = {"atr"}
        return [c for c in feats.columns if c not in exclude]

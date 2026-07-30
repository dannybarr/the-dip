"""Pillar 1 — swing / technical structure (RESEARCH.md §3).

Computes BOTH momentum and mean-reversion features; the model + regime detector
decide which to trust. Every column at row t uses only data up to and including t
(no lookahead) — enforced by using only backward-looking rolling ops and .shift where
a *prior* value is needed.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def _rsi(close: pd.Series, period: int) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, min_periods=period).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, min_periods=period).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - 100 / (1 + rs)


def _atr(df: pd.DataFrame, period: int) -> pd.Series:
    prev_close = df["close"].shift(1)
    tr = pd.concat(
        [
            df["high"] - df["low"],
            (df["high"] - prev_close).abs(),
            (df["low"] - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return tr.ewm(alpha=1 / period, min_periods=period).mean()


def compute(df: pd.DataFrame, cfg) -> pd.DataFrame:
    close = df["close"]
    out = pd.DataFrame(index=df.index)

    # --- Momentum / trend --------------------------------------------------
    for w in cfg.get("features.momentum_windows", [5, 10, 20, 50]):
        out[f"ret_{w}"] = close.pct_change(w)
    ma_fast = close.rolling(20).mean()
    ma_slow = close.rolling(50).mean()
    out["ma_ratio"] = ma_fast / ma_slow - 1.0          # trend alignment
    out["ma_slope_20"] = ma_fast.pct_change(5)          # slope of the fast MA
    out["above_ma50"] = (close > ma_slow).astype(float)

    # ADX-style trend strength (directional movement, backward-looking).
    up = df["high"].diff()
    down = -df["low"].diff()
    plus_dm = np.where((up > down) & (up > 0), up, 0.0)
    minus_dm = np.where((down > up) & (down > 0), down, 0.0)
    atr = _atr(df, cfg.get("features.atr_period", 14))
    plus_di = 100 * pd.Series(plus_dm, index=df.index).ewm(alpha=1 / 14).mean() / atr
    minus_di = 100 * pd.Series(minus_dm, index=df.index).ewm(alpha=1 / 14).mean() / atr
    dx = ((plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)) * 100
    out["adx"] = dx.ewm(alpha=1 / 14).mean()

    # --- Mean-reversion ----------------------------------------------------
    out["rsi"] = _rsi(close, cfg.get("features.rsi_period", 14))
    bb_p = cfg.get("features.bb_period", 20)
    mean = close.rolling(bb_p).mean()
    std = close.rolling(bb_p).std()
    out["bb_z"] = (close - mean) / std                  # z-score vs 20d mean
    out["dist_from_high_20"] = close / df["high"].rolling(20).max() - 1.0
    out["dist_from_low_20"] = close / df["low"].rolling(20).min() - 1.0
    downs = (close.diff() < 0).astype(int)
    out["consec_down"] = downs * (downs.groupby((downs != downs.shift()).cumsum()).cumcount() + 1)

    # --- Volatility & liquidity context ------------------------------------
    rets = close.pct_change()
    vw = cfg.get("features.vol_window", 20)
    out["atr_pct"] = atr / close
    out["realized_vol"] = rets.rolling(vw).std() * np.sqrt(252)
    out["vol_regime"] = out["realized_vol"] / out["realized_vol"].rolling(126).mean()
    vol_ma = df["volume"].rolling(vw).mean()
    out["volume_surge"] = df["volume"] / vol_ma
    out["gap"] = df["open"] / close.shift(1) - 1.0

    return out

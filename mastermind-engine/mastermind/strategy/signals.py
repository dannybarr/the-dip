"""Turn model output + principles into ranked, sized-ready signals (RESEARCH.md §5).

Conviction = calibrated edge, adjusted for expected asymmetry (payoff ratio) and
regime fit, then gated by the principles overlay. Conviction is the single number
that drives ranking and position sizing.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

from .principles import passes_principles


@dataclass
class Signal:
    ticker: str
    date: pd.Timestamp
    edge: float                 # calibrated P(win)
    conviction: float           # ranking/sizing score in ~[0,1]
    entry: float
    atr: float
    stop: float
    target: float
    reasons: List[str] = field(default_factory=list)   # supporting thesis
    rejected: bool = False
    reject_reasons: List[str] = field(default_factory=list)
    features: Dict[str, float] = field(default_factory=dict)


def _payoff_ratio(cfg) -> float:
    pt = cfg.get("labeling.profit_take_atr", 2.0)
    sl = cfg.get("labeling.stop_loss_atr", 1.0)
    return pt / max(sl, 1e-9)


def conviction_score(edge: float, row: pd.Series, cfg) -> float:
    """Blend edge, expected value (Kelly numerator), and regime/thesis strength."""
    b = _payoff_ratio(cfg)                       # win/loss payoff ratio
    # Kelly edge fraction f* = (b*p - (1-p)) / b  -> normalised expected value.
    p = float(np.clip(edge, 0, 1))
    kelly = (b * p - (1 - p)) / b
    kelly = max(kelly, 0.0)

    # Thesis strength: reward genuine value discount and/or strategic catalyst.
    thesis = 0.0
    thesis += 0.5 * float(np.clip(_g(row, "value_discount") - 0.5, 0, 0.5)) * 2
    thesis += 0.5 * float(np.clip(_g(row, "narrative_gap"), 0, 2)) / 2
    thesis = float(np.clip(thesis, 0, 1))

    # Regime fit: trend-followers want ADX up + above MA; reverters want oversold.
    regime_fit = 0.5 + 0.25 * _g(row, "above_ma50") + 0.25 * float(
        _g(row, "oversold_after_shock") > 0)

    conviction = kelly * (0.6 + 0.25 * thesis + 0.15 * (regime_fit - 0.5) * 2)
    return float(np.clip(conviction, 0, 1))


def generate_signals(
    ticker: str,
    feats: pd.DataFrame,
    edges: np.ndarray,
    prices: pd.DataFrame,
    cfg,
    as_of: Optional[pd.Timestamp] = None,
) -> List[Signal]:
    """Build signals for the rows in `feats`. If as_of is given, only that date."""
    pt = cfg.get("labeling.profit_take_atr", 2.0)
    sl = cfg.get("labeling.stop_loss_atr", 1.0)
    min_conv = cfg.get("strategy.min_conviction", 0.15)

    signals: List[Signal] = []
    rows = [as_of] if as_of is not None else list(feats.index)
    edge_map = pd.Series(edges, index=feats.index)

    for dt in rows:
        if dt not in feats.index:
            continue
        row = feats.loc[dt]
        edge = float(edge_map.loc[dt])
        atr = float(row.get("atr", np.nan))
        close = float(prices["close"].loc[dt]) if dt in prices.index else np.nan
        if not np.isfinite(atr) or atr <= 0 or not np.isfinite(close):
            continue

        conv = conviction_score(edge, row, cfg)
        report = passes_principles(row, edge, cfg)
        reasons = _thesis_reasons(row)

        sig = Signal(
            ticker=ticker, date=dt, edge=edge, conviction=conv,
            entry=close, atr=atr, stop=close - sl * atr, target=close + pt * atr,
            reasons=reasons,
            features={k: float(row.get(k)) for k in
                      ["quality", "value_discount", "narrative_gap", "rsi", "adx",
                       "recent_shock", "above_ma50"] if k in row},
        )
        if not report.passed or conv < min_conv:
            sig.rejected = True
            sig.reject_reasons = report.reasons + (
                [f"conviction {conv:.2f} < {min_conv:.2f}"] if conv < min_conv else [])
        signals.append(sig)

    return signals


def _thesis_reasons(row: pd.Series) -> List[str]:
    r: List[str] = []
    if _g(row, "value_discount") >= 0.6:
        r.append(f"Trading cheap vs own history (discount {_g(row,'value_discount'):.2f})")
    if _g(row, "narrative_gap") > 0.3:
        r.append(f"Strategic bet: resilient name over-punished on shock "
                 f"(narrative gap {_g(row,'narrative_gap'):.2f})")
    if _g(row, "quality") >= 0.6:
        r.append(f"High quality (score {_g(row,'quality'):.2f})")
    if _g(row, "rsi") < 35:
        r.append(f"Oversold (RSI {_g(row,'rsi'):.0f})")
    if _g(row, "above_ma50") == 1 and _g(row, "adx") > 25:
        r.append("Established uptrend (above 50d MA, ADX>25)")
    return r


def _g(row: pd.Series, key: str) -> float:
    try:
        v = float(row.get(key))
        return v if np.isfinite(v) else 0.0
    except (TypeError, ValueError):
        return 0.0

"""The "JP Morgan #1 employee" rule overlay (RESEARCH.md §7).

Non-negotiable gates applied AFTER the model speaks. The model finds statistical
edge; these rules enforce the timeless investment discipline that keeps you solvent
and stops you buying cheap garbage or chasing a signal with no thesis. A trade must
pass EVERY gate. Rules are data-driven from config so the review loop can tune them,
but the *spirit* is fixed: margin of safety, quality, a real catalyst-or-value
reason, and no fighting a violent downtrend without a mean-reversion setup.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

import numpy as np
import pandas as pd


@dataclass
class PrincipleReport:
    passed: bool
    reasons: List[str] = field(default_factory=list)   # why REJECTED (empty if passed)
    notes: Dict[str, float] = field(default_factory=dict)


def passes_principles(row: pd.Series, edge: float, cfg) -> PrincipleReport:
    """Evaluate one candidate (a feature row + model edge) against the gates."""
    reasons: List[str] = []
    notes: Dict[str, float] = {}

    # Gate 0 — statistical edge floor: don't act on a coin-flip.
    min_edge = cfg.get("strategy.min_edge", 0.55)
    notes["edge"] = float(edge)
    if edge < min_edge:
        reasons.append(f"edge {edge:.2f} < floor {min_edge:.2f}")

    # Gate 1 — Quality (avoid value traps). Unknown quality is treated cautiously:
    # allowed only if there's a strong catalyst/value reason.
    quality = _safe(row.get("quality"))
    catalyst = _safe(row.get("narrative_gap"))
    value_discount = _safe(row.get("value_discount"))
    if cfg.get("strategy.quality_gate", True):
        if not np.isnan(quality) and quality < 0.30 and catalyst < 0.5:
            reasons.append(f"low quality {quality:.2f} without catalyst (value-trap risk)")

    # Gate 2 — A real REASON: either a value discount (Pillar 2) OR a strategic
    # catalyst (Pillar 3). Pure technical momentum alone is not enough conviction.
    if cfg.get("strategy.require_catalyst_or_value", True):
        has_value = (not np.isnan(value_discount)) and value_discount >= 0.55
        has_catalyst = catalyst > 0.3 or _safe(row.get("recent_shock")) > 0
        notes["has_value"] = float(has_value)
        notes["has_catalyst"] = float(has_catalyst)
        if not (has_value or has_catalyst):
            reasons.append("no value discount and no catalyst (thesis-free)")

    # Gate 3 — Don't catch a falling knife: reject if in a violent, accelerating
    # downtrend UNLESS a genuine oversold mean-reversion setup is present.
    adx = _safe(row.get("adx"))
    above_ma50 = _safe(row.get("above_ma50"))
    rsi = _safe(row.get("rsi"))
    oversold = (not np.isnan(rsi) and rsi < 35) or _safe(row.get("oversold_after_shock")) > 0
    if (not np.isnan(adx) and adx > 35 and above_ma50 == 0 and not oversold):
        reasons.append("strong downtrend without oversold setup (falling knife)")

    # Gate 4 — Liquidity/vol sanity: skip pathologically illiquid or berserk vol.
    vol_regime = _safe(row.get("vol_regime"))
    if not np.isnan(vol_regime) and vol_regime > 3.0:
        reasons.append(f"volatility regime {vol_regime:.1f}x normal (too wild)")

    return PrincipleReport(passed=len(reasons) == 0, reasons=reasons, notes=notes)


def _safe(v) -> float:
    try:
        f = float(v)
        return f
    except (TypeError, ValueError):
        return float("nan")

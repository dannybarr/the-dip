"""Position sizing & portfolio survival constraints (RESEARCH.md §7).

The engine's job is to compound without ever risking ruin. Sizing is the smaller of:
  * fixed-fractional risk: size so that hitting the stop loses `risk_per_trade` of
    equity (the dominant constraint), and
  * fractional-Kelly: cap by half-Kelly on the calibrated edge/payoff.
Then portfolio caps (max positions, per-name weight, gross exposure, sector limits)
and a volatility-regime throttle apply.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

import numpy as np


@dataclass
class Position:
    ticker: str
    shares: float
    entry: float
    stop: float
    target: float
    risk_dollars: float
    conviction: float


class RiskManager:
    def __init__(self, cfg):
        self.cfg = cfg

    def _payoff_ratio(self) -> float:
        pt = self.cfg.get("labeling.profit_take_atr", 2.0)
        sl = self.cfg.get("labeling.stop_loss_atr", 1.0)
        return pt / max(sl, 1e-9)

    def kelly_fraction(self, edge: float) -> float:
        b = self._payoff_ratio()
        p = float(np.clip(edge, 0, 1))
        f = (b * p - (1 - p)) / b
        cap = self.cfg.get("risk.kelly_fraction", 0.5)
        return float(np.clip(f, 0.0, 1.0) * cap)

    def size_position(
        self,
        equity: float,
        entry: float,
        stop: float,
        edge: float,
        conviction: float,
        vol_regime: float = 1.0,
    ) -> Optional[Position]:
        risk_per_unit = entry - stop
        if risk_per_unit <= 0 or entry <= 0 or equity <= 0:
            return None

        # 1) Fixed-fractional risk budget (dollars we're willing to lose to the stop).
        risk_budget = equity * self.cfg.get("risk.risk_per_trade", 0.01)
        # Throttle risk in high-vol regimes (§7 regime-aware throttle).
        if np.isfinite(vol_regime) and vol_regime > 1.0:
            risk_budget /= min(vol_regime, 3.0)
        shares_risk = risk_budget / risk_per_unit

        # 2) Fractional-Kelly cap on notional.
        kelly = self.kelly_fraction(edge)
        max_notional = equity * min(kelly, self.cfg.get("risk.max_weight_per_name", 0.2))
        shares_kelly = max_notional / entry if entry > 0 else 0.0

        shares = max(min(shares_risk, shares_kelly), 0.0)
        if shares <= 0:
            return None

        # 3) Per-name weight cap.
        max_shares_weight = (equity * self.cfg.get("risk.max_weight_per_name", 0.2)) / entry
        shares = min(shares, max_shares_weight)

        return Position(
            ticker="", shares=shares, entry=entry, stop=stop, target=entry,  # target filled by caller
            risk_dollars=shares * risk_per_unit, conviction=conviction,
        )

    def select_portfolio(
        self,
        candidates: List[dict],
        equity: float,
        open_sectors: Optional[Dict[str, int]] = None,
        n_open: int = 0,
    ) -> List[dict]:
        """Pick which candidate signals to actually take, honoring portfolio caps.

        `candidates`: list of dicts with keys ticker, conviction, edge, entry, stop,
        target, vol_regime, sector. Returns the accepted subset with `shares` set.
        """
        max_positions = self.cfg.get("risk.max_positions", 8)
        max_sector = self.cfg.get("risk.max_sector_positions", 3)
        max_gross = self.cfg.get("risk.max_gross_exposure", 1.0)
        sectors = dict(open_sectors or {})

        accepted: List[dict] = []
        gross = 0.0
        slots = max(max_positions - n_open, 0)

        for c in sorted(candidates, key=lambda x: x["conviction"], reverse=True):
            if len(accepted) >= slots:
                break
            sector = c.get("sector", "NA")
            if sectors.get(sector, 0) >= max_sector:
                continue
            pos = self.size_position(
                equity, c["entry"], c["stop"], c["edge"], c["conviction"],
                c.get("vol_regime", 1.0),
            )
            if pos is None or pos.shares <= 0:
                continue
            notional = pos.shares * c["entry"]
            if (gross + notional) / equity > max_gross:
                # scale down to fit remaining gross budget
                room = max_gross * equity - gross
                if room <= 0:
                    continue
                pos.shares = room / c["entry"]
                notional = room
            c = {**c, "shares": pos.shares, "risk_dollars": pos.risk_dollars}
            accepted.append(c)
            sectors[sector] = sectors.get(sector, 0) + 1
            gross += notional

        return accepted

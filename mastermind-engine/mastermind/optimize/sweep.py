"""Capital-utilisation sweep — find the deployment level that maximises return
within a drawdown budget (RESEARCH.md §7/§8).

Concentration lifts per-trade edge but can leave capital idle (low CAGR). This sweep
grids the three levers that govern how hard the book works:

    niche_size      how many names are eligible (breadth of deployment)
    cooldown_days   how soon we can re-engage a name (re-engagement frequency)
    risk_per_trade  how much equity each idea risks (position aggressiveness)

and, via the self-review's own objective, picks the point that MAXIMISES return
subject to a drawdown tolerance — an unbiased, constrained optimisation rather than
cherry-picking the prettiest equity curve.

Efficiency: every grid point shares one `fold_cache`, so the expensive per-fold model
training/scoring is paid ONCE (those don't depend on the swept knobs); each point then
only replays the cheap portfolio simulation.
"""
from __future__ import annotations

import itertools
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np

from ..backtest import WalkForwardBacktester
from ..config import Config

# Axis-based grid: each axis is a named list of override-dicts, so a single axis can
# move SEVERAL coupled params. This matters for sizing: with sane per-name weight caps,
# risk_per_trade alone saturates the cap and becomes inert, so the "sizing" axis lifts
# risk_per_trade AND max_weight_per_name together (low/med/high aggressiveness).
DEFAULT_AXES = {
    "niche_size": [
        {"universe.niche_size": 4},
        {"universe.niche_size": 6},
        {"universe.niche_size": 9},
    ],
    "cooldown_days": [
        {"strategy.cooldown_days": 5},
        {"strategy.cooldown_days": 10},
        {"strategy.cooldown_days": 20},
    ],
    "sizing": [   # risk_per_trade coupled with the per-name weight cap so it BITES
        {"risk.risk_per_trade": 0.010, "risk.max_weight_per_name": 0.20},
        {"risk.risk_per_trade": 0.020, "risk.max_weight_per_name": 0.30},
        {"risk.risk_per_trade": 0.035, "risk.max_weight_per_name": 0.45},
    ],
}


@dataclass
class SweepResult:
    rows: List[dict]                       # every grid point + its metrics, ranked
    best: Optional[dict]                   # chosen point (max return within DD budget)
    tolerance: float                       # drawdown budget used (e.g. 0.20 = -20%)
    objective: str
    feasible_count: int
    base_row: Optional[dict] = None        # the un-swept baseline for comparison
    deltas: Dict[str, object] = field(default_factory=dict)  # config overrides for `best`

    def to_markdown(self, top: int = 12) -> str:
        cols = ["niche_size", "cooldown_days", "risk/wt",
                "cagr", "sharpe", "max_drawdown", "trades", "expectancy", "feasible"]
        head = "| " + " | ".join(cols) + " |"
        sep = "|" + "|".join(["---"] * len(cols)) + "|"
        lines = [f"# Capital-utilisation sweep — maximise {self.objective} "
                 f"s.t. max drawdown ≥ -{self.tolerance:.0%}", "",
                 f"{self.feasible_count}/{len(self.rows)} grid points within the "
                 f"drawdown budget.", "", head, sep]
        for r in self.rows[:top]:
            lines.append("| " + " | ".join([
                str(r["universe.niche_size"]), str(r["strategy.cooldown_days"]),
                f"{r['risk.risk_per_trade']:.3f}/{r['risk.max_weight_per_name']:.2f}",
                f"{r['cagr']:.1%}",
                f"{r['sharpe']:.2f}", f"{r['max_drawdown']:.1%}", str(r["trades"]),
                f"{r['expectancy']:.2%}", "yes" if r["feasible"] else "no",
            ]) + " |")
        if self.best:
            b = self.best
            lines += ["", "## Selected (max return within budget)",
                      f"- **niche_size={b['universe.niche_size']}, "
                      f"cooldown_days={b['strategy.cooldown_days']}, "
                      f"risk_per_trade={b['risk.risk_per_trade']:.3f}**",
                      f"- CAGR **{b['cagr']:.1%}**, Sharpe {b['sharpe']:.2f}, "
                      f"maxDD {b['max_drawdown']:.1%}, {b['trades']} trades, "
                      f"expectancy {b['expectancy']:.2%}"]
            if self.base_row:
                lines.append(f"- vs baseline CAGR {self.base_row['cagr']:.1%} / "
                             f"Sharpe {self.base_row['sharpe']:.2f} / "
                             f"maxDD {self.base_row['max_drawdown']:.1%}")
        return "\n".join(lines)


class CapitalUtilizationSweep:
    def __init__(self, base_cfg: Config, grid: Optional[dict] = None,
                 drawdown_tolerance: float = 0.20, objective: str = "cagr"):
        self.base_cfg = base_cfg
        self.axes = grid or DEFAULT_AXES     # {axis_name: [override_dict, ...]}
        self.tolerance = drawdown_tolerance
        self.objective = objective   # "cagr" | "total_return" | "sharpe"

    def run(self, universe: Dict, adapter=None, verbose: bool = False) -> SweepResult:
        fold_cache: dict = {}   # shared across all points — train once, replay cheap
        axis_names = list(self.axes.keys())
        combos = list(itertools.product(*[self.axes[a] for a in axis_names]))

        rows: List[dict] = []
        for combo in combos:
            overrides: dict = {}
            for od in combo:
                overrides.update(od)
            cfg = self.base_cfg.with_overrides(overrides)
            bt = WalkForwardBacktester(cfg)
            res = bt.run(universe, adapter=adapter, fold_cache=fold_cache)
            m = res.metrics
            row = {
                "universe.niche_size": overrides.get(
                    "universe.niche_size", self.base_cfg.get("universe.niche_size")),
                "strategy.cooldown_days": overrides.get(
                    "strategy.cooldown_days", self.base_cfg.get("strategy.cooldown_days")),
                "risk.risk_per_trade": overrides.get(
                    "risk.risk_per_trade", self.base_cfg.get("risk.risk_per_trade")),
                "risk.max_weight_per_name": overrides.get(
                    "risk.max_weight_per_name",
                    self.base_cfg.get("risk.max_weight_per_name")),
                "overrides": overrides,
                "cagr": m.cagr, "total_return": m.total_return, "sharpe": m.sharpe,
                "max_drawdown": m.max_drawdown, "trades": m.n_trades,
                "expectancy": m.expectancy, "profit_factor": m.profit_factor,
                "calmar": m.calmar,
                "feasible": m.max_drawdown >= -self.tolerance,
            }
            rows.append(row)
            if verbose:
                print(f"  niche={row['universe.niche_size']} "
                      f"cd={row['strategy.cooldown_days']} "
                      f"risk={row['risk.risk_per_trade']:.3f}/"
                      f"w{row['risk.max_weight_per_name']:.2f} -> "
                      f"CAGR {row['cagr']:.1%} Sharpe {row['sharpe']:.2f} "
                      f"maxDD {row['max_drawdown']:.1%} tr={row['trades']} "
                      f"{'OK' if row['feasible'] else 'DD!'}", flush=True)

        obj = {"cagr": "cagr", "total_return": "total_return",
               "sharpe": "sharpe"}.get(self.objective, "cagr")
        # Constrained pick: among drawdown-feasible points, maximise the objective;
        # tie-break by Sharpe. If none feasible, fall back to the shallowest drawdown.
        feasible = [r for r in rows if r["feasible"]]
        if feasible:
            best = max(feasible, key=lambda r: (r[obj], r["sharpe"]))
        else:
            best = max(rows, key=lambda r: r["max_drawdown"]) if rows else None

        # Rank rows for display: feasible first, then by objective desc.
        rows_sorted = sorted(
            rows, key=lambda r: (r["feasible"], r[obj], r["sharpe"]), reverse=True)

        deltas = dict(best["overrides"]) if best else {}
        return SweepResult(
            rows=rows_sorted, best=best, tolerance=self.tolerance,
            objective=self.objective, feasible_count=len(feasible), deltas=deltas,
        )

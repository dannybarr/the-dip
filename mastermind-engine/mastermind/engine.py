"""MastermindEngine — orchestration of all layers (RESEARCH.md §11).

Two entry points mirror the two clocks in RESEARCH.md §9:
  * `backtest()`  — the slow clock: walk-forward evaluation + self-review.
  * `scan()`      — the fast clock: fit on all available history, then emit today's
                    ranked, risk-sized, principle-gated signals for the universe.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

from .config import Config, load_config
from .data import SyntheticAdapter
from .features import FeaturePipeline
from .labeling import triple_barrier_labels
from .models import EdgeModel
from .risk import RiskManager
from .strategy.signals import generate_signals, Signal
from .backtest import WalkForwardBacktester, BacktestResult
from .review import SelfReview, ReviewReport


@dataclass
class ScanResult:
    as_of: pd.Timestamp
    signals: List[Signal]                # accepted, ranked by conviction
    rejected: List[Signal]               # gated out, with reasons (transparency)
    sized: List[dict]                    # risk-manager output for accepted signals


class MastermindEngine:
    def __init__(self, config: Optional[Config] = None, adapter=None):
        self.cfg = config or load_config()
        self.adapter = adapter
        self.pipe = FeaturePipeline(self.cfg)
        self.risk = RiskManager(self.cfg)
        self._model: Optional[EdgeModel] = None

    # ---- data -------------------------------------------------------------
    def _get_universe(self) -> Dict[str, pd.DataFrame]:
        tickers = self.cfg.get("universe.tickers", [])
        if self.adapter is None:
            # Default to synthetic so the engine is runnable out of the box.
            self.adapter = SyntheticAdapter(tickers)
        return self.adapter.load_universe(tickers)

    # ---- slow clock: backtest + self-review -------------------------------
    def backtest(self, universe: Optional[Dict[str, pd.DataFrame]] = None
                 ) -> BacktestResult:
        universe = universe or self._get_universe()
        bt = WalkForwardBacktester(self.cfg)
        return bt.run(universe, adapter=self.adapter)

    def review(self, result: BacktestResult) -> ReviewReport:
        return SelfReview(self.cfg).review(result)

    def optimise(self, max_rounds: int = 3
                 ) -> tuple[Config, List[ReviewReport], List[BacktestResult]]:
        """Self-review loop: backtest -> critique -> apply evidence-backed deltas ->
        re-test, keeping a change only if OOS metrics improve (RESEARCH.md §8)."""
        cfg = self.cfg
        reports: List[ReviewReport] = []
        results: List[BacktestResult] = []
        universe = self._get_universe()
        best_score = -np.inf
        best_cfg = cfg

        for _ in range(max_rounds):
            engine = MastermindEngine(cfg, adapter=self.adapter)
            res = engine.backtest(universe)
            rep = SelfReview(cfg).review(res)
            results.append(res)
            reports.append(rep)

            score = self._score(res)
            if score > best_score:
                best_score, best_cfg = score, cfg
            if not rep.proposed_deltas:
                break  # nothing evidence-backed to try; converged
            cfg = cfg.with_overrides(rep.proposed_deltas)

        self.cfg = best_cfg
        return best_cfg, reports, results

    @staticmethod
    def _score(res: BacktestResult) -> float:
        m = res.metrics
        # Composite objective: reward risk-adjusted return, penalise drawdown.
        return m.sharpe + 0.5 * m.calmar + 2.0 * max(m.expectancy, -0.05)

    # ---- fast clock: today's signals --------------------------------------
    def scan(self, universe: Optional[Dict[str, pd.DataFrame]] = None,
             as_of: Optional[pd.Timestamp] = None) -> ScanResult:
        universe = universe or self._get_universe()

        # Build features/labels across all names and fit one model on ALL history
        # up to `as_of` (point-in-time; nothing after as_of is used).
        feats, X_parts, y_parts, w_parts = {}, [], [], []
        latest_common = None
        for t, df in universe.items():
            fund = self.adapter.fundamentals(t) if self.adapter else None
            cat = self.adapter.catalysts(t) if self.adapter else None
            f = self.pipe.build(df, fund, cat)
            feats[t] = f
            lab = triple_barrier_labels(
                df, f["atr"],
                pt_atr=self.cfg.get("labeling.profit_take_atr", 2.0),
                sl_atr=self.cfg.get("labeling.stop_loss_atr", 1.0),
                vertical_days=self.cfg.get("labeling.vertical_days", 15),
                min_hold_days=self.cfg.get("horizon.min_hold_days", 1),
                max_barrier_pct=self.cfg.get("labeling.max_barrier_pct"),
            )
            cutoff = as_of or f.index[-1]
            resolved = lab.label.copy()
            # Only train on labels fully resolved by the cutoff (no peeking).
            touch_dates = pd.Series(
                [f.index[int(p)] if np.isfinite(p) else pd.NaT
                 for p in lab.touch_idx.values], index=f.index)
            keep = resolved.notna() & (touch_dates <= cutoff) & (f.index <= cutoff)
            cols = self.pipe.feature_columns(f)
            if keep.any():
                X_parts.append(f.loc[keep, cols])
                y_parts.append(resolved[keep])
                w = np.where(resolved[keep].values == 0, 0.5, 1.0)
                w_parts.append(pd.Series(w, index=f.loc[keep].index))
            latest_common = cutoff if latest_common is None else min(latest_common, cutoff)

        if not X_parts:
            return ScanResult(as_of or pd.Timestamp.today(), [], [], [])

        # Pooled cross-section has duplicate dates across tickers; concat positionally
        # (parts are row-aligned) and reset the index to avoid non-unique-axis errors.
        X = pd.concat(X_parts, axis=0).reset_index(drop=True)
        y = pd.concat(y_parts, axis=0).reset_index(drop=True)
        w = pd.concat(w_parts, axis=0).reset_index(drop=True)
        self._model = EdgeModel(self.cfg).fit(X, y, sample_weight=w)

        # Score each name at its latest available bar <= as_of.
        candidates, accepted_signals, rejected_signals = [], [], []
        for t, f in feats.items():
            cutoff = as_of or f.index[-1]
            valid = f.index[f.index <= cutoff]
            if len(valid) == 0:
                continue
            dt = valid[-1]
            cols = self.pipe.feature_columns(f)
            edge = self._model.predict_proba(f.loc[[dt], cols])
            sigs = generate_signals(t, f, pd.Series(edge, index=[dt]).reindex(f.index).values,
                                    universe[t], self.cfg, as_of=dt)
            for s in sigs:
                if s.rejected:
                    rejected_signals.append(s)
                else:
                    accepted_signals.append(s)
                    candidates.append({
                        "ticker": t, "conviction": s.conviction, "edge": s.edge,
                        "entry": s.entry, "stop": s.stop, "target": s.target,
                        "vol_regime": float(f.loc[dt].get("vol_regime", 1.0)),
                        "sector": "NA",
                    })

        equity = self.cfg.get("backtest.initial_equity", 100000)
        sized = self.risk.select_portfolio(candidates, equity, n_open=0)
        sized_tickers = {c["ticker"] for c in sized}
        accepted_signals = [s for s in accepted_signals if s.ticker in sized_tickers]
        accepted_signals.sort(key=lambda s: s.conviction, reverse=True)

        return ScanResult(
            as_of=as_of or pd.Timestamp.today(),
            signals=accepted_signals,
            rejected=rejected_signals,
            sized=sorted(sized, key=lambda c: c["conviction"], reverse=True),
        )

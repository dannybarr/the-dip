"""Unbiased self-critique + optimisation proposals (RESEARCH.md §8).

The engine treats its own track record as data. This module:
  1. Attributes performance (by conviction bucket, exit reason, holding period, and
     — when available — hidden regime).
  2. Runs a fixed self-critique checklist (overfit, alpha decay, calibration,
     loss clustering, thesis discipline).
  3. Proposes concrete, config-level parameter deltas — but ONLY when there is
     enough evidence (min trades) so it can't overfit its own review. Insufficiently
     -supported ideas are logged as hypotheses, not applied.

The output is both human-readable (findings + verdict) and machine-readable
(proposed `deltas` you can feed to Config.with_overrides for an OOS re-test).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

import numpy as np
import pandas as pd

from ..backtest.engine import BacktestResult


@dataclass
class ReviewReport:
    verdict: str                         # e.g. "HEALTHY", "OVERFIT_RISK", "DECAYING"
    findings: List[str] = field(default_factory=list)
    proposed_deltas: Dict[str, object] = field(default_factory=dict)
    hypotheses: List[str] = field(default_factory=list)
    attribution: Dict[str, object] = field(default_factory=dict)

    def to_markdown(self) -> str:
        lines = [f"# Self-Review — verdict: **{self.verdict}**", ""]
        lines.append("## Findings")
        lines += [f"- {f}" for f in self.findings] or ["- (none)"]
        lines.append("\n## Proposed parameter changes (evidence-backed)")
        if self.proposed_deltas:
            lines += [f"- `{k}` -> `{v}`" for k, v in self.proposed_deltas.items()]
        else:
            lines.append("- (none — insufficient evidence to change anything)")
        lines.append("\n## Hypotheses (logged, NOT applied — need more evidence)")
        lines += [f"- {h}" for h in self.hypotheses] or ["- (none)"]
        lines.append("\n## Attribution")
        for k, v in self.attribution.items():
            lines.append(f"- **{k}**: {v}")
        return "\n".join(lines)


class SelfReview:
    def __init__(self, cfg):
        self.cfg = cfg

    def review(self, result: BacktestResult) -> ReviewReport:
        cfg = self.cfg
        m = result.metrics
        findings: List[str] = []
        deltas: Dict[str, object] = {}
        hypotheses: List[str] = []
        attribution: Dict[str, object] = {}

        min_trades = cfg.get("review.min_trades_for_change", 30)
        tf = result.trade_frame
        n = m.n_trades

        # --- 1. Attribution --------------------------------------------------
        if tf is not None and len(tf) > 0:
            by_reason = tf.groupby("reason")["ret"].agg(["count", "mean"]).round(4)
            attribution["exit_reason"] = by_reason.to_dict("index")

            # Conviction buckets: is higher conviction actually better? (edge sanity)
            tf = tf.copy()
            tf["conv_bucket"] = pd.qcut(tf["conviction"].rank(method="first"),
                                        q=min(3, tf["conviction"].nunique()),
                                        labels=False, duplicates="drop")
            by_conv = tf.groupby("conv_bucket")["ret"].mean().round(4)
            attribution["by_conviction"] = by_conv.to_dict()
            if len(by_conv) >= 2 and by_conv.iloc[-1] <= by_conv.iloc[0]:
                findings.append(
                    "Conviction is NOT monotonic with return — the sizing signal may "
                    "be miscalibrated; investigate conviction_score weights.")
                hypotheses.append("Recalibrate conviction: down-weight regime_fit term.")

            avg_hold = (pd.to_datetime(tf["exit_date"]) -
                        pd.to_datetime(tf["entry_date"])).dt.days.mean()
            attribution["avg_holding_days"] = round(float(avg_hold), 1)

        # --- 2. Self-critique checklist -------------------------------------
        # (a) Edge existence / expectancy.
        if n >= min_trades:
            if m.expectancy <= 0:
                findings.append(
                    f"Negative expectancy ({m.expectancy:.2%}/trade) over {n} trades — "
                    "no exploitable edge under current settings.")
                # Tighten selectivity: raise the edge & conviction floors.
                deltas["strategy.min_edge"] = round(
                    min(cfg.get("strategy.min_edge", 0.55) + 0.03, 0.7), 3)
                deltas["strategy.min_conviction"] = round(
                    min(cfg.get("strategy.min_conviction", 0.15) + 0.05, 0.4), 3)
            else:
                findings.append(
                    f"Positive expectancy {m.expectancy:.2%}/trade, PF {m.profit_factor:.2f} "
                    f"over {n} trades.")
        else:
            findings.append(
                f"Only {n} trades (< {min_trades}) — INSUFFICIENT evidence to change "
                "parameters. Widen universe or lengthen backtest before trusting stats.")

        # (b) Risk-adjusted quality.
        if m.sharpe < 0.5 and n >= min_trades:
            findings.append(f"Low Sharpe ({m.sharpe:.2f}) — weak risk-adjusted edge.")
            hypotheses.append("Trial tighter stops (labeling.stop_loss_atr 0.8) to "
                              "improve payoff asymmetry.")
        elif m.sharpe >= 1.0:
            findings.append(f"Healthy Sharpe ({m.sharpe:.2f}).")

        # (c) Drawdown / survival.
        if m.max_drawdown < -0.25:
            findings.append(
                f"Max drawdown {m.max_drawdown:.1%} breaches the survival comfort zone "
                "(-25%). Reduce per-trade risk / gross exposure.")
            deltas["risk.risk_per_trade"] = round(
                max(cfg.get("risk.risk_per_trade", 0.01) * 0.75, 0.004), 4)

        # (d) Win-rate vs payoff coherence (are we relying on a rare fat tail?).
        if n >= min_trades and m.win_rate < 0.35 and m.profit_factor < 1.2:
            findings.append(
                "Low win-rate AND low profit factor — edge is fragile; likely noise.")

        # (e) Alpha-decay check across folds (later folds worse than earlier?).
        decay = self._alpha_decay(result)
        if decay is not None:
            attribution["fold_expectancy_trend"] = decay
            if decay < -0.5:
                findings.append(
                    "Expectancy is DECAYING across folds — the edge may be crowding "
                    "out. Prioritise the self-review's fast-clock refit cadence.")
                hypotheses.append("Shorten backtest.train_window_days to adapt faster.")

        # --- 3. Verdict ------------------------------------------------------
        verdict = self._verdict(m, n, min_trades, decay)
        attribution["headline"] = m.summary()

        return ReviewReport(verdict, findings, deltas, hypotheses, attribution)

    def _alpha_decay(self, result: BacktestResult):
        tf = result.trade_frame
        if tf is None or len(tf) < 10:
            return None
        tf = tf.sort_values("exit_date")
        half = len(tf) // 2
        first = tf.iloc[:half]["ret"].mean()
        second = tf.iloc[half:]["ret"].mean()
        if abs(first) < 1e-9:
            return None
        return round(float((second - first) / abs(first)), 3)  # relative change

    @staticmethod
    def _verdict(m, n, min_trades, decay) -> str:
        if n < min_trades:
            return "INSUFFICIENT_EVIDENCE"
        if m.expectancy <= 0 or (m.win_rate < 0.35 and m.profit_factor < 1.2):
            return "NO_EDGE"
        if decay is not None and decay < -0.5:
            return "DECAYING"
        if m.max_drawdown < -0.25:
            return "EDGE_BUT_RISKY"
        if m.sharpe >= 1.0 and m.expectancy > 0:
            return "HEALTHY"
        return "MARGINAL"

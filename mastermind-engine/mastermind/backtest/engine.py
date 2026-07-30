"""Walk-forward, purged, embargoed backtester with realistic costs (RESEARCH.md §6).

Design goals (in priority order): NO lookahead, honest costs, and portfolio-level
simulation that mirrors how the live engine would actually trade.

Flow:
  1. Per ticker: build point-in-time features + triple-barrier labels (with the
     label-resolution date, used for purging).
  2. Walk forward in folds. For each fold, train ONE model on the prior window,
     PURGING training rows whose label resolves after the train cutoff and applying
     an EMBARGO gap, so a label's future outcome can never leak into training.
  3. Simulate the portfolio continuously across folds: signals -> risk-managed
     selection -> enter next open -> manage via stop/target/time -> costs on fills.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

from ..features import FeaturePipeline
from ..labeling import triple_barrier_labels
from ..models import EdgeModel
from ..risk import RiskManager
from ..strategy.signals import generate_signals
from .metrics import performance_metrics, PerformanceReport


@dataclass
class Trade:
    ticker: str
    entry_date: pd.Timestamp
    exit_date: pd.Timestamp
    entry: float
    exit: float
    shares: float
    ret: float                 # net of costs, as fraction of entry notional
    pnl: float
    reason: str
    conviction: float
    edge: float


@dataclass
class BacktestResult:
    equity_curve: pd.Series
    trades: List[Trade]
    metrics: PerformanceReport
    fold_metrics: List[dict] = field(default_factory=list)
    trade_frame: Optional[pd.DataFrame] = None


class WalkForwardBacktester:
    def __init__(self, cfg):
        self.cfg = cfg
        self.pipe = FeaturePipeline(cfg)
        self.risk = RiskManager(cfg)

    # ---- data prep --------------------------------------------------------
    def _prepare(self, universe: Dict[str, pd.DataFrame], adapter=None):
        feats: Dict[str, pd.DataFrame] = {}
        labels: Dict[str, object] = {}
        for t, df in universe.items():
            fund = adapter.fundamentals(t) if adapter else None
            cat = adapter.catalysts(t) if adapter else None
            f = self.pipe.build(df, fund, cat)
            lab = triple_barrier_labels(
                df, f["atr"],
                pt_atr=self.cfg.get("labeling.profit_take_atr", 2.0),
                sl_atr=self.cfg.get("labeling.stop_loss_atr", 1.0),
                vertical_days=self.cfg.get("labeling.vertical_days", 15),
                min_hold_days=self.cfg.get("horizon.min_hold_days", 1),
            )
            feats[t] = f
            labels[t] = lab
        return feats, labels

    def _training_matrix(self, feats, labels, universe, train_start, train_end):
        """Pooled cross-sectional training data with purging + embargo."""
        embargo = pd.Timedelta(days=self.cfg.get("backtest.embargo_days", 5))
        cutoff = train_end - embargo
        Xs, ys, ws = [], [], []
        for t, f in feats.items():
            lab = labels[t]
            idx = f.index
            mask = (idx >= train_start) & (idx <= cutoff)
            if not mask.any():
                continue
            sub = f[mask]
            lbl = lab.label.reindex(sub.index)
            # touch date of each sample's label; PURGE those resolving after cutoff.
            touch_pos = lab.touch_idx.reindex(sub.index)
            touch_dates = pd.Series(
                [idx[int(p)] if np.isfinite(p) else pd.NaT for p in touch_pos.values],
                index=sub.index,
            )
            keep = lbl.notna() & (touch_dates <= cutoff)
            sub = sub[keep]
            lbl = lbl[keep]
            if len(sub) == 0:
                continue
            cols = self.pipe.feature_columns(sub)
            Xs.append(sub[cols])
            ys.append(lbl)
            # Weight timeout(0) less than decisive outcomes; recent samples heavier.
            w = np.where(lbl.values == 0, 0.5, 1.0)
            age = (cutoff - sub.index).days.astype(float)
            w = w * np.exp(-age / 365.0)
            ws.append(pd.Series(w, index=sub.index))
        if not Xs:
            return None, None, None
        # Pooled cross-section => the DatetimeIndex has duplicate dates (one per
        # ticker), so we concat POSITIONALLY (parts are already row-aligned) and must
        # NOT reindex on a non-unique axis. Tree models are order-invariant.
        X = pd.concat(Xs, axis=0)
        y = pd.concat(ys, axis=0)
        w = pd.concat(ws, axis=0)
        X = X.reset_index(drop=True)
        y = y.reset_index(drop=True)
        w = w.reset_index(drop=True)
        return X, y, w

    # ---- main loop --------------------------------------------------------
    def run(self, universe: Dict[str, pd.DataFrame], adapter=None) -> BacktestResult:
        feats, labels = self._prepare(universe, adapter)
        all_dates = sorted(set().union(*[set(f.index) for f in feats.values()]))
        all_dates = pd.DatetimeIndex(all_dates)

        train_w = pd.Timedelta(days=self.cfg.get("backtest.train_window_days", 504))
        test_w = pd.Timedelta(days=self.cfg.get("backtest.test_window_days", 63))
        min_train = self.cfg.get("model.min_train_samples", 250)

        equity = float(self.cfg.get("backtest.initial_equity", 100000))
        cash = equity
        open_pos: Dict[str, dict] = {}
        trades: List[Trade] = []
        equity_series: Dict[pd.Timestamp, float] = {}
        fold_metrics: List[dict] = []
        exposure_days = 0

        commission = self.cfg.get("backtest.commission_bps", 2.0) / 1e4
        slippage = self.cfg.get("backtest.slippage_bps", 5.0) / 1e4
        cost = commission + slippage  # per side

        start = all_dates[0] + train_w
        fold_start = start
        model: Optional[EdgeModel] = None
        edge_cache: Dict[str, pd.Series] = {}
        fold_end = fold_start  # will be set on first (re)train

        for i, today in enumerate(all_dates):
            if today < start:
                # accrue equity curve during warmup (flat)
                equity_series[today] = cash
                continue

            # (Re)train at each fold boundary.
            if model is None or today >= fold_end:
                fold_start = today
                fold_end = today + test_w
                train_start = today - train_w
                X, y, w = self._training_matrix(feats, labels, universe,
                                                train_start, today)
                if X is not None and len(X) >= min_train:
                    model = EdgeModel(self.cfg).fit(X, y, sample_weight=w)
                    edge_cache = self._score_fold(model, feats, today, fold_end)
                    fold_metrics.append({"date": str(today.date()),
                                         "train_n": int(len(X))})
                else:
                    model = model  # keep previous model if we can't retrain yet

            # 1) manage OPEN positions (check stop/target/time on today's bar).
            for t in list(open_pos.keys()):
                pos = open_pos[t]
                if today not in universe[t].index:
                    continue
                bar = universe[t].loc[today]
                exit_price, reason = self._check_exit(pos, bar, today)
                if exit_price is not None:
                    proceeds = pos["shares"] * exit_price * (1 - cost)
                    cash += proceeds
                    entry_notional = pos["shares"] * pos["entry"]
                    net = proceeds - entry_notional * (1 + cost) + entry_notional * cost
                    ret = (proceeds / (entry_notional * (1 + cost))) - 1.0
                    trades.append(Trade(
                        ticker=t, entry_date=pos["entry_date"], exit_date=today,
                        entry=pos["entry"], exit=exit_price, shares=pos["shares"],
                        ret=ret, pnl=proceeds - entry_notional * (1 + cost),
                        reason=reason, conviction=pos["conviction"], edge=pos["edge"],
                    ))
                    del open_pos[t]

            # 2) look for NEW entries if we have slots and a live model.
            if model is not None and len(open_pos) < self.cfg.get("risk.max_positions", 8):
                candidates = self._candidates(today, feats, edge_cache, universe, open_pos)
                equity_now = cash + self._open_value(open_pos, universe, today)
                accepted = self.risk.select_portfolio(
                    candidates, equity_now, open_sectors=None, n_open=len(open_pos))
                # Enter at NEXT day's open (no lookahead on the signal bar).
                nxt = all_dates[i + 1] if i + 1 < len(all_dates) else None
                for c in accepted:
                    t = c["ticker"]
                    if t in open_pos or nxt is None or nxt not in universe[t].index:
                        continue
                    fill = float(universe[t].loc[nxt, "open"]) * (1 + slippage)
                    notional = c["shares"] * fill
                    if notional > cash:
                        c["shares"] = cash / fill
                        notional = c["shares"] * fill
                    if c["shares"] <= 0:
                        continue
                    cash -= notional * (1 + commission)
                    open_pos[t] = {
                        "shares": c["shares"], "entry": fill, "entry_date": nxt,
                        "stop": c["stop"], "target": c["target"],
                        "conviction": c["conviction"], "edge": c["edge"],
                        "max_exit": nxt + pd.Timedelta(
                            days=int(self.cfg.get("labeling.vertical_days", 15) * 1.6)),
                    }

            # 3) mark-to-market equity.
            equity_now = cash + self._open_value(open_pos, universe, today)
            equity_series[today] = equity_now
            if open_pos:
                exposure_days += 1

        equity_curve = pd.Series(equity_series).sort_index()
        trade_rets = [t.ret for t in trades]
        exposure = exposure_days / max(len(equity_curve), 1)
        turnover = len(trades) / max(len(equity_curve) / 252.0, 1e-9)
        metrics = performance_metrics(equity_curve, trade_rets, exposure, turnover)
        tf = pd.DataFrame([t.__dict__ for t in trades]) if trades else None
        return BacktestResult(equity_curve, trades, metrics, fold_metrics, tf)

    # ---- helpers ----------------------------------------------------------
    def _score_fold(self, model, feats, fold_start, fold_end):
        cache: Dict[str, pd.Series] = {}
        for t, f in feats.items():
            mask = (f.index >= fold_start - pd.Timedelta(days=5)) & (f.index <= fold_end)
            sub = f[mask]
            if len(sub) == 0:
                cache[t] = pd.Series(dtype=float)
                continue
            cols = self.pipe.feature_columns(sub)
            edges = model.predict_proba(sub[cols])
            cache[t] = pd.Series(edges, index=sub.index)
        return cache

    def _candidates(self, today, feats, edge_cache, universe, open_pos):
        out = []
        for t, f in feats.items():
            if t in open_pos or today not in f.index:
                continue
            ec = edge_cache.get(t)
            if ec is None or today not in ec.index:
                continue
            sigs = generate_signals(t, f, ec.reindex(f.index).values,
                                    universe[t], self.cfg, as_of=today)
            for s in sigs:
                if s.rejected:
                    continue
                out.append({
                    "ticker": t, "conviction": s.conviction, "edge": s.edge,
                    "entry": s.entry, "stop": s.stop, "target": s.target,
                    "vol_regime": float(f.loc[today].get("vol_regime", 1.0)),
                    "sector": "NA",
                })
        return out

    @staticmethod
    def _check_exit(pos, bar, today):
        low, high, close = float(bar["low"]), float(bar["high"]), float(bar["close"])
        if low <= pos["stop"]:
            return pos["stop"], "stop"
        if high >= pos["target"]:
            return pos["target"], "target"
        if today >= pos["max_exit"]:
            return close, "time"
        return None, ""

    @staticmethod
    def _open_value(open_pos, universe, today):
        v = 0.0
        for t, pos in open_pos.items():
            if today in universe[t].index:
                v += pos["shares"] * float(universe[t].loc[today, "close"])
            else:
                v += pos["shares"] * pos["entry"]
        return v

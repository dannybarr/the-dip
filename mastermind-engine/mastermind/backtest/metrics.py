"""Performance metrics (RESEARCH.md §6).

Reported honestly: risk-adjusted (Sharpe/Sortino), tail (max drawdown), and
trade-level (hit rate, profit factor, expectancy). These are what separate a real
edge from a lucky equity curve.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Dict, List

import numpy as np
import pandas as pd

TRADING_DAYS = 252


@dataclass
class PerformanceReport:
    n_trades: int
    win_rate: float
    profit_factor: float
    expectancy: float          # mean return per trade
    avg_win: float
    avg_loss: float
    cagr: float
    sharpe: float
    sortino: float
    max_drawdown: float
    calmar: float
    total_return: float
    exposure: float
    turnover: float

    def as_dict(self) -> Dict[str, float]:
        return asdict(self)

    def summary(self) -> str:
        return (
            f"trades={self.n_trades}  win%={self.win_rate:.1%}  "
            f"PF={self.profit_factor:.2f}  expectancy={self.expectancy:.2%}  "
            f"CAGR={self.cagr:.1%}  Sharpe={self.sharpe:.2f}  "
            f"Sortino={self.sortino:.2f}  maxDD={self.max_drawdown:.1%}  "
            f"Calmar={self.calmar:.2f}"
        )


def performance_metrics(
    equity_curve: pd.Series,
    trade_returns: List[float],
    exposure: float = np.nan,
    turnover: float = np.nan,
) -> PerformanceReport:
    equity_curve = equity_curve.dropna()
    trades = np.asarray([t for t in trade_returns if np.isfinite(t)], dtype=float)

    # Trade-level stats.
    n = len(trades)
    wins = trades[trades > 0]
    losses = trades[trades < 0]
    win_rate = len(wins) / n if n else 0.0
    gross_win = wins.sum()
    gross_loss = -losses.sum()
    profit_factor = (gross_win / gross_loss) if gross_loss > 0 else (
        np.inf if gross_win > 0 else 0.0)
    expectancy = float(trades.mean()) if n else 0.0
    avg_win = float(wins.mean()) if len(wins) else 0.0
    avg_loss = float(losses.mean()) if len(losses) else 0.0

    # Curve-level stats.
    if len(equity_curve) > 1:
        rets = equity_curve.pct_change().dropna()
        total_return = equity_curve.iloc[-1] / equity_curve.iloc[0] - 1.0
        years = max(len(equity_curve) / TRADING_DAYS, 1e-9)
        cagr = (equity_curve.iloc[-1] / equity_curve.iloc[0]) ** (1 / years) - 1.0
        vol = rets.std() * np.sqrt(TRADING_DAYS)
        sharpe = (rets.mean() * TRADING_DAYS) / vol if vol > 0 else 0.0
        downside = rets[rets < 0].std() * np.sqrt(TRADING_DAYS)
        sortino = (rets.mean() * TRADING_DAYS) / downside if downside > 0 else 0.0
        roll_max = equity_curve.cummax()
        dd = (equity_curve / roll_max - 1.0).min()
        calmar = cagr / abs(dd) if dd < 0 else 0.0
    else:
        total_return = cagr = sharpe = sortino = dd = calmar = 0.0

    return PerformanceReport(
        n_trades=n, win_rate=win_rate, profit_factor=float(profit_factor),
        expectancy=expectancy, avg_win=avg_win, avg_loss=avg_loss,
        cagr=float(cagr), sharpe=float(sharpe), sortino=float(sortino),
        max_drawdown=float(dd), calmar=float(calmar), total_return=float(total_return),
        exposure=float(exposure), turnover=float(turnover),
    )

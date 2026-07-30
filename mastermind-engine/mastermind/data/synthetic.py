"""Synthetic OHLCV generator with *learnable* structure.

Purpose (RESEARCH.md §9): prove the whole pipeline end-to-end offline, in a build
sandbox where live feeds are firewalled. Crucially the generator embeds the exact
inefficiencies the engine is designed to exploit, so a correctly-built model shows a
real (not fabricated) edge and a broken one does not:

  * Regime switching between MOMENTUM (positive autocorrelation) and
    MEAN-REVERSION (negative autocorrelation) regimes.
  * Catalyst gap-downs. High-"moat" names tend to OVERREACT then recover (the
    Ferrari pattern, §3 Pillar 3); low-moat names' gaps are informative and persist.
  * Fundamentals correlated with a latent quality/moat factor, so the value +
    quality gate (Pillar 2) has something real to gate on.

Determinstic given a seed, so tests are reproducible.
"""
from __future__ import annotations

from typing import Dict, List, Optional

import numpy as np
import pandas as pd

from .base import DataAdapter


class SyntheticAdapter(DataAdapter):
    def __init__(
        self,
        tickers: List[str],
        n_days: int = 1400,
        start: str = "2019-01-02",
        seed: int = 7,
    ):
        self.tickers = list(tickers)
        self.n_days = int(n_days)
        self.start = start
        self.seed = int(seed)
        self._cache: Dict[str, pd.DataFrame] = {}
        self._fund: Dict[str, pd.DataFrame] = {}
        self._cat: Dict[str, pd.DataFrame] = {}
        self._generate_all()

    # ---- public adapter API -------------------------------------------------
    def history(self, ticker: str) -> pd.DataFrame:
        return self._cache[ticker].copy()

    def fundamentals(self, ticker: str) -> Optional[pd.DataFrame]:
        return self._fund.get(ticker)

    def catalysts(self, ticker: str) -> Optional[pd.DataFrame]:
        return self._cat.get(ticker)

    # ---- generation ---------------------------------------------------------
    def _generate_all(self) -> None:
        dates = pd.bdate_range(self.start, periods=self.n_days, name="date")
        for i, t in enumerate(self.tickers):
            rng = np.random.default_rng(self.seed + i * 101)
            # Latent quality/moat in [0,1]; drives recovery propensity + fundamentals.
            moat = float(rng.uniform(0.25, 0.95))
            df, cat = self._simulate_path(rng, dates, moat)
            self._cache[t] = df
            self._cat[t] = cat
            self._fund[t] = self._make_fundamentals(dates, df, moat, rng)

    def _simulate_path(self, rng, dates, moat):
        n = len(dates)
        # Regime process: 0 = mean-revert, 1 = momentum. Persistent (Markov).
        regime = np.zeros(n, dtype=int)
        r = int(rng.integers(0, 2))
        for i in range(n):
            if rng.random() < 0.02:  # ~50-day average regime length
                r = 1 - r
            regime[i] = r

        base_vol = float(rng.uniform(0.012, 0.028))
        drift = float(rng.uniform(0.0001, 0.0005))  # mild positive equity drift
        log_price = np.log(float(rng.uniform(40, 400)))
        prev_ret = 0.0
        closes = np.empty(n)
        vols = np.empty(n)
        cat_rows = []

        # Volatility clustering (GARCH-lite)
        sig = base_vol
        for i in range(n):
            sig = float(np.sqrt(0.90 * sig ** 2 + 0.10 * base_vol ** 2
                                + 0.08 * (prev_ret ** 2)))
            shock = rng.normal(0, sig)
            if regime[i] == 1:      # momentum: positive autocorrelation
                ac = 0.18 * prev_ret
            else:                    # mean-reversion: pull back toward recent mean
                ac = -0.22 * prev_ret
            ret = drift + ac + shock

            # ---- catalyst gap events -------------------------------------
            if rng.random() < 0.014:  # ~1.4% of days a catalyst hits
                gap = -abs(rng.normal(0.06, 0.03))  # negative headline shock
                # High-moat names OVERREACT then recover (the Ferrari pattern);
                # low-moat names' gaps are informative and tend to persist.
                overreaction = moat > 0.55 and rng.random() < 0.75
                ret += gap
                cat_rows.append((dates[i], gap, overreaction, moat))
                if overreaction:
                    prev_ret = ret
                    log_price += ret
                    closes[i] = float(np.exp(log_price))
                    vols[i] = self._vol(rng, sig, spike=True)
                    # Inject a STEADY, low-noise multi-day recovery: a resilient name
                    # reclaims the overreaction. Steadiness (small noise) is what makes
                    # the upside barrier resolve before the downside stop — i.e. a
                    # detectable overreaction edge, as real oversold bounces exhibit.
                    length = int(rng.integers(9, 16))
                    per_day = abs(gap) * rng.uniform(0.20, 0.32)  # reclaim most of gap
                    for k in range(1, length):
                        if i + k >= n:
                            break
                        rr = drift + per_day + rng.normal(0, sig * 0.35)
                        log_price += rr
                        closes[i + k] = float(np.exp(log_price))
                        vols[i + k] = self._vol(rng, sig)
                        prev_ret = rr
                    continue
            prev_ret = ret
            log_price += ret
            closes[i] = float(np.exp(log_price))
            vols[i] = self._vol(rng, sig)

        # Fill any gaps left by the recovery-loop lookahead writes.
        for i in range(n):
            if closes[i] == 0:
                closes[i] = closes[i - 1] if i > 0 else float(np.exp(log_price))
            if vols[i] == 0:
                vols[i] = self._vol(rng, base_vol)

        close = pd.Series(closes, index=dates)
        # Build OHLC around close with plausible intraday range.
        rng_hl = np.abs(rng.normal(0, base_vol, n)) + 0.003
        high = close * (1 + rng_hl)
        low = close * (1 - rng_hl)
        open_ = close.shift(1).fillna(close.iloc[0]) * (1 + rng.normal(0, base_vol / 2, n))
        high = np.maximum.reduce([high.values, open_.values, close.values])
        low = np.minimum.reduce([low.values, open_.values, close.values])

        df = pd.DataFrame(
            {
                "open": open_.values,
                "high": high,
                "low": low,
                "close": close.values,
                "volume": vols,
                "regime": regime,  # hidden truth, useful for review attribution
            },
            index=dates,
        )
        cat = pd.DataFrame(
            cat_rows, columns=["date", "gap", "overreaction", "moat"]
        ).set_index("date") if cat_rows else pd.DataFrame(
            columns=["gap", "overreaction", "moat"]
        )
        return df, cat

    @staticmethod
    def _vol(rng, sig, spike: bool = False) -> float:
        base = 1_000_000 * (1 + 20 * sig)
        mult = rng.uniform(3, 6) if spike else rng.uniform(0.6, 1.6)
        return float(base * mult)

    def _make_fundamentals(self, dates, df, moat, rng):
        # Quarterly point-in-time fundamentals correlated with the moat latent.
        q_dates = dates[::63]
        roe = 0.05 + 0.30 * moat + rng.normal(0, 0.02, len(q_dates))
        fcf_yield = 0.01 + 0.06 * moat + rng.normal(0, 0.01, len(q_dates))
        gross_margin = 0.20 + 0.55 * moat + rng.normal(0, 0.03, len(q_dates))
        debt_to_equity = np.clip(1.5 - 1.2 * moat + rng.normal(0, 0.1, len(q_dates)), 0.05, 3)
        # Valuation wanders; higher-moat names trade richer on average.
        pe = np.clip(12 + 25 * moat + rng.normal(0, 6, len(q_dates)), 5, 80)
        return pd.DataFrame(
            {
                "pe": pe,
                "fcf_yield": fcf_yield,
                "roe": roe,
                "gross_margin": gross_margin,
                "debt_to_equity": debt_to_equity,
            },
            index=pd.DatetimeIndex(q_dates, name="date"),
        )

"""Data adapter contract."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Dict, List, Optional

import pandas as pd

# Uniform schema every adapter must return, indexed by a DatetimeIndex named "date".
OHLCV_COLUMNS = ["open", "high", "low", "close", "volume"]


class DataAdapter(ABC):
    """Source-agnostic market-data provider.

    Contract:
      * `history(ticker)` returns a DataFrame indexed by date (ascending, unique),
        with at least OHLCV_COLUMNS, containing ONLY point-in-time-valid rows.
      * Optional `fundamentals(ticker)` / `catalysts(ticker)` feed the value and
        strategic-bet feature families; adapters without them return None/empty.
    """

    @abstractmethod
    def history(self, ticker: str) -> pd.DataFrame:
        ...

    def fundamentals(self, ticker: str) -> Optional[pd.DataFrame]:
        """Point-in-time fundamentals (columns like pe, ev_ebitda, fcf_yield, roe...).

        Return None if the source has no fundamentals; the value features degrade
        gracefully to price-derived proxies.
        """
        return None

    def catalysts(self, ticker: str) -> Optional[pd.DataFrame]:
        """Event/news rows (date-indexed: event_type, sentiment[-1..1], surprise...).

        Return None if unavailable; catalyst features fall back to price-derived
        gap/volume shock detection.
        """
        return None

    def load_universe(self, tickers: List[str]) -> Dict[str, pd.DataFrame]:
        """Convenience: history for many tickers, skipping any that fail/empty."""
        out: Dict[str, pd.DataFrame] = {}
        for t in tickers:
            try:
                df = self.history(t)
            except Exception:
                continue
            if df is not None and len(df) > 0:
                out[t] = self._validate(df, t)
        return out

    @staticmethod
    def _validate(df: pd.DataFrame, ticker: str) -> pd.DataFrame:
        missing = [c for c in OHLCV_COLUMNS if c not in df.columns]
        if missing:
            raise ValueError(f"{ticker}: adapter missing columns {missing}")
        df = df[~df.index.duplicated(keep="last")].sort_index()
        if df.index.name != "date":
            df.index.name = "date"
        return df

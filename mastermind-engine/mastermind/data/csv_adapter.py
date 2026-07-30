"""CSV adapter — load OHLCV from a directory of `<TICKER>.csv` files.

Lets you backtest on any real dataset you can export (Stooq, Nasdaq, broker export)
without a live network connection. Expects columns: date,open,high,low,close,volume.
"""
from __future__ import annotations

import os

import pandas as pd

from .base import DataAdapter, OHLCV_COLUMNS


class CSVAdapter(DataAdapter):
    def __init__(self, directory: str, date_col: str = "date"):
        self.directory = directory
        self.date_col = date_col

    def history(self, ticker: str) -> pd.DataFrame:
        path = os.path.join(self.directory, f"{ticker}.csv")
        if not os.path.exists(path):
            raise FileNotFoundError(path)
        df = pd.read_csv(path)
        df.columns = [c.strip().lower() for c in df.columns]
        df[self.date_col] = pd.to_datetime(df[self.date_col])
        df = df.set_index(self.date_col).sort_index()
        df.index.name = "date"
        return df[OHLCV_COLUMNS]

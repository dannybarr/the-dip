"""FMP (Financial Modeling Prep) adapter — live data at deploy time.

The Dip already uses FMP via a serverless proxy; the engine reuses that account.
In the build sandbox outbound finance hosts are firewalled, so this adapter is
import-safe and only touches the network when actually called with an API key.

Set FMP_API_KEY (or pass api_key=). Optionally set FMP_BASE_URL to point at your
own proxy (e.g. The Dip's Vercel FMP proxy) to keep the key server-side.
"""
from __future__ import annotations

import os
from typing import Optional

import pandas as pd

from .base import DataAdapter, OHLCV_COLUMNS

_DEFAULT_BASE = "https://financialmodelingprep.com/api/v3"


class FMPAdapter(DataAdapter):
    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None,
                 timeout: int = 15):
        self.api_key = api_key or os.environ.get("FMP_API_KEY")
        self.base_url = base_url or os.environ.get("FMP_BASE_URL", _DEFAULT_BASE)
        self.timeout = timeout

    def _get(self, path: str, params: dict) -> object:
        try:
            import requests  # local import: keeps the package importable without it
        except Exception as e:  # pragma: no cover
            raise RuntimeError("FMPAdapter needs `requests`; pip install requests") from e
        if not self.api_key and "apikey" not in params:
            raise RuntimeError("FMP_API_KEY not set (or use a proxy via FMP_BASE_URL)")
        params = {**params, "apikey": self.api_key} if self.api_key else params
        resp = requests.get(f"{self.base_url}/{path}", params=params, timeout=self.timeout)
        resp.raise_for_status()
        return resp.json()

    def history(self, ticker: str) -> pd.DataFrame:
        data = self._get(f"historical-price-full/{ticker}", {"serietype": "line"})
        rows = data.get("historical", []) if isinstance(data, dict) else []
        if not rows:
            return pd.DataFrame(columns=OHLCV_COLUMNS)
        df = pd.DataFrame(rows)
        df["date"] = pd.to_datetime(df["date"])
        df = df.set_index("date").sort_index()
        df.index.name = "date"
        for c in OHLCV_COLUMNS:
            if c not in df.columns:
                df[c] = pd.NA
        return df[OHLCV_COLUMNS].astype(float)

    def fundamentals(self, ticker: str) -> Optional[pd.DataFrame]:
        try:
            ratios = self._get(f"ratios/{ticker}", {"period": "quarter", "limit": 40})
        except Exception:
            return None
        if not isinstance(ratios, list) or not ratios:
            return None
        df = pd.DataFrame(ratios)
        if "date" not in df:
            return None
        df["date"] = pd.to_datetime(df["date"])
        df = df.set_index("date").sort_index()
        rename = {
            "priceEarningsRatio": "pe",
            "freeCashFlowYield": "fcf_yield",
            "returnOnEquity": "roe",
            "grossProfitMargin": "gross_margin",
            "debtEquityRatio": "debt_to_equity",
        }
        keep = {k: v for k, v in rename.items() if k in df.columns}
        return df[list(keep)].rename(columns=keep) if keep else None

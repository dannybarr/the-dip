#!/usr/bin/env python3
"""Wire REAL market history into the engine.

Downloads (or reads a local copy of) a daily OHLCV dataset and splits it into the
per-ticker `<TICKER>.csv` files the CSVAdapter consumes, then writes a matching
config whose universe is the tickers actually present. Default source is the public
S&P-500 five-year daily dataset (plotly/datasets, 2013-2018) — real prices, no API key.

Usage:
    python scripts/fetch_real_data.py                         # curated liquid universe
    python scripts/fetch_real_data.py --source /path/all_stocks_5yr.csv
    python scripts/fetch_real_data.py --tickers AAPL,MSFT,NVDA,GOOGL,AMZN
    # then:
    python scripts/run_backtest.py --csv data_cache/sp500 --config config/real_sp500.yaml
    python scripts/run_sweep.py    --csv data_cache/sp500 --config config/real_sp500.yaml
"""
from __future__ import annotations

import argparse
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from mastermind import load_config   # noqa: E402

DEFAULT_URL = ("https://raw.githubusercontent.com/plotly/datasets/master/"
               "all_stocks_5yr.csv")
# Curated, sector-diverse, liquid large-caps present in the 2013-2018 S&P-500 set.
# Mix of high-beta names (more catalysts) and defensives (regime contrast).
CURATED = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "FB", "NFLX", "JPM", "GS",
           "LLY", "JNJ", "PG", "XOM", "CVX", "COST", "WMT", "HD", "DIS", "BA",
           "CAT", "V", "INTC"]


def _download(url: str, dest: str) -> str:
    ca = "/root/.ccr/ca-bundle.crt"
    verify = ca if os.path.exists(ca) else True
    try:
        import requests
        with requests.get(url, stream=True, timeout=120, verify=verify) as r:
            r.raise_for_status()
            with open(dest, "wb") as fh:
                for chunk in r.iter_content(1 << 20):
                    fh.write(chunk)
        return dest
    except Exception as e:
        raise SystemExit(f"download failed ({e}). Pass --source with a local CSV.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default=None, help="local all_stocks_5yr-style CSV")
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--out", default="data_cache/sp500")
    ap.add_argument("--tickers", default=None, help="comma list (default: curated)")
    ap.add_argument("--config-out", default="config/real_sp500.yaml")
    ap.add_argument("--base-config", default=None)
    args = ap.parse_args()

    src = args.source
    if src is None:
        os.makedirs("data_cache", exist_ok=True)
        src = _download(args.url, "data_cache/all_stocks_5yr.csv")

    df = pd.read_csv(src)
    df.columns = [c.strip().lower() for c in df.columns]
    name_col = "name" if "name" in df.columns else df.columns[-1]
    want = [t.strip().upper() for t in args.tickers.split(",")] if args.tickers else CURATED

    os.makedirs(args.out, exist_ok=True)
    present, coverage = [], []
    for t in want:
        sub = df[df[name_col] == t]
        if len(sub) < 252:                      # need ~1y minimum
            continue
        sub = sub[["date", "open", "high", "low", "close", "volume"]].dropna()
        sub = sub.sort_values("date")
        sub.to_csv(os.path.join(args.out, f"{t}.csv"), index=False)
        present.append(t)
        coverage.append((t, len(sub), sub["date"].iloc[0], sub["date"].iloc[-1]))

    if not present:
        raise SystemExit("no requested tickers had enough history in the source")

    # Write a config whose universe matches what we actually have.
    cfg = load_config(args.base_config)
    cfg = cfg.with_overrides({"universe.tickers": present})
    import yaml
    with open(args.config_out, "w", encoding="utf-8") as fh:
        yaml.safe_dump(cfg.data, fh, sort_keys=False)

    print(f"Wrote {len(present)} per-ticker CSVs -> {args.out}/")
    print(f"Universe config -> {args.config_out}")
    print(f"{'ticker':8s} {'rows':>6s}  {'from':>10s}  {'to':>10s}")
    for t, n, d0, d1 in coverage:
        print(f"{t:8s} {n:6d}  {d0:>10s}  {d1:>10s}")


if __name__ == "__main__":
    main()

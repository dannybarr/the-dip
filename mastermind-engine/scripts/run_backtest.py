#!/usr/bin/env python3
"""Run a walk-forward backtest + self-review and print a full report.

Usage:
    python scripts/run_backtest.py                 # synthetic data, default config
    python scripts/run_backtest.py --optimise      # run the self-review loop
    python scripts/run_backtest.py --config path/to/config.yaml
    python scripts/run_backtest.py --csv data_dir  # backtest on your own CSVs
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from mastermind import load_config, MastermindEngine   # noqa: E402
from mastermind.data import SyntheticAdapter, CSVAdapter  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=None)
    ap.add_argument("--csv", default=None, help="directory of <TICKER>.csv OHLCV files")
    ap.add_argument("--optimise", action="store_true")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    cfg = load_config(args.config)
    tickers = cfg.get("universe.tickers", [])
    adapter = CSVAdapter(args.csv) if args.csv else SyntheticAdapter(tickers, seed=args.seed)
    engine = MastermindEngine(cfg, adapter=adapter)

    print("=" * 78)
    print("MASTERMIND ENGINE — walk-forward backtest")
    print(f"profile={cfg.get('profile')}  universe={len(tickers)} names  "
          f"data={'CSV' if args.csv else 'synthetic'}")
    print("=" * 78)

    if args.optimise:
        best_cfg, reports, results = engine.optimise(max_rounds=3)
        for i, (rep, res) in enumerate(zip(reports, results)):
            print(f"\n----- round {i} -----")
            print(res.metrics.summary())
            print(f"verdict: {rep.verdict}")
            if rep.proposed_deltas:
                print("proposed:", rep.proposed_deltas)
        print("\n=== FINAL (best) ===")
        result = results[-1]
        report = reports[-1]
    else:
        result = engine.backtest()
        report = engine.review(result)

    print("\n" + result.metrics.summary())
    print(f"folds trained: {len(result.fold_metrics)}")
    print("\n" + report.to_markdown())

    # Show the EVOLVING niche + factor mix across the backtest (learning over time).
    folds = [f for f in result.fold_metrics if f.get("niche")]
    if folds:
        print("\n=== NICHE / FACTOR EVOLUTION ===")
        picks = folds if len(folds) <= 4 else [folds[0], folds[len(folds) // 2], folds[-1]]
        for f in picks:
            print(f"  {f['date']}: niche={f['niche']}")
            if f.get("top_factors"):
                print(f"            top factors: {f['top_factors']}")

    if result.trade_frame is not None and len(result.trade_frame) > 0:
        tf = result.trade_frame
        print(f"\nsample trades (of {len(tf)}):")
        print(tf[["ticker", "entry_date", "exit_date", "ret", "reason",
                  "conviction"]].head(8).to_string(index=False))


if __name__ == "__main__":
    main()

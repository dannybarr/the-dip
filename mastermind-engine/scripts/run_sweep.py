#!/usr/bin/env python3
"""Capital-utilisation sweep: find the deployment level that maximises return within
a drawdown budget. Trains per-fold models ONCE (shared cache) and replays the cheap
portfolio simulation across the whole grid.

Usage:
    python scripts/run_sweep.py                       # default grid, -20% DD budget
    python scripts/run_sweep.py --max-dd 0.15         # tighter drawdown budget
    python scripts/run_sweep.py --objective sharpe    # optimise Sharpe instead
    python scripts/run_sweep.py --apply config/tuned.yaml   # write the winning config
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from mastermind import load_config, MastermindEngine   # noqa: E402
from mastermind.data import SyntheticAdapter, CSVAdapter  # noqa: E402
from mastermind.optimize import CapitalUtilizationSweep   # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=None)
    ap.add_argument("--csv", default=None)
    ap.add_argument("--max-dd", type=float, default=0.20,
                    help="max acceptable drawdown as a positive fraction (0.20 = -20%%)")
    ap.add_argument("--objective", default="cagr",
                    choices=["cagr", "total_return", "sharpe"])
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--apply", default=None, help="write winning config to this path")
    args = ap.parse_args()

    cfg = load_config(args.config)
    tickers = cfg.get("universe.tickers", [])
    adapter = CSVAdapter(args.csv) if args.csv else SyntheticAdapter(tickers, seed=args.seed)
    universe = adapter.load_universe(tickers)

    print("=" * 78)
    print(f"CAPITAL-UTILISATION SWEEP — maximise {args.objective} "
          f"s.t. max drawdown ≥ -{args.max_dd:.0%}")
    print(f"data={'CSV' if args.csv else 'synthetic'}  universe={len(tickers)} names")
    print("=" * 78)

    # Baseline (current config) for reference.
    base = MastermindEngine(cfg, adapter=adapter).backtest(universe)
    print(f"\nbaseline: {base.metrics.summary()}\n")

    sweep = CapitalUtilizationSweep(cfg, drawdown_tolerance=args.max_dd,
                                    objective=args.objective)
    result = sweep.run(universe, adapter=adapter, verbose=True)
    result.base_row = {
        "cagr": base.metrics.cagr, "sharpe": base.metrics.sharpe,
        "max_drawdown": base.metrics.max_drawdown,
    }

    print("\n" + result.to_markdown())

    if args.apply and result.deltas:
        _write_config(cfg, result.deltas, args.apply)
        print(f"\nWrote winning config -> {args.apply}")


def _write_config(cfg, deltas, path):
    import yaml
    tuned = cfg.with_overrides(deltas)
    with open(path, "w", encoding="utf-8") as fh:
        yaml.safe_dump(tuned.data, fh, sort_keys=False)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Fast-clock scan: emit today's ranked, risk-sized, principle-gated signals.

Usage:
    python scripts/generate_signals.py
    python scripts/generate_signals.py --csv data_dir --config config/default.yaml
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
    ap.add_argument("--csv", default=None)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    cfg = load_config(args.config)
    tickers = cfg.get("universe.tickers", [])
    adapter = CSVAdapter(args.csv) if args.csv else SyntheticAdapter(tickers, seed=args.seed)
    engine = MastermindEngine(cfg, adapter=adapter)

    scan = engine.scan()
    print("=" * 78)
    print(f"MASTERMIND SIGNALS — as of {str(scan.as_of)[:10]}  (profile "
          f"{cfg.get('profile')})")
    print("=" * 78)

    if scan.niche:
        print("\nSPECIALISED NICHE (most exploitable names for this strategy, ranked):")
        for p in scan.niche:
            print(f"   {p['ticker']:6s} score={p['score']:.3f}  "
                  f"recovery_win={p['recovery_winrate']:.0%}  "
                  f"events={p['n_events']}  quality={p['quality']:.2f}")

    if not scan.signals:
        print("\nNo signals clear the conviction + principle gates today. "
              "Cash is a position.")
    for c in scan.sized:
        s = next((x for x in scan.signals if x.ticker == c["ticker"]), None)
        if s is None:
            continue
        weight = c["shares"] * s.entry / cfg.get("backtest.initial_equity", 100000)
        print(f"\n▶ {s.ticker}   conviction={s.conviction:.2f}  edge(P win)={s.edge:.0%}")
        print(f"   entry~{s.entry:.2f}  stop {s.stop:.2f}  target {s.target:.2f}  "
              f"(R:R {(s.target-s.entry)/(s.entry-s.stop):.1f})")
        print(f"   size: {c['shares']:.0f} sh  (~{weight:.0%} of book, "
              f"risk ${c['risk_dollars']:.0f})")
        for r in s.reasons:
            print(f"     • {r}")

    print(f"\n({len(scan.rejected)} names screened out by the gates — "
          "run with -v in code to inspect reasons.)")


if __name__ == "__main__":
    main()

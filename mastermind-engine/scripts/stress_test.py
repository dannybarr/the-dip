#!/usr/bin/env python3
"""Stress test: try to BREAK the engine before trusting it.

Each test targets one way a backtest lies:

  causality   Does anything use future information? (feature/label/niche truncation
              invariance + an end-to-end test: a backtest on truncated data must
              reproduce the same trades as the full run.)
  costs       Does the edge survive 2x/3x/5x transaction costs?
  exits       How much do gap-aware (realistic) stop fills change the result?
  null        Is the engine better than RANDOM entries with identical mechanics?
              (Monte-Carlo permutation test, two nulls.)
  bootstrap   Confidence intervals on expectancy and Sharpe; how much can N trades prove?
  stability   Sub-period (by year / by half) consistency.
  benchmark   Versus equal-weight buy&hold; beta / alpha decomposition.
  nested      Does a parameter sweep tuned on half the history work on the other half?
  universes   Does it hold on random universes it was never tuned on?

Usage:
    python scripts/stress_test.py --csv data_cache/sp500 --config config/real_sp500.yaml \
        --master /path/all_stocks_5yr.csv --out reports/stress
    python scripts/stress_test.py ... --only causality,null     # subset
    python scripts/stress_test.py ... --quick                   # tiny smoke run
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from mastermind import load_config                                  # noqa: E402
from mastermind.backtest import WalkForwardBacktester               # noqa: E402
from mastermind.data import CSVAdapter                              # noqa: E402
from mastermind.features import FeaturePipeline                     # noqa: E402
from mastermind.labeling import triple_barrier_labels               # noqa: E402
from mastermind.universe import NicheSelector                       # noqa: E402

RESULTS: dict = {}
T0 = time.time()


def log(msg=""):
    print(f"[{time.time() - T0:6.0f}s] {msg}", flush=True)


# --------------------------------------------------------------------------- utils
def ann_sharpe(r: pd.Series) -> float:
    r = r.dropna()
    sd = r.std()
    return float(r.mean() / sd * np.sqrt(252)) if len(r) > 2 and sd > 0 else 0.0


def max_dd(eq: pd.Series) -> float:
    return float((eq / eq.cummax() - 1).min()) if len(eq) else 0.0


def run_bt(cfg, universe, adapter, cache):
    return WalkForwardBacktester(cfg).run(universe, adapter=adapter, fold_cache=cache)


def oos_curve(res):
    """Equity curve restricted to the out-of-sample period (after the first model)."""
    start = pd.Timestamp(res.fold_metrics[0]["date"]) if res.fold_metrics else None
    eq = res.equity_curve
    return eq[eq.index >= start] if start is not None else eq


def summarize(res) -> dict:
    m = res.metrics
    return dict(trades=m.n_trades, win=round(m.win_rate, 3), pf=round(m.profit_factor, 2),
                exp=round(m.expectancy * 100, 3), cagr=round(m.cagr * 100, 2),
                sharpe=round(m.sharpe, 2), maxdd=round(m.max_drawdown * 100, 2))


def fmt(d: dict) -> str:
    return (f"trades={d['trades']:>3} win={d['win']:.1%} PF={d['pf']:.2f} "
            f"exp={d['exp']:+.2f}%/trade CAGR={d['cagr']:+.2f}% "
            f"Sharpe={d['sharpe']:+.2f} maxDD={d['maxdd']:.1f}%")


# ---------------------------------------------------------------- 0. causality audit
def test_causality(cfg, universe, adapter, quick, r_full=None):
    out = {}
    pipe = FeaturePipeline(cfg)
    names = list(universe)[:3 if quick else 5]
    pt, sl = cfg.get("labeling.profit_take_atr"), cfg.get("labeling.stop_loss_atr")
    V, mb = cfg.get("labeling.vertical_days"), cfg.get("labeling.max_barrier_pct")
    mh = cfg.get("horizon.min_hold_days", 1)

    def labels_for(df, f):
        return triple_barrier_labels(df, f["atr"], pt, sl, V, mh, max_barrier_pct=mb)

    # (a) every feature column must be unchanged when the future is removed
    bad_feats, n_cmp = set(), 0
    for t in names:
        df = universe[t]
        full = pipe.build(df)
        for cut in (500, 800, 1100):
            tr = pipe.build(df.iloc[:cut])
            for c in full.columns:
                x, y = full[c].values[260:cut], tr[c].values[260:cut]
                m = np.isfinite(x) & np.isfinite(y)
                n_cmp += int(m.sum())
                if m.any() and not np.allclose(x[m], y[m], rtol=1e-7, atol=1e-9):
                    bad_feats.add(c)
                if (np.isfinite(x) != np.isfinite(y)).any():
                    bad_feats.add(c + " (nan-pattern)")
    out["features_leaking"] = sorted(bad_feats)
    out["feature_cells_compared"] = n_cmp

    # (b) labels: a row resolved in the truncated data must match the full data, and a
    #     row the full data resolved before the cut must be resolved in the truncated.
    lab_bad = 0
    for t in names:
        df = universe[t]
        ff = pipe.build(df)
        lf = labels_for(df, ff)
        for cut in (600, 900, 1200):
            d2 = df.iloc[:cut]
            lt = labels_for(d2, pipe.build(d2))
            a, b = lf.label.iloc[:cut], lt.label
            tf, tt = lf.touch_idx.iloc[:cut], lt.touch_idx
            both = b.notna()
            lab_bad += int((a[both] != b[both]).sum())
            must = tf.notna() & (tf <= cut - 1)
            lab_bad += int((must & b.isna()).sum())
    out["label_mismatches"] = lab_bad

    # (c) niche selection at date t must not depend on data after t
    sel = NicheSelector(cfg)
    niche_bad = 0
    for cut in (700, 900, 1100):
        ff, ll, ft, lt_ = {}, {}, {}, {}
        for t in names:
            df = universe[t]
            ff[t] = pipe.build(df)
            ll[t] = labels_for(df, ff[t])
            d2 = df.iloc[:cut]
            ft[t] = pipe.build(d2)
            lt_[t] = labels_for(d2, ft[t])
        as_of = universe[names[0]].index[cut - 1]
        a = {p.ticker: round(p.score, 10) for p in sel.select(ff, ll, as_of=as_of, k=len(names))}
        b = {p.ticker: round(p.score, 10) for p in sel.select(ft, lt_, as_of=as_of, k=len(names))}
        niche_bad += int(a != b)
    out["niche_mismatches"] = niche_bad
    log(f"causality (a-c): leaking_features={out['features_leaking']} "
        f"label_mismatches={lab_bad} niche_mismatches={niche_bad}")

    # (d) END-TO-END: a backtest on data truncated at T must reproduce, trade for trade,
    #     everything the full-data run did before T.
    if not quick:
        keep = len(next(iter(universe.values()))) - 220
        trunc = {t: df.iloc[:keep] for t, df in universe.items()}
        cut_date = next(iter(trunc.values())).index[-1]
        r_full = r_full if r_full is not None else run_bt(cfg, universe, adapter, {})
        r_tr = run_bt(cfg, trunc, adapter, {})
        horizon = cut_date - pd.Timedelta(days=30)
        key = lambda r: {(x.ticker, x.entry_date, x.exit_date, round(x.ret, 8))
                         for x in r.trades if x.exit_date <= horizon}
        kf, kt = key(r_full), key(r_tr)
        out["e2e_trades_full"] = len(kf)
        out["e2e_trades_truncated"] = len(kt)
        out["e2e_only_in_full"] = len(kf - kt)
        out["e2e_only_in_truncated"] = len(kt - kf)
        log(f"causality (d) end-to-end: {len(kf)} trades before {horizon.date()}; "
            f"mismatches: only-in-full={len(kf - kt)} only-in-truncated={len(kt - kf)}")
    RESULTS["causality"] = out
    return out


# ------------------------------------------------------------------ costs / exits
def test_costs(cfg, universe, adapter, cache):
    rows = {}
    for mult in (1, 2, 3, 5):
        c = cfg.with_overrides({
            "backtest.commission_bps": cfg.get("backtest.commission_bps", 2.0) * mult,
            "backtest.slippage_bps": cfg.get("backtest.slippage_bps", 5.0) * mult})
        r = summarize(run_bt(c, universe, adapter, cache))
        rows[f"{mult}x"] = r
        log(f"costs x{mult} ({c.get('backtest.commission_bps'):.0f}+"
            f"{c.get('backtest.slippage_bps'):.0f}bps/side): {fmt(r)}")
    RESULTS["costs"] = rows


def test_exits(cfg, universe, adapter, cache):
    rows = {}
    for flag in (False, True):
        c = cfg.with_overrides({"backtest.gap_aware_exits": flag})
        rows["gap_aware" if flag else "naive_stop_fill"] = summarize(
            run_bt(c, universe, adapter, cache))
        log(f"exits gap_aware={flag}: {fmt(rows['gap_aware' if flag else 'naive_stop_fill'])}")
    RESULTS["exits"] = rows


# ----------------------------------------------------------------------- null test
class TradeSim:
    """Re-implements the engine's trade mechanics for arbitrary (ticker, signal-bar)."""

    def __init__(self, cfg, universe, feats):
        self.pt = cfg.get("labeling.profit_take_atr")
        self.sl = cfg.get("labeling.stop_loss_atr")
        self.mb = cfg.get("labeling.max_barrier_pct")
        self.V = cfg.get("labeling.vertical_days")
        self.slip = cfg.get("backtest.slippage_bps", 5.0) / 1e4
        self.comm = cfg.get("backtest.commission_bps", 2.0) / 1e4
        self.gap = cfg.get("backtest.gap_aware_exits", True)
        self.A = {}
        for t, df in universe.items():
            self.A[t] = dict(idx=df.index, o=df["open"].values, h=df["high"].values,
                             l=df["low"].values, c=df["close"].values,
                             atr=feats[t]["atr"].reindex(df.index).values)

    def trade(self, t, i):
        a = self.A[t]
        n = len(a["c"])
        if i + 1 >= n:
            return None
        atr, close = a["atr"][i], a["c"][i]
        if not np.isfinite(atr) or atr <= 0:
            return None
        pd_, sd_ = self.pt * atr, self.sl * atr
        if self.mb is not None:
            pd_, sd_ = min(pd_, self.mb * close), min(sd_, self.mb * close)
        stop, tgt = close - sd_, close + pd_
        j0 = i + 1
        fill = a["o"][j0] * (1 + self.slip)
        max_exit = a["idx"][j0] + pd.Timedelta(days=int(self.V * 1.6))
        ex = None
        for j in range(j0, n):
            if a["l"][j] <= stop:
                ex = min(stop, a["o"][j]) if self.gap else stop
                break
            if a["h"][j] >= tgt:
                ex = max(tgt, a["o"][j]) if self.gap else tgt
                break
            if a["idx"][j] >= max_exit:
                ex = a["c"][j]
                break
        if ex is None:
            return None
        return ex * (1 - self.comm - self.slip) / (fill * (1 + self.comm)) - 1.0


def test_null(cfg, universe, adapter, res, n_sims, tag="null"):
    bt = WalkForwardBacktester(cfg)
    feats, _ = bt._prepare(universe, adapter)
    sim = TradeSim(cfg, universe, feats)
    names = list(universe)
    idx = universe[names[0]].index
    start = pd.Timestamp(res.fold_metrics[0]["date"])
    lo = int(idx.searchsorted(start))
    hi = len(idx) - 25
    n_tr = len(res.trades)
    eng = np.array([t.ret for t in res.trades])
    eng_mean = float(eng.mean()) if len(eng) else 0.0

    # fidelity check: does the harness reproduce the engine's own trades?
    ok = tot = 0
    for t in res.trades[:60]:
        i = idx.searchsorted(t.entry_date) - 1
        r = sim.trade(t.ticker, int(i))
        tot += 1
        ok += int(r is not None and abs(r - t.ret) < 5e-4)

    rng = np.random.default_rng(12345)
    sig_dates = [int(idx.searchsorted(t.entry_date) - 1) for t in res.trades]
    null_a, null_b = [], []
    for _ in range(n_sims):
        a, b = [], []
        while len(a) < n_tr:
            r = sim.trade(names[rng.integers(len(names))], int(rng.integers(lo, hi)))
            if r is not None:
                a.append(r)
        for d in sig_dates:   # same dates as the engine, random tickers
            for _try in range(5):
                r = sim.trade(names[rng.integers(len(names))], d)
                if r is not None:
                    b.append(r)
                    break
        null_a.append(np.mean(a))
        null_b.append(np.mean(b))
    na, nb = np.array(null_a), np.array(null_b)
    out = dict(
        engine_mean_pct=round(eng_mean * 100, 3), n_trades=n_tr, harness_fidelity=f"{ok}/{tot}",
        null_random_dates_mean_pct=round(na.mean() * 100, 3),
        null_random_dates_p95_pct=round(np.percentile(na, 95) * 100, 3),
        p_value_random_dates=round(float((na >= eng_mean).mean()), 4),
        null_same_dates_mean_pct=round(nb.mean() * 100, 3),
        null_same_dates_p95_pct=round(np.percentile(nb, 95) * 100, 3),
        p_value_same_dates=round(float((nb >= eng_mean).mean()), 4))
    RESULTS[tag] = out
    log(f"{tag}: engine={out['engine_mean_pct']:+.3f}%/trade over {n_tr} trades | "
        f"random-entry null mean={out['null_random_dates_mean_pct']:+.3f}% "
        f"(p95 {out['null_random_dates_p95_pct']:+.3f}%) p={out['p_value_random_dates']} | "
        f"same-dates null mean={out['null_same_dates_mean_pct']:+.3f}% p={out['p_value_same_dates']} | "
        f"harness fidelity {ok}/{tot}")
    return out


# ------------------------------------------------------------ bootstrap / stability
def test_bootstrap(res, n_boot):
    rets = np.array([t.ret for t in res.trades])
    rng = np.random.default_rng(7)
    boots = rng.choice(rets, size=(n_boot, len(rets)), replace=True).mean(axis=1)
    lo, hi = np.percentile(boots, [2.5, 97.5])
    d = oos_curve(res).pct_change().dropna().values
    blk, sh = 10, []
    for _ in range(min(n_boot, 3000)):
        nb = int(np.ceil(len(d) / blk))
        st = rng.integers(0, max(len(d) - blk, 1), nb)
        s = np.concatenate([d[i:i + blk] for i in st])[:len(d)]
        sh.append(s.mean() / s.std() * np.sqrt(252) if s.std() > 0 else 0)
    sh = np.array(sh)
    sd = rets.std(ddof=1)
    need = int(np.ceil((1.96 * sd / max(abs(rets.mean()), 1e-9)) ** 2)) if len(rets) > 2 else None
    out = dict(n_trades=len(rets), mean_pct=round(float(rets.mean()) * 100, 3),
               ci95_pct=[round(float(lo) * 100, 3), round(float(hi) * 100, 3)],
               p_mean_positive=round(float((boots > 0).mean()), 4),
               sharpe_ci95=[round(float(np.percentile(sh, 2.5)), 2),
                            round(float(np.percentile(sh, 97.5)), 2)],
               p_sharpe_positive=round(float((sh > 0).mean()), 4),
               trades_needed_for_95pct_significance=need)
    RESULTS["bootstrap"] = out
    log(f"bootstrap: expectancy {out['mean_pct']:+.3f}% 95%CI {out['ci95_pct']} "
        f"P(>0)={out['p_mean_positive']} | Sharpe 95%CI {out['sharpe_ci95']} "
        f"P(>0)={out['p_sharpe_positive']} | ~{need} trades needed for 95% significance")


def test_stability(res):
    tf = res.trade_frame
    out = {}
    if tf is not None and len(tf):
        tf = tf.copy()
        tf["year"] = pd.to_datetime(tf["exit_date"]).dt.year
        out["by_year"] = {int(y): dict(n=int(len(g)), exp_pct=round(float(g["ret"].mean()) * 100, 3),
                                       win=round(float((g["ret"] > 0).mean()), 3))
                          for y, g in tf.groupby("year")}
    d = oos_curve(res).pct_change().dropna()
    h = len(d) // 2
    out["sharpe_first_half"] = round(ann_sharpe(d.iloc[:h]), 2)
    out["sharpe_second_half"] = round(ann_sharpe(d.iloc[h:]), 2)
    RESULTS["stability"] = out
    log(f"stability: by year={out.get('by_year')} | Sharpe halves "
        f"{out['sharpe_first_half']} / {out['sharpe_second_half']}")


def test_benchmark(res, universe):
    eq = oos_curve(res)
    close = pd.DataFrame({t: df["close"] for t, df in universe.items()}).reindex(eq.index)
    mkt = close.pct_change().mean(axis=1).dropna()           # equal-weight buy & hold
    s = eq.pct_change().dropna().reindex(mkt.index).dropna()
    mkt = mkt.reindex(s.index)
    beta = float(np.cov(s, mkt)[0, 1] / mkt.var()) if mkt.var() > 0 else 0.0
    alpha = float((s.mean() - beta * mkt.mean()) * 252)
    mkt_eq = (1 + mkt).cumprod()
    yrs = max(len(mkt) / 252, 1e-9)
    out = dict(period=f"{eq.index[0].date()} to {eq.index[-1].date()}",
               strategy_cagr_pct=round(((eq.iloc[-1] / eq.iloc[0]) ** (1 / yrs) - 1) * 100, 2),
               strategy_sharpe=round(ann_sharpe(s), 2), strategy_maxdd_pct=round(max_dd(eq) * 100, 2),
               ew_buyhold_cagr_pct=round((mkt_eq.iloc[-1] ** (1 / yrs) - 1) * 100, 2),
               ew_buyhold_sharpe=round(ann_sharpe(mkt), 2),
               ew_buyhold_maxdd_pct=round(max_dd(mkt_eq) * 100, 2),
               beta=round(beta, 3), alpha_annual_pct=round(alpha * 100, 2),
               correlation=round(float(np.corrcoef(s, mkt)[0, 1]), 3))
    RESULTS["benchmark"] = out
    log(f"benchmark: strategy CAGR {out['strategy_cagr_pct']}% Sharpe {out['strategy_sharpe']} "
        f"maxDD {out['strategy_maxdd_pct']}% | EW buy&hold CAGR {out['ew_buyhold_cagr_pct']}% "
        f"Sharpe {out['ew_buyhold_sharpe']} maxDD {out['ew_buyhold_maxdd_pct']}% | "
        f"beta {out['beta']} alpha {out['alpha_annual_pct']}%/yr corr {out['correlation']}")


# ---------------------------------------------------------------- nested selection
def test_nested(cfg, universe, adapter, cache, quick):
    grid = [(n, c) for n in ((4, 6) if quick else (3, 4, 6, 9))
            for c in ((5, 10) if quick else (3, 5, 10, 20))]
    pts = []
    for n, c in grid:
        cc = cfg.with_overrides({"universe.niche_size": n, "strategy.cooldown_days": c})
        r = run_bt(cc, universe, adapter, cache)
        eq = oos_curve(r)
        d = eq.pct_change().dropna()
        pts.append(dict(niche=n, cooldown=c, d=d, trades=r.trades, eq=eq))
        log(f"  nested grid niche={n} cd={c}: Sharpe={ann_sharpe(d):+.2f}")
    mid = pts[0]["d"].index[len(pts[0]["d"]) // 2]

    def half(p, which):
        d = p["d"]
        d = d[d.index < mid] if which == "A" else d[d.index >= mid]
        n_tr = sum(1 for t in p["trades"]
                   if (t.exit_date < mid if which == "A" else t.exit_date >= mid))
        return ann_sharpe(d), n_tr

    out = {"split_date": str(mid.date())}
    for sel, test in (("A", "B"), ("B", "A")):
        s_sel = [(half(p, sel), p) for p in pts]
        s_sel = [x for x in s_sel if x[0][1] >= 8] or s_sel
        best = max(s_sel, key=lambda x: x[0][0])
        held = [half(p, test)[0] for p in pts]
        pick_held = half(best[1], test)[0]
        rho = float(pd.Series([x[0][0] for x in s_sel]).corr(
            pd.Series([half(x[1], test)[0] for x in s_sel]), method="spearman"))
        out[f"select_on_{sel}_test_on_{test}"] = dict(
            chosen=f"niche={best[1]['niche']}, cooldown={best[1]['cooldown']}",
            in_sample_sharpe=round(best[0][0], 2), out_of_sample_sharpe=round(pick_held, 2),
            grid_median_oos_sharpe=round(float(np.median(held)), 2),
            grid_best_oos_sharpe_oracle=round(float(max(held)), 2),
            frac_grid_positive_oos=round(float(np.mean(np.array(held) > 0)), 2),
            rank_corr_is_vs_oos=round(rho, 2))
        log(f"nested {sel}->{test}: chose {out[f'select_on_{sel}_test_on_{test}']['chosen']} "
            f"IS Sharpe {best[0][0]:+.2f} -> OOS {pick_held:+.2f} | grid median OOS "
            f"{np.median(held):+.2f}, oracle {max(held):+.2f}, rank-corr {rho:+.2f}")
    RESULTS["nested"] = out


# ------------------------------------------------------------------- universes
def test_universes(cfg, master, curated, n_univ, size, n_sims, quick):
    df = pd.read_csv(master)
    df.columns = [c.strip().lower() for c in df.columns]
    nm = "name" if "name" in df.columns else df.columns[-1]
    counts = df.groupby(nm).size()
    pool = sorted(set(counts[counts >= counts.max() - 5].index) - set(curated))
    out = {}
    for seed in range(1, n_univ + 1):
        rng = np.random.default_rng(seed)
        picks = sorted(rng.choice(pool, size=size, replace=False).tolist())
        d = f"data_cache/rand_{seed}"
        os.makedirs(d, exist_ok=True)
        for t in picks:
            s = df[df[nm] == t][["date", "open", "high", "low", "close", "volume"]]
            s.sort_values("date").to_csv(os.path.join(d, f"{t}.csv"), index=False)
        ad = CSVAdapter(d)
        uni = ad.load_universe(picks)
        base = cfg.with_overrides({"universe.tickers": picks})
        cache = {}
        row = {"tickers": picks}
        for label, ov in (("niche6_cd10", {}),
                          ("niche4_cd5", {"universe.niche_size": 4, "strategy.cooldown_days": 5})):
            c = base.with_overrides(ov)
            r = run_bt(c, uni, ad, cache)
            row[label] = summarize(r)
            log(f"universe#{seed} {label}: {fmt(row[label])}")
            if label == "niche6_cd10" and r.trades:
                row["null"] = test_null(c, uni, ad, r, n_sims, tag=f"null_universe{seed}")
        out[f"random_{seed}"] = row
    RESULTS["universes"] = out


# ----------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="data_cache/sp500")
    ap.add_argument("--config", default="config/real_sp500.yaml")
    ap.add_argument("--master", default="data_cache/all_stocks_5yr.csv")
    ap.add_argument("--out", default="reports/stress")
    ap.add_argument("--only", default=None)
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--sims", type=int, default=1000)
    args = ap.parse_args()
    q = args.quick
    only = set(args.only.split(",")) if args.only else None
    want = lambda k: only is None or k in only

    cfg = load_config(args.config)
    tickers = cfg.get("universe.tickers")
    if q:
        tickers = tickers[:8]
        cfg = cfg.with_overrides({"universe.tickers": tickers})
    adapter = CSVAdapter(args.csv)
    universe = adapter.load_universe(tickers)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    sims = 100 if q else args.sims

    def guarded(name, fn, *a, **k):
        if not want(name):
            return
        try:
            log(f"--- {name} ---")
            fn(*a, **k)
        except Exception:
            RESULTS[name] = {"error": traceback.format_exc()[-600:]}
            log(f"{name} FAILED:\n{traceback.format_exc()}")
        with open(args.out + ".json", "w") as fh:
            json.dump(RESULTS, fh, indent=2, default=str)

    cache: dict = {}
    base = {}

    def baseline():
        r = run_bt(cfg, universe, adapter, cache)
        base["res"] = r
        RESULTS["baseline"] = summarize(r)
        log(f"baseline ({cfg.get('universe.niche_size')}/{cfg.get('strategy.cooldown_days')}): "
            f"{fmt(RESULTS['baseline'])}")
    guarded("baseline", baseline)
    res = base.get("res")
    guarded("causality", test_causality, cfg, universe, adapter, q, res)
    if res is not None:
        guarded("costs", test_costs, cfg, universe, adapter, cache)
        guarded("exits", test_exits, cfg, universe, adapter, cache)
        guarded("null", test_null, cfg, universe, adapter, res, sims)
        guarded("bootstrap", test_bootstrap, res, 2000 if q else 10000)
        guarded("stability", test_stability, res)
        guarded("benchmark", test_benchmark, res, universe)
        guarded("nested", test_nested, cfg, universe, adapter, cache, q)
    guarded("universes", test_universes, cfg, args.master, tickers,
            1 if q else 2, 8 if q else 25, 100 if q else max(sims // 2, 200), q)
    log("done")


if __name__ == "__main__":
    main()

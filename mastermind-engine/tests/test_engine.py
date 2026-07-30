"""End-to-end and invariant tests for the Mastermind Engine.

Run: python -m pytest -q   (from mastermind-engine/)
"""
import os
import sys

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from mastermind import load_config, MastermindEngine
from mastermind.data import SyntheticAdapter
from mastermind.features import FeaturePipeline
from mastermind.labeling import triple_barrier_labels
from mastermind.models import EdgeModel


@pytest.fixture(scope="module")
def cfg():
    c = load_config()
    # smaller universe / shorter series keeps tests fast but exercises everything
    c.data["universe"]["tickers"] = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"]
    return c


@pytest.fixture(scope="module")
def adapter(cfg):
    return SyntheticAdapter(cfg.get("universe.tickers"), n_days=900, seed=11)


def test_synthetic_data_schema(adapter, cfg):
    uni = adapter.load_universe(cfg.get("universe.tickers"))
    assert len(uni) == len(cfg.get("universe.tickers"))
    for t, df in uni.items():
        for col in ["open", "high", "low", "close", "volume"]:
            assert col in df.columns
        # OHLC sanity: high >= low, high>=close>=... within the bar
        assert (df["high"] >= df["low"]).all()
        assert (df["high"] >= df["close"]).all()
        assert (df["low"] <= df["close"]).all()
        assert df.index.is_monotonic_increasing


def test_features_no_lookahead(adapter, cfg):
    """A feature at row t must not change when FUTURE rows are removed."""
    pipe = FeaturePipeline(cfg)
    df = adapter.history("AAA")
    fund = adapter.fundamentals("AAA")
    full = pipe.build(df, fund)
    cut = 600
    truncated = pipe.build(df.iloc[:cut], fund)
    # Compare a stable technical feature on the overlap (allow warmup NaNs).
    col = "ret_20"
    a = full[col].iloc[100:cut - 1]
    b = truncated[col].iloc[100:cut - 1]
    both = pd.concat([a, b], axis=1).dropna()
    assert np.allclose(both.iloc[:, 0], both.iloc[:, 1], atol=1e-9), \
        "feature leaked future information"


def test_triple_barrier_labels(adapter, cfg):
    pipe = FeaturePipeline(cfg)
    df = adapter.history("BBB")
    feats = pipe.build(df, adapter.fundamentals("BBB"))
    res = triple_barrier_labels(df, feats["atr"], pt_atr=2.0, sl_atr=1.0,
                                vertical_days=15, min_hold_days=3)
    valid = res.label.dropna()
    assert len(valid) > 100
    assert set(valid.unique()).issubset({-1.0, 0.0, 1.0})
    # touch index must always be strictly after entry index and within horizon
    for i, tp in res.touch_idx.dropna().items():
        pos = df.index.get_loc(i)
        assert tp > pos
        assert tp - pos <= 15


def test_model_trains_and_calibrates(adapter, cfg):
    pipe = FeaturePipeline(cfg)
    df = adapter.history("CCC")
    feats = pipe.build(df, adapter.fundamentals("CCC"))
    res = triple_barrier_labels(df, feats["atr"], 2.0, 1.0, 15, 3)
    cols = pipe.feature_columns(feats)
    mask = res.label.notna()
    X, y = feats.loc[mask, cols], res.label[mask]
    model = EdgeModel(cfg).fit(X, y)
    p = model.predict_proba(X)
    assert len(p) == len(X)
    assert np.all((p >= 0) & (p <= 1)), "probabilities out of [0,1]"


def test_backtest_runs_and_is_consistent(adapter, cfg):
    engine = MastermindEngine(cfg, adapter=adapter)
    result = engine.backtest()
    eq = result.equity_curve
    assert len(eq) > 200
    assert eq.iloc[0] == pytest.approx(cfg.get("backtest.initial_equity"), rel=0.05)
    assert (eq > 0).all(), "equity went non-positive (ruin) — risk sizing failed"
    # metrics must be finite
    m = result.metrics
    for v in [m.sharpe, m.max_drawdown, m.expectancy, m.cagr]:
        assert np.isfinite(v)


def test_self_review_produces_verdict(adapter, cfg):
    engine = MastermindEngine(cfg, adapter=adapter)
    result = engine.backtest()
    report = engine.review(result)
    assert report.verdict in {
        "HEALTHY", "MARGINAL", "NO_EDGE", "DECAYING", "EDGE_BUT_RISKY",
        "INSUFFICIENT_EVIDENCE",
    }
    assert isinstance(report.to_markdown(), str)
    assert len(report.findings) >= 1


def test_scan_emits_gated_signals(adapter, cfg):
    engine = MastermindEngine(cfg, adapter=adapter)
    scan = engine.scan()
    # accepted signals must respect the portfolio cap and be principle-clean
    assert len(scan.sized) <= cfg.get("risk.max_positions")
    for s in scan.signals:
        assert not s.rejected
        assert s.target > s.entry > s.stop, "R:R geometry inverted"
        assert 0 <= s.conviction <= 1


def test_config_overrides_are_immutable(cfg):
    base = cfg.get("strategy.min_edge")
    new = cfg.with_overrides({"strategy.min_edge": 0.99})
    assert new.get("strategy.min_edge") == 0.99
    assert cfg.get("strategy.min_edge") == base, "override mutated the original config"

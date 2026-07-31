"""Edge model — calibrated P(favorable, risk-defined swing) — RESEARCH.md §5.

Primary learner: gradient-boosted trees. Uses sklearn's HistGradientBoostingClassifier
by default (no fragile native deps) and transparently upgrades to LightGBM if the
config asks for it and the package is present.

Predicts P(profit-take barrier hit) from the triple-barrier labels. Probabilities are
CALIBRATED (isotonic) so that "0.70" really means 70% — a hard requirement because
Kelly-style position sizing consumes the probability directly.

`meta_label=True` adds the López de Prado meta-labeling idea: the classifier acts as
the "should I take this primary signal, and how confident am I" filter, lifting
precision (fewer, better trades — the JPM discipline).
"""
from __future__ import annotations

from typing import List, Optional

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier


class EdgeModel:
    def __init__(self, cfg):
        self.cfg = cfg
        self.features: List[str] = []
        self._pipe = None
        self._fallback_rate: float = 0.0
        self._fitted = False

    # ---- construction -----------------------------------------------------
    def _make_estimator(self):
        p = self.cfg.section("model").get("params", {})
        mtype = self.cfg.get("model.type", "hist_gbm")
        if mtype == "lightgbm":
            try:
                from lightgbm import LGBMClassifier  # type: ignore
                return LGBMClassifier(
                    n_estimators=p.get("max_iter", 300),
                    learning_rate=p.get("learning_rate", 0.05),
                    max_depth=p.get("max_depth", 4),
                    reg_lambda=p.get("l2_regularization", 1.0),
                    min_child_samples=p.get("min_samples_leaf", 40),
                    verbose=-1,
                )
            except Exception:
                pass  # fall through to the always-available sklearn learner
        return HistGradientBoostingClassifier(
            max_depth=p.get("max_depth", 4),
            learning_rate=p.get("learning_rate", 0.05),
            max_iter=p.get("max_iter", 300),
            l2_regularization=p.get("l2_regularization", 1.0),
            min_samples_leaf=p.get("min_samples_leaf", 40),
            early_stopping=True,
            validation_fraction=0.15,
            random_state=0,
        )

    # ---- fit / predict ----------------------------------------------------
    def fit(self, X: pd.DataFrame, y_label: pd.Series, sample_weight=None) -> "EdgeModel":
        """y_label is the triple-barrier label {+1,0,-1}; we learn P(win = +1)."""
        # Drop zero-variance (constant) columns: they carry no signal and break the
        # GBM binner (sliding_window_view needs >=2 distinct values). Common on real
        # data where a feature can be flat across a fold; harmless to remove.
        nunique = X.nunique(dropna=True)
        self.features = [c for c in X.columns if nunique.get(c, 0) > 1]
        if self.features:
            X = X[self.features]
        y = (y_label.values == 1).astype(int)     # binary: profit-take hit
        self._fallback_rate = float(y.mean()) if len(y) else 0.0

        min_n = self.cfg.get("model.min_train_samples", 250)
        if not self.features or len(y) < min_n or y.sum() < 10 or (len(y) - y.sum()) < 10:
            # Not enough signal to train a real model — degrade to base rate.
            self._pipe = None
            self._fitted = True
            return self

        # HistGradientBoosting / LightGBM handle NaNs natively (trees split on
        # missingness), so we skip an imputer wrapper. Passing the bare estimator
        # lets sample_weight flow to BOTH the fit and the calibration folds.
        base = self._make_estimator()
        if self.cfg.get("model.calibrate", True):
            # Calibrate on held-out folds so probabilities are honest. Sigmoid (Platt)
            # is the fast default and fits GBM score distributions well; isotonic is
            # available for larger datasets via config.
            self._pipe = CalibratedClassifierCV(
                base,
                method=self.cfg.get("model.calibration_method", "sigmoid"),
                cv=self.cfg.get("model.calibration_cv", 2),
            )
        else:
            self._pipe = base

        fit_kw = {}
        if sample_weight is not None:
            fit_kw["sample_weight"] = np.asarray(sample_weight)
        try:
            self._pipe.fit(X.values, y, **fit_kw)
        except Exception:
            self._pipe.fit(X.values, y)
        self._fitted = True
        return self

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """Return calibrated P(win) for each row."""
        if not self._fitted:
            raise RuntimeError("EdgeModel not fitted")
        if self._pipe is None:
            return np.full(len(X), self._fallback_rate)
        Xv = X[self.features].values if set(self.features).issubset(X.columns) else X.values
        proba = self._pipe.predict_proba(Xv)
        # Column for class "1" (win).
        classes = getattr(self._pipe, "classes_", np.array([0, 1]))
        win_col = int(np.where(classes == 1)[0][0]) if 1 in classes else -1
        return proba[:, win_col]

    # ---- introspection for the self-review layer --------------------------
    def feature_importance(self) -> Optional[pd.Series]:
        if self._pipe is None:
            return None
        est = self._pipe
        # Unwrap calibration -> classifier where present.
        try:
            if isinstance(est, CalibratedClassifierCV):
                clf = est.calibrated_classifiers_[0].estimator
            else:
                clf = est
            if hasattr(clf, "feature_importances_"):
                return pd.Series(clf.feature_importances_, index=self.features
                                 ).sort_values(ascending=False)
        except Exception:
            return None
        return None

    def permutation_importance(self, X: pd.DataFrame, y_label: pd.Series,
                               n_sample: int = 600) -> Optional[pd.Series]:
        """Model-agnostic importance: drop in AUC when each feature is shuffled.

        Works for HistGradientBoosting (which has no native `feature_importances_`)
        and for the calibrated wrapper. Cheap: one scoring pass per feature on a
        capped subsample, so it can run every fold to evidence what the model is
        actually learning (and how that mix drifts over time).
        """
        if not self._fitted or self._pipe is None or len(X) == 0:
            return None
        try:
            from sklearn.metrics import roc_auc_score
            rng = np.random.default_rng(0)
            y = (y_label.values == 1).astype(int)
            if y.sum() < 5 or (len(y) - y.sum()) < 5:
                return None
            if len(X) > n_sample:
                idx = rng.choice(len(X), n_sample, replace=False)
                Xs, ys = X.iloc[idx].copy(), y[idx]
            else:
                Xs, ys = X.copy(), y
            base = roc_auc_score(ys, self.predict_proba(Xs))
            drops = {}
            for col in self.features:
                saved = Xs[col].values.copy()
                Xs[col] = rng.permutation(saved)
                drops[col] = base - roc_auc_score(ys, self.predict_proba(Xs))
                Xs[col] = saved
            return pd.Series(drops).sort_values(ascending=False)
        except Exception:
            return None

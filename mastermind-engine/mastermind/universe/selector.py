"""Niche selector — focus capital where THIS strategy's edge actually lives.

Not every stock rewards a swing-overreaction strategy. Some names habitually
over-punish salient bad news and then reclaim it (the Ferrari pattern) — those are
*exploitable* for us. Others gap on real information and keep falling — those are
traps. The selector measures, point-in-time, how exploitable each name has been and
keeps the top-K "niche". Because it is recomputed every fold on a trailing window,
the niche EVOLVES: a name that stops behaving this way drops out; a newly-resilient
name enters.

Exploitability score (all computed only from data up to `as_of`, no lookahead):

    score = catalyst_recovery_winrate            # do its shocks bounce?
          * sqrt(catalyst_frequency)             # does it give us enough shots?
          * (1 + mean_recovery_edge)             # how big is the bounce, net?
          * quality_tilt                         # resilient/quality names preferred
          / (1 + excess_vol_penalty)             # punish ungovernable volatility

This is the machine-learned-adjacent, *unbiased* selection the mandate asks for:
it is driven entirely by realised behaviour, not by our priors about a ticker.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

import numpy as np
import pandas as pd


@dataclass
class NicheScore:
    ticker: str
    score: float
    catalyst_rate: float
    recovery_winrate: float
    mean_recovery_edge: float
    quality: float
    vol: float
    n_events: int

    def as_dict(self) -> dict:
        return {
            "ticker": self.ticker, "score": round(self.score, 4),
            "catalyst_rate": round(self.catalyst_rate, 4),
            "recovery_winrate": round(self.recovery_winrate, 3),
            "mean_recovery_edge": round(self.mean_recovery_edge, 4),
            "quality": round(self.quality, 3), "n_events": self.n_events,
        }


class NicheSelector:
    def __init__(self, cfg):
        self.cfg = cfg

    def score_ticker(
        self,
        feats: pd.DataFrame,
        labels,
        as_of: Optional[pd.Timestamp] = None,
    ) -> Optional[NicheScore]:
        """Score one name's exploitability using only rows on/before `as_of`."""
        idx = feats.index
        cutoff = as_of if as_of is not None else idx[-1]
        min_hist = self.cfg.get("universe.niche_min_history", 252)
        mask = idx <= cutoff
        if mask.sum() < min_hist:
            return None

        f = feats[mask]
        cat_thr = self.cfg.get("strategy.catalyst_threshold", 0.6)
        # A "catalyst event" row: our primary trigger fired.
        trigger = (f.get("narrative_gap", pd.Series(0, index=f.index)) >= cat_thr) | \
                  (f.get("recent_shock", pd.Series(0, index=f.index)) >= cat_thr)
        n_events = int(trigger.sum())
        if n_events < 3:
            return None

        # Outcome of those events, from the triple-barrier labels. A label at row i
        # looks FORWARD up to `vertical_days` bars, so a row near the cutoff has an
        # outcome that is not knowable at `as_of`. Keep only events whose barrier was
        # touched on or before the cutoff bar (point-in-time; no peeking).
        cut_pos = int(idx.searchsorted(cutoff, side="right")) - 1
        resolved = labels.touch_idx.reindex(f.index) <= cut_pos
        trigger = trigger & resolved
        n_events = int(trigger.sum())
        if n_events < 3:
            return None
        lab = labels.label.reindex(f.index)
        ret = labels.ret.reindex(f.index)
        ev_lab = lab[trigger]
        ev_ret = ret[trigger]
        wins = (ev_lab == 1).sum()
        recovery_winrate = wins / max(len(ev_lab.dropna()), 1)
        mean_recovery_edge = float(ev_ret.mean()) if len(ev_ret.dropna()) else 0.0

        quality = float(f.get("quality", pd.Series([0.5])).tail(60).mean())
        if not np.isfinite(quality):
            quality = 0.5
        vol = float(f.get("realized_vol", pd.Series([0.3])).tail(60).median())
        if not np.isfinite(vol):
            vol = 0.3
        catalyst_rate = n_events / len(f)

        # Composite. sqrt on frequency so a name with many mediocre events doesn't
        # dominate one with fewer, stronger events.
        excess_vol = max(vol - 0.35, 0.0)
        score = (
            recovery_winrate
            * np.sqrt(max(catalyst_rate, 1e-6))
            * (1.0 + max(mean_recovery_edge, -0.05))
            * (0.7 + 0.6 * np.clip(quality, 0, 1))
            / (1.0 + 3.0 * excess_vol)
        )
        return NicheScore(
            ticker="", score=float(score), catalyst_rate=catalyst_rate,
            recovery_winrate=float(recovery_winrate),
            mean_recovery_edge=mean_recovery_edge, quality=quality, vol=vol,
            n_events=n_events,
        )

    def select(
        self,
        feats_map: Dict[str, pd.DataFrame],
        labels_map: Dict[str, object],
        as_of: Optional[pd.Timestamp] = None,
        k: Optional[int] = None,
    ) -> List[NicheScore]:
        """Rank all names by exploitability and return the top-K niche."""
        k = k or self.cfg.get("universe.niche_size", 6)
        scored: List[NicheScore] = []
        for t, f in feats_map.items():
            s = self.score_ticker(f, labels_map[t], as_of)
            if s is None:
                continue
            s.ticker = t
            scored.append(s)
        scored.sort(key=lambda x: x.score, reverse=True)
        return scored[:k]

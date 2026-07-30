"""Data adapters (RESEARCH.md §9).

All adapters return point-in-time OHLCV (and optional fundamentals/catalysts) with a
uniform schema, so the rest of the engine is source-agnostic. Live feeds (FMP/Yahoo)
are firewalled in the build sandbox; the SyntheticAdapter proves the pipeline offline
and the real adapters switch on at deploy — the same pattern The Dip uses for FMP.
"""
from .base import DataAdapter, OHLCV_COLUMNS
from .synthetic import SyntheticAdapter
from .csv_adapter import CSVAdapter
from .fmp import FMPAdapter

__all__ = [
    "DataAdapter",
    "OHLCV_COLUMNS",
    "SyntheticAdapter",
    "CSVAdapter",
    "FMPAdapter",
]

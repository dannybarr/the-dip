"""Configuration loading and typed access.

Config is intentionally a thin, dict-backed object with dotted access so the YAML
stays the single source of truth (RESEARCH.md §11). Strategy params live in config,
never hard-coded in logic, so the self-review loop (§8) can propose deltas.
"""
from __future__ import annotations

import copy
import os
from dataclasses import dataclass, field
from typing import Any, Dict

try:
    import yaml  # type: ignore
except Exception:  # pragma: no cover - yaml is a declared dependency
    yaml = None

_DEFAULT_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "default.yaml")


@dataclass
class Config:
    """Dotted, mergeable view over the config dict."""

    data: Dict[str, Any] = field(default_factory=dict)

    def get(self, path: str, default: Any = None) -> Any:
        """Fetch a nested value by dotted path, e.g. cfg.get('risk.max_positions')."""
        node: Any = self.data
        for part in path.split("."):
            if isinstance(node, dict) and part in node:
                node = node[part]
            else:
                return default
        return node

    def section(self, name: str) -> Dict[str, Any]:
        val = self.data.get(name, {})
        return val if isinstance(val, dict) else {}

    def with_overrides(self, deltas: Dict[str, Any]) -> "Config":
        """Return a NEW config with dotted-path overrides applied (immutably).

        Used by the self-review loop to trial proposed parameter changes without
        mutating the live config.
        """
        new = copy.deepcopy(self.data)
        for dotted, value in deltas.items():
            node = new
            parts = dotted.split(".")
            for part in parts[:-1]:
                node = node.setdefault(part, {})
            node[parts[-1]] = value
        return Config(new)

    def __getitem__(self, key: str) -> Any:
        return self.data[key]


def load_config(path: str | None = None) -> Config:
    """Load YAML config; falls back to the packaged default profile."""
    path = path or os.path.abspath(_DEFAULT_PATH)
    if yaml is None:
        raise RuntimeError("pyyaml is required to load config; pip install pyyaml")
    with open(path, "r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}
    return Config(raw)

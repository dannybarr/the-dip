"""Mastermind Engine — a self-reviewing swing-trading research engine.

Built on three pillars (see RESEARCH.md):
  1. Swing trading (3d–4wk behavioural mispricings)
  2. Undervalued / discounted quality (margin of safety)
  3. Educated strategic bets (narrative-vs-mechanism gaps, e.g. the Ferrari pattern)

Overlaid with JP-Morgan-grade risk discipline and a continuous, unbiased
self-review / optimisation loop.
"""

from .config import Config, load_config
from .engine import MastermindEngine

__version__ = "0.1.0"
__all__ = ["Config", "load_config", "MastermindEngine", "__version__"]

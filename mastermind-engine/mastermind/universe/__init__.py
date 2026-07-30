"""Universe / niche specialisation (differentiate for maximal upside).

The engine does not trade every name the same way. It scores each candidate's
*exploitability for this specific strategy* and concentrates on the best niche,
re-selecting over time so the niche EVOLVES as names' behaviour changes.
"""
from .selector import NicheSelector, NicheScore

__all__ = ["NicheSelector", "NicheScore"]

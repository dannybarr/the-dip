"""Strategy layer (RESEARCH.md §5, §7)."""
from .signals import Signal, generate_signals
from .principles import passes_principles, PrincipleReport

__all__ = ["Signal", "generate_signals", "passes_principles", "PrincipleReport"]

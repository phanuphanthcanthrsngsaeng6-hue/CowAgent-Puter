"""Placeholder for a future server-side Puter adapter.

Puter.js authentication is browser-based in the current implementation, so
this module deliberately does not accept or persist browser auth tokens.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class PuterModelConfig:
    model: str = "default"


class PuterModelUnavailable(RuntimeError):
    pass

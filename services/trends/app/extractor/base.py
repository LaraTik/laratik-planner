"""Source protocol — every platform extractor implements this interface.

A Source is a class with:
  - `validate_config(config) -> ValidationResult`  (static, sync)
  - `async fetch(source: TrendSource) -> list[RawSignal]`

The scheduler discovers Source subclasses by importing each module under
`app.extractor.*`. New extractors only need to be dropped into a new file
and imported in this package's `__init__`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, ClassVar, Optional, Protocol, runtime_checkable

from app.models import TrendSource


# ─── RawSignal ───────────────────────────────────────────────────────────────
@dataclass(slots=True)
class RawSignal:
    """One trend signal as returned by an extractor, pre-persistence.

    The fields are the upstream + auto-detected values. Persistence-side
    fields (workspace_id, velocity, lifecycle, embedding, ...) are filled
    in by the analysis pipeline AFTER this object lands in the DB.
    """

    platform: str
    type: str
    label: str
    source_id: str
    source_url: Optional[str] = None
    raw_payload: dict[str, Any] = field(default_factory=dict)
    language: str = "en"
    region: str = "XX"
    score: float = 0.0
    fetched_at: datetime = field(default_factory=lambda: datetime.utcnow())


# ─── Validation ──────────────────────────────────────────────────────────────
@dataclass(slots=True)
class ValidationResult:
    """Outcome of `Source.validate_config`.

    `ok` is the master pass/fail. When False, `errors` is human-readable;
    `warnings` are surfaced but non-blocking.
    """

    ok: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @classmethod
    def success(cls) -> "ValidationResult":
        return cls(ok=True)

    @classmethod
    def failure(cls, *errors: str) -> "ValidationResult":
        return cls(ok=False, errors=list(errors))


# ─── Source protocol ─────────────────────────────────────────────────────────
@runtime_checkable
class Source(Protocol):
    """Protocol every extractor implements.

    `platform` and `source_key` are class-level identifiers (constant
    per extractor class). `validate_config` is sync; `fetch` is async.
    """

    platform: ClassVar[str]
    source_key: ClassVar[str]

    @staticmethod
    def validate_config(config: dict[str, Any]) -> ValidationResult: ...

    async def fetch(self, source: TrendSource) -> list[RawSignal]: ...


# ─── Registry ────────────────────────────────────────────────────────────────
_REGISTRY: dict[str, type[Source]] = {}


def register(cls: type[Source]) -> type[Source]:
    """Class decorator that registers an extractor in the global registry.

    The scheduler iterates `all_sources()` at startup to schedule jobs.
    """
    if not hasattr(cls, "platform") or not hasattr(cls, "source_key"):
        raise TypeError(f"{cls.__name__} must define class-level `platform` and `source_key`")
    key = f"{cls.platform}:{cls.source_key}"
    _REGISTRY[key] = cls
    return cls


def get_source(platform: str, source_key: str) -> type[Source]:
    try:
        return _REGISTRY[f"{platform}:{source_key}"]
    except KeyError as exc:
        raise LookupError(
            f"no extractor registered for platform={platform!r} source_key={source_key!r}"
        ) from exc


def all_sources() -> list[type[Source]]:
    return list(_REGISTRY.values())

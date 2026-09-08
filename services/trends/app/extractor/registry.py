"""Source registry — alternate lookup table indexed by ``source_key`` alone.

Why a second registry?
---------------------
``app.extractor.base`` already ships a registry keyed by
``f"{platform}:{source_key}"``. That key shape is convenient for the
scheduler (which knows both fields when iterating ``trend_source`` rows)
but is awkward for the per-source test endpoint in
``routes_sources.py`` and for any future code that wants to ask
"give me the extractor for source_key='youtube_data_api'?" without
also passing ``platform='youtube'``.

This module exposes the alternate registry the rest of the sidecar
should use going forward:

* :func:`register_source` — class decorator used by every extractor.
* :func:`get_extractor`  — instance lookup by source_key.
* :func:`all_extractors` — every registered extractor, instantiated.
* :func:`extractors_for_platform` — only those for one platform.

Each call to :func:`register_source` also forwards to
``app.extractor.base.register`` so the existing platform:source_key
registry used by the scheduler stays in sync. Both registries are
populated by a single import of the extractor module.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from app.extractor.base import register as _register_in_base

if TYPE_CHECKING:  # pragma: no cover — typing only
    from app.extractor.base import Source


# ─── Registry storage ─────────────────────────────────────────────────────────
_REGISTRY: dict[str, type["Source"]] = {}


# ─── Decorator ────────────────────────────────────────────────────────────────
def register_source(cls: type["Source"]) -> type["Source"]:
    """Register ``cls`` in this module's ``_REGISTRY`` *and* in the base
    registry so the existing scheduler (which keys by
    ``platform:source_key``) continues to resolve the extractor.

    The class is required to define ``platform`` and ``source_key`` as
    class-level attributes (see ``app.extractor.base.Source``).
    """
    missing = [name for name in ("platform", "source_key") if not hasattr(cls, name)]
    if missing:
        raise TypeError(
            f"{cls.__name__} must define class-level {', '.join(missing)} before "
            "register_source() can be applied"
        )

    # Mirror into the base registry so the scheduler keeps working.
    _register_in_base(cls)

    _REGISTRY[cls.source_key] = cls
    return cls


# ─── Lookups ──────────────────────────────────────────────────────────────────
def get_extractor(source_key: str) -> "Source | None":
    """Return a fresh instance for ``source_key`` or ``None`` when no
    extractor is registered under that key.

    Callers that need to distinguish "missing" from "construction
    failed" should catch their own exceptions — this helper swallows
    none.
    """
    cls = _REGISTRY.get(source_key)
    if cls is None:
        return None
    return cls()


def all_extractors() -> list["Source"]:
    """Return a freshly-instantiated list of every registered extractor.

    The order is the registration order. Repeated calls return
    independent instances; nothing in this module caches extractor
    state across calls.
    """
    return [cls() for cls in _REGISTRY.values()]


def extractors_for_platform(platform: str) -> list["Source"]:
    """Return freshly-instantiated extractors whose ``platform`` matches.

    The match is exact (case-sensitive) on the class-level
    ``platform`` attribute. ``"youtube"`` will not match
    ``"YouTube"`` — keep casing consistent with the catalog.
    """
    return [ext for ext in all_extractors() if ext.platform == platform]

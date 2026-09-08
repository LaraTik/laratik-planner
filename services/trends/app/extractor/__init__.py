"""Extractor package — pluggable source extractors, one module per platform.

The base protocol is in `base.py`; every concrete extractor (tiktok, youtube,
reddit, ...) implements that protocol. The scheduler iterates registered
extractors and calls `fetch(source)` on the configured cadence.

Importing this package triggers the ``@register_source`` decorator on every
extractor class, populating both ``app.extractor.registry._REGISTRY`` and the
``app.extractor.base._REGISTRY`` used by the scheduler. Add a new extractor
by dropping a new module under this package and adding it to the import
list below — nothing else needs to change.
"""
# Side-effect imports: each module applies @register_source at import
# time, populating the registry. Order is irrelevant; the decorator is
# what matters.
from app.extractor import (  # noqa: F401  (imported for side effects)
    facebook_ads,
    google_trends,
    reddit,
    spotify,
    tiktok,
    youtube,
)

"""BART-MNLI zero-shot vertical classification.

Lazy-loads the BART-MNLI model on first call (1.5GB on disk, so we do NOT
import it at module load). Cached as a module-level singleton.

Output is a ranked list of (label, score) pairs — the caller decides how
many to keep.
"""

from __future__ import annotations

import threading
from typing import Optional

from app.observability import get_logger

logger = get_logger("vertical")

# Default candidate labels for the BART-MNLI zero-shot pass. The order is
# not meaningful for BART-MNLI (it produces a softmax over all of them)
# but the first match is what we store in `signal.vertical` for display.
DEFAULT_VERTICAL_CANDIDATES: list[str] = [
    "fashion",
    "beauty",
    "food and beverage",
    "travel and hospitality",
    "health and wellness",
    "fitness",
    "technology",
    "finance and fintech",
    "real estate",
    "automotive",
    "entertainment",
    "gaming",
    "sports",
    "music",
    "education",
    "B2B and SaaS",
    "e-commerce and retail",
    "luxury",
    "sustainability and climate",
    "parenting and family",
    "MENA regional culture",
    "LATAM regional culture",
]

DEFAULT_MODEL_NAME = "facebook/bart-large-mnli"

_model = None
_model_lock = threading.Lock()
_model_name: Optional[str] = None


def _get_model(model_name: str = DEFAULT_MODEL_NAME):
    """Lazy-load the BART-MNLI pipeline. Heavy first call."""
    global _model, _model_name
    if _model is not None and _model_name == model_name:
        return _model
    with _model_lock:
        if _model is not None and _model_name == model_name:
            return _model
        try:
            from transformers import pipeline  # type: ignore[import-not-found]
        except ImportError as exc:  # pragma: no cover
            logger.error("vertical.transformers.missing", error=str(exc))
            raise
        logger.info("vertical.model.loading", model=model_name)
        _model = pipeline("zero-shot-classification", model=model_name)
        _model_name = model_name
        logger.info("vertical.model.loaded", model=model_name)
    return _model


def classify_vertical(
    text: str,
    candidates: Optional[list[str]] = None,
    *,
    top_k: int = 3,
    model_name: str = DEFAULT_MODEL_NAME,
) -> list[tuple[str, float]]:
    """Classify `text` against `candidates` (or the default vertical set).

    Returns the top-`top_k` (label, score) pairs sorted by descending score.
    Each score is a 0-1 softmax probability. An empty text returns an empty
    list.
    """
    if not text or not text.strip():
        return []
    labels = candidates or DEFAULT_VERTICAL_CANDIDATES
    if not labels:
        return []

    model = _get_model(model_name)
    result = model(text, candidate_labels=labels, top_k=top_k)
    # `transformers` returns either a dict or a list of dicts.
    if isinstance(result, dict):
        result = [result]
    return [(item["label"], float(item["score"])) for item in result]


def warmup() -> None:
    """Pre-load the default model. Called once during the FastAPI lifespan
    so the first classification request doesn't pay the 5s model-load tax.
    """
    _get_model(DEFAULT_MODEL_NAME)

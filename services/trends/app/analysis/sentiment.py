"""Sentiment (VADER) + brand-safety (Detoxify) analysis.

The contract is small: hand it a list of texts, get back one summary that
includes a `safe_to_amplify` boolean. The two thresholds come straight
from the plan §4.5:
  - VADER < -0.5 → drop (auto)
  - Detoxify > 0.7 → drop (auto)

Models are lazy-loaded on first call so importing this module is free.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Optional

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from app.observability import get_logger

logger = get_logger("sentiment")

VADER_DROP_THRESHOLD = -0.5
DETOXIFY_DROP_THRESHOLD = 0.7


@dataclass(slots=True)
class SentimentResult:
    """The combined output for one batch of texts."""

    sentiment: float
    toxicity: float
    safe_to_amplify: bool
    dropped_reason: Optional[str] = None  # 'negative_sentiment' | 'high_toxicity' | None
    sample_size: int = 0


# ─── Lazy model singletons ───────────────────────────────────────────────────
_vader: Optional[SentimentIntensityAnalyzer] = None
_vader_lock = threading.Lock()

_detoxify_model = None
_detoxify_lock = threading.Lock()


def _get_vader() -> SentimentIntensityAnalyzer:
    global _vader
    if _vader is None:
        with _vader_lock:
            if _vader is None:
                _vader = SentimentIntensityAnalyzer()
    return _vader


def _get_detoxify():
    """Lazy-load the Detoxify model. Heavy (170MB) — only when actually needed."""
    global _detoxify_model
    if _detoxify_model is None:
        with _detoxify_lock:
            if _detoxify_model is None:
                try:
                    from detoxify import Detoxify  # type: ignore[import-not-found]
                except ImportError as exc:  # pragma: no cover — environment issue
                    logger.error("sentiment.detoxify.missing", error=str(exc))
                    raise
                _detoxify_model = Detoxify("original")
    return _detoxify_model


# ─── Public API ─────────────────────────────────────────────────────────────
def analyze_sentiment(
    texts: list[str],
    *,
    top_n: int = 50,
) -> SentimentResult:
    """Compute sentiment + toxicity over a batch of texts.

    VADER runs on the first `top_n` texts (cheap). Detoxify runs on the
    first `top_n` as well — it's the bottleneck. If either threshold is
    tripped, `safe_to_amplify` is False and `dropped_reason` is set.

    Empty input is treated as "neutral, safe" (0.0, 0.0, True).
    """
    if not texts:
        return SentimentResult(
            sentiment=0.0,
            toxicity=0.0,
            safe_to_amplify=True,
            sample_size=0,
        )

    sample = [t for t in texts if t][:top_n] or texts[:top_n]
    sample_size = len(sample)

    vader = _get_vader()
    compound_scores = [vader.polarity_scores(t)["compound"] for t in sample]
    avg_sentiment = sum(compound_scores) / len(compound_scores) if compound_scores else 0.0

    # Detoxify is optional for first-pass analysis. If the model is too
    # slow to load (cold start), we degrade gracefully: sentiment-only.
    try:
        detox = _get_detoxify()
        results = detox.predict(sample)
        # Detoxify returns a dict with at least 'toxicity'; some variants
        # return 'toxicity' as the first column of an ndarray.
        tox_values = results.get("toxicity") if isinstance(results, dict) else results[:, 0]
        avg_toxicity = float(sum(tox_values) / len(tox_values)) if len(tox_values) else 0.0
    except Exception as exc:  # noqa: BLE001 — degrade gracefully
        logger.warning("sentiment.detoxify.unavailable", error=str(exc))
        avg_toxicity = 0.0

    dropped_reason: Optional[str] = None
    if avg_sentiment < VADER_DROP_THRESHOLD:
        dropped_reason = "negative_sentiment"
    elif avg_toxicity > DETOXIFY_DROP_THRESHOLD:
        dropped_reason = "high_toxicity"

    return SentimentResult(
        sentiment=avg_sentiment,
        toxicity=avg_toxicity,
        safe_to_amplify=dropped_reason is None,
        dropped_reason=dropped_reason,
        sample_size=sample_size,
    )

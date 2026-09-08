"""all-MiniLM-L6-v2 wrapper — 384-dim sentence embeddings.

The model is loaded once and cached at module level. Calling `embed` is
threadsafe: sentence-transformers' encode is reentrant but we serialize
explicitly to avoid contention on the GIL-bound first call.

Output dimension: 384. Confirmed against
https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
"""

from __future__ import annotations

import threading
from typing import Optional

from app.observability import get_logger

logger = get_logger("embeddings")

DEFAULT_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
EMBED_DIM = 384

_model = None
_model_lock = threading.Lock()


def _get_model(model_name: str = DEFAULT_MODEL_NAME):
    global _model
    if _model is not None:
        return _model
    with _model_lock:
        if _model is not None:
            return _model
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore[import-not-found]
        except ImportError as exc:  # pragma: no cover
            logger.error("embeddings.sentence_transformers.missing", error=str(exc))
            raise
        logger.info("embeddings.model.loading", model=model_name)
        _model = SentenceTransformer(model_name, cache_folder=None)
        logger.info("embeddings.model.loaded", model=model_name)
    return _model


def embed(
    texts: list[str],
    *,
    model_name: str = DEFAULT_MODEL_NAME,
    batch_size: int = 32,
    normalize: bool = True,
) -> list[list[float]]:
    """Embed a list of strings into 384-dim float vectors.

    Args:
      texts: list of input strings. Empty list → empty result.
      model_name: HF model id. Defaults to the all-MiniLM-L6-v2 model.
      batch_size: passed to SentenceTransformer.encode.
      normalize: L2-normalize outputs (recommended for cosine via dot
        product). Default True.

    Returns:
      A list of 384-dim float vectors (one per input).
    """
    if not texts:
        return []
    model = _get_model(model_name)
    vectors = model.encode(
        texts,
        batch_size=batch_size,
        normalize_embeddings=normalize,
        show_progress_bar=False,
        convert_to_numpy=True,
    )
    # SentenceTransformer returns ndarray; convert to plain list[list[float]]
    # so it serialises cleanly to JSONB.
    return [v.tolist() for v in vectors]


def warmup() -> None:
    """Pre-load the default model. Called from the FastAPI lifespan so the
    first /v1/embed request doesn't pay the model-load tax.
    """
    _get_model(DEFAULT_MODEL_NAME)


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Convenience: cosine of two pre-computed vectors."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na ** 0.5 * nb ** 0.5)

"""POST /v1/embed — embedding endpoint, for testing the model load + serving path.

The body is `{ "texts": [str, str, ...] }`. The response is the list of
384-dim vectors, one per input. Used by the test suite + a manual
smoke-test in the ops runbook.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.analysis.embeddings import EMBED_DIM, embed
from app.observability import EMBED_REQUESTS_TOTAL

router = APIRouter(prefix="/v1/embed", tags=["embed"])


class EmbedRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=512)


class EmbedResponse(BaseModel):
    vectors: list[list[float]]
    dim: int
    count: int


@router.post("", response_model=EmbedResponse)
async def embed_texts(body: EmbedRequest) -> EmbedResponse:
    try:
        vectors = embed(body.texts)
        EMBED_REQUESTS_TOTAL.labels(outcome="success").inc()
    except Exception:
        EMBED_REQUESTS_TOTAL.labels(outcome="error").inc()
        raise
    return EmbedResponse(vectors=vectors, dim=EMBED_DIM, count=len(vectors))

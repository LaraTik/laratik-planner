# syntax=docker/dockerfile:1.6
# ─── Stage 1: builder ─────────────────────────────────────────────────────────
# Installs build-essential so the heavy ML deps (torch, sentence-transformers,
# detoxify's onnxruntime) can compile from source wheels if no prebuilt wheel
# matches the current Python 3.12 patch level.
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System deps for building wheels and for runtime curl-based healthcheck.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
        curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Layer 1: copy only the project metadata first so the dependency install layer
# is cached across code changes.
COPY pyproject.toml README.md ./
COPY app ./app

# Install the package and its deps into an isolated prefix we can copy from.
RUN pip install --prefix=/install .

# ─── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/install/bin:${PATH}" \
    PYTHONPATH="/install/lib/python3.12/site-packages" \
    MODEL_CACHE_DIR="/app/data/models" \
    # Avoid the thread explosion in OMP / MKL on small containers.
    OMP_NUM_THREADS=2 \
    MKL_NUM_THREADS=2

# We still need curl for HEALTHCHECK. The ML wheels were already built in
# stage 1; runtime does NOT need build-essential.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --shell /bin/bash --uid 1000 trends

WORKDIR /app

# Copy the installed site-packages from the builder so we don't reinstall in
# the thin runtime image.
COPY --from=builder /install /usr/local

# Copy application code last so iterative rebuilds are cheap.
COPY --chown=trends:trends app ./app
COPY --chown=trends:trends pyproject.toml README.md ./

# Persistent volume for the model cache (sentence-transformers, detoxify,
# BART-MNLI). Mounted by docker-compose.
RUN mkdir -p /app/data/models \
 && chown -R trends:trends /app/data

USER trends

EXPOSE 8010

# Curl-based healthcheck: the sidecar exposes GET /healthz (200 = ready).
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://localhost:8010/healthz || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]

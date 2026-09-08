"""Spotify Web API extractor.

Reads the public editorial playlists (Today's Top Hits, Viral 50, …)
using the OAuth client-credentials flow. Chart playlists like
``Viral 50`` are gated to Spotify partner labels; the extractor
catches the 403s, logs them, and continues with the next playlist
rather than failing the whole call.

Endpoints
---------
* ``POST https://accounts.spotify.com/api/token``
  — exchange client_id / client_secret for an access token.
* ``GET  https://api.spotify.com/v1/playlists/{id}/tracks``
  — paginated playlist contents. We follow ``next`` up to
  ``_MAX_PAGES`` times to keep memory bounded.

Auth
----
* ``SPOTIFY_CLIENT_ID`` and ``SPOTIFY_CLIENT_SECRET`` env vars.
* Token is cached in-process for ``expires_in - 60s`` so concurrent
  playlist calls share a single auth round-trip.
"""
from __future__ import annotations

import base64
import os
import time
from typing import Any, ClassVar

import httpx

from app.extractor.base import RawSignal, Source, ValidationResult
from app.extractor.registry import register_source
from app.models import TrendSource
from app.observability import get_logger


logger = get_logger(__name__)


# ─── Defaults ─────────────────────────────────────────────────────────────────
_TOKEN_URL: str = "https://accounts.spotify.com/api/token"
_API_BASE: str = "https://api.spotify.com/v1"

_DEFAULT_PLAYLISTS: tuple[str, ...] = (
    # Today's Top Hits
    "37i9dQZF1DXcBWIGoYBM5M",
    # Viral 50 (gated to partners; expect 403)
    "37i9dQZEVXbMDoHDwVN2tF",
)

_DEFAULT_MARKET: str = "US"
_DEFAULT_LIMIT: int = 50
_MAX_PAGES: int = 3  # 50 * 3 = 150 tracks per playlist cap


# ─── In-process token cache ───────────────────────────────────────────────────
# (expires_at_monotonic, access_token) — shared across all concurrent
# fetches within the same worker process.
_TOKEN_CACHE: dict[str, Any] = {}


async def _get_access_token(client: httpx.AsyncClient) -> str | None:
    """Fetch (or return cached) Spotify client-credentials access token."""
    cached = _TOKEN_CACHE.get("token")
    now = time.monotonic()
    if cached is not None and cached["expires_at"] > now:
        return cached["access_token"]

    client_id = os.environ.get("SPOTIFY_CLIENT_ID")
    client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET")
    if not client_id or not client_secret:
        return None

    auth = base64.b64encode(
        f"{client_id}:{client_secret}".encode("utf-8")
    ).decode("ascii")

    try:
        resp = await client.post(
            _TOKEN_URL,
            data={"grant_type": "client_credentials"},
            headers={
                "Authorization": f"Basic {auth}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            timeout=15.0,
        )
    except httpx.HTTPError as exc:
        logger.warning(
            "spotify.token.network_error",
            error_class=exc.__class__.__name__,
            error=str(exc)[:200],
        )
        return None

    if resp.status_code != 200:
        logger.warning(
            "spotify.token.bad_status",
            status=resp.status_code,
            body=resp.text[:200],
        )
        return None

    try:
        body = resp.json()
    except ValueError as exc:
        logger.warning(
            "spotify.token.invalid_json",
            error=str(exc)[:200],
        )
        return None

    token = body.get("access_token")
    expires_in = int(body.get("expires_in", 0) or 0)
    if not token or expires_in <= 0:
        return None

    # Refresh 60s early so we never use an already-revoked token.
    _TOKEN_CACHE["token"] = {
        "access_token": token,
        "expires_at": now + max(expires_in - 60, 30),
    }
    return token


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _signal_from_track(
    item: dict[str, Any], *, market: str
) -> RawSignal | None:
    """Map one playlist-track item to a :class:`RawSignal`."""
    if not isinstance(item, dict):
        return None
    track = item.get("track")
    if not isinstance(track, dict):
        return None

    name = (track.get("name") or "").strip()
    if not name:
        return None

    artists = track.get("artists") or []
    creator = ""
    if isinstance(artists, list) and artists and isinstance(artists[0], dict):
        creator = (artists[0].get("name") or "").strip()

    try:
        score = float(track.get("popularity", 0) or 0)
    except (TypeError, ValueError):
        score = 0.0

    track_id = track.get("id") or name
    external = track.get("external_urls") or {}
    source_url = external.get("spotify") if isinstance(external, dict) else None

    return RawSignal(
        platform="spotify",
        type="track",
        label=name,
        source_id=f"spotify:track:{track_id}",
        source_url=source_url,
        raw_payload=item,
        language="en",
        region=market,
        score=score,
    )


# ─── Extractor ────────────────────────────────────────────────────────────────
@register_source
class SpotifyWebApiSource:
    """Spotify Web API — official OAuth client-credentials read."""

    platform: ClassVar[str] = "spotify"
    source_key: ClassVar[str] = "spotify_web_api"

    # ------------------------------------------------------------------ config
    @staticmethod
    def validate_config(config: dict[str, Any]) -> ValidationResult:
        errors: list[str] = []
        if not os.environ.get("SPOTIFY_CLIENT_ID"):
            errors.append("SPOTIFY_CLIENT_ID env var is not set")
        if not os.environ.get("SPOTIFY_CLIENT_SECRET"):
            errors.append("SPOTIFY_CLIENT_SECRET env var is not set")
        playlists = config.get("playlist_ids", list(_DEFAULT_PLAYLISTS))
        if not isinstance(playlists, list) or not playlists:
            errors.append("playlist_ids must be a non-empty list")
        if errors:
            return ValidationResult.failure(*errors)
        return ValidationResult.success()

    # ------------------------------------------------------------------ fetch
    async def fetch(self, source: TrendSource) -> list[RawSignal]:
        cfg = source.config or {}
        playlists: list[str] = cfg.get(
            "playlist_ids", list(_DEFAULT_PLAYLISTS)
        )
        market: str = cfg.get("market", _DEFAULT_MARKET)
        limit: int = int(cfg.get("limit", _DEFAULT_LIMIT))

        all_signals: list[RawSignal] = []
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                token = await _get_access_token(client)
                if token is None:
                    logger.warning(
                        "spotify.fetch.no_token",
                        source_key=source.source_key,
                    )
                    return []
                for playlist_id in playlists:
                    signals = await self._fetch_playlist(
                        client, token, playlist_id, market=market, limit=limit
                    )
                    all_signals.extend(signals)
        except httpx.HTTPError as exc:
            logger.warning(
                "spotify.fetch.network_error",
                error_class=exc.__class__.__name__,
                error=str(exc)[:300],
            )
            return all_signals

        logger.info(
            "spotify.fetch.ok",
            source_key=source.source_key,
            playlists=len(playlists),
            count=len(all_signals),
        )
        return all_signals

    # ------------------------------------------------------------------ helpers
    async def _fetch_playlist(
        self,
        client: httpx.AsyncClient,
        token: str,
        playlist_id: str,
        *,
        market: str,
        limit: int,
    ) -> list[RawSignal]:
        url = f"{_API_BASE}/playlists/{playlist_id}/tracks"
        headers = {"Authorization": f"Bearer {token}"}
        params: dict[str, str | int] = {
            "limit": min(max(limit, 1), 100),
            "market": market,
        }

        signals: list[RawSignal] = []
        for page in range(_MAX_PAGES):
            try:
                resp = await client.get(url, headers=headers, params=params)
            except httpx.HTTPError as exc:
                logger.warning(
                    "spotify.fetch.playlist_error",
                    playlist_id=playlist_id,
                    error_class=exc.__class__.__name__,
                    error=str(exc)[:200],
                )
                return signals

            if resp.status_code == 401:
                # Token expired between cache and use; clear and bail
                # so the next call refetches.
                _TOKEN_CACHE.pop("token", None)
                logger.warning(
                    "spotify.fetch.token_expired",
                    playlist_id=playlist_id,
                )
                return signals

            if resp.status_code == 403:
                # Partner-gated playlist (e.g. Viral 50). Log once
                # and continue with the next playlist.
                logger.warning(
                    "spotify.fetch.playlist_forbidden",
                    playlist_id=playlist_id,
                )
                return signals

            if resp.status_code == 404:
                logger.warning(
                    "spotify.fetch.playlist_not_found",
                    playlist_id=playlist_id,
                )
                return signals

            if resp.status_code != 200:
                logger.warning(
                    "spotify.fetch.bad_status",
                    playlist_id=playlist_id,
                    status=resp.status_code,
                    body=resp.text[:200],
                )
                return signals

            try:
                payload = resp.json()
            except ValueError as exc:
                logger.warning(
                    "spotify.fetch.invalid_json",
                    playlist_id=playlist_id,
                    error=str(exc)[:200],
                )
                return signals

            for item in payload.get("items") or []:
                sig = _signal_from_track(item, market=market)
                if sig is not None:
                    signals.append(sig)

            next_url = (payload.get("next") or "").strip() or None
            if not next_url:
                break
            url = next_url
            params = {}  # next URL already has query string
        return signals

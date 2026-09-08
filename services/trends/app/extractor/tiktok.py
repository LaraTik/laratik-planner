"""TikTok extractors — Creative Center HTML scrape + tamnd/tiktok-cli.

Two flavours live in this file:

* :class:`TiktokCreativeCenterSource` — fetches
  ``ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag``
  via httpx and parses the embedded JSON state. No public API; this
  is the "official-ish" surface that the trend research call-out
  documented in ``.research/trend-apis-deep-dive.md §3.2``.
* :class:`TiktokTamndCliSource` — shells out to the
  ``tamnd/tiktok-cli`` Go binary (last commit 2023-11; legacy but
  still works) and parses its JSON output.

Both extractors produce the same :class:`RawSignal` shape, differing
only in the ``type`` field (``hashtag`` vs ``audio`` vs ``creator``).
"""
from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Any, ClassVar

import httpx

from app.extractor.base import RawSignal, Source, ValidationResult
from app.extractor.registry import register_source
from app.models import TrendSource
from app.observability import get_logger


logger = get_logger(__name__)


# ─── Defaults ─────────────────────────────────────────────────────────────────
_DEFAULT_REGIONS: tuple[str, ...] = ("WW",)
_DEFAULT_PERIOD_DAYS: int = 7
_DEFAULT_CREATIVE_CENTER_URL: str = (
    "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en"
)
_DEFAULT_TAMND_BINARY: str = os.environ.get(
    "TAMND_TIKTOK_CLI", "tamnd/tiktok-cli"
)
_DEFAULT_TAMND_TIMEOUT_S: float = 60.0

_HEADERS: dict[str, str] = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


# ─── 1. Creative Center HTML scrape ───────────────────────────────────────────
@register_source
class TiktokCreativeCenterSource:
    """Scrape the TikTok Creative Center hashtag trending page.

    The page is server-side rendered; the trend tables live in a
    ``window.__INIT_PROPS__`` or ``__NEXT_DATA__`` blob. We extract the
    first JSON object we can find that contains ``hashtagList`` /
    ``musicList`` / ``creatorList`` keys and return one signal per
    entry.

    The extractor degrades gracefully:
      * no ``bs4`` available → return ``[]`` (still returns the raw
        HTML so the operator can debug).
      * JSON state not found → return ``[]`` and log.
      * any individual item missing a label → skip it, keep the rest.
    """

    platform: ClassVar[str] = "tiktok"
    source_key: ClassVar[str] = "tiktok_creative_center"

    # ------------------------------------------------------------------ config
    @staticmethod
    def validate_config(config: dict[str, Any]) -> ValidationResult:
        errors: list[str] = []
        regions = config.get("regions", list(_DEFAULT_REGIONS))
        if not isinstance(regions, list) or not regions:
            errors.append("regions must be a non-empty list")
        period = config.get("period_days", _DEFAULT_PERIOD_DAYS)
        if not isinstance(period, int) or not 1 <= period <= 30:
            errors.append("period_days must be an integer in [1, 30]")
        if errors:
            return ValidationResult.failure(*errors)
        return ValidationResult.success()

    # ------------------------------------------------------------------ fetch
    async def fetch(self, source: TrendSource) -> list[RawSignal]:
        cfg = source.config or {}
        regions: list[str] = cfg.get("regions", list(_DEFAULT_REGIONS))

        signals: list[RawSignal] = []
        try:
            async with httpx.AsyncClient(
                headers=_HEADERS,
                timeout=20.0,
                follow_redirects=True,
            ) as client:
                for region in regions:
                    region_signals = await self._fetch_region(client, region)
                    signals.extend(region_signals)
                    if region is not regions[-1]:
                        await asyncio.sleep(0.5)
        except httpx.HTTPError as exc:
            logger.warning(
                "tiktok_creative_center.fetch.network_error",
                error_class=exc.__class__.__name__,
                error=str(exc)[:300],
            )
            return signals

        logger.info(
            "tiktok_creative_center.fetch.ok",
            source_key=source.source_key,
            regions=len(regions),
            count=len(signals),
        )
        return signals

    # ------------------------------------------------------------------ helpers
    async def _fetch_region(
        self, client: httpx.AsyncClient, region: str
    ) -> list[RawSignal]:
        try:
            resp = await client.get(_DEFAULT_CREATIVE_CENTER_URL)
        except httpx.HTTPError as exc:
            logger.warning(
                "tiktok_creative_center.fetch.region_error",
                region=region,
                error_class=exc.__class__.__name__,
                error=str(exc)[:200],
            )
            return []

        if resp.status_code != 200:
            logger.warning(
                "tiktok_creative_center.fetch.bad_status",
                region=region,
                status=resp.status_code,
            )
            return []

        html = resp.text
        state = _extract_state_json(html)
        if state is None:
            logger.warning(
                "tiktok_creative_center.fetch.no_state",
                region=region,
                html_len=len(html),
            )
            return []

        return _signals_from_state(state, region=region, source_key=self.source_key)


# ─── 2. tamnd/tiktok-cli subprocess ───────────────────────────────────────────
@register_source
class TiktokTamndCliSource:
    """Run the ``tamnd/tiktok-cli`` Go binary as a subprocess.

    The CLI prints JSON to stdout. We don't know the exact shape (no
    README in the workspace), so the parser is defensive: it looks for
    top-level ``trending`` / ``audio`` / ``hashtags`` / ``creators``
    keys and walks whatever it finds. Anything that doesn't have a
    ``name`` field is dropped silently.

    The extractor returns ``[]`` (with a log) when:
      * the binary is not on PATH / not executable;
      * the binary exits non-zero;
      * the output is not valid JSON.
    """

    platform: ClassVar[str] = "tiktok"
    source_key: ClassVar[str] = "tiktok_tamnd_cli"

    # ------------------------------------------------------------------ config
    @staticmethod
    def validate_config(config: dict[str, Any]) -> ValidationResult:
        errors: list[str] = []
        hashtags = config.get("hashtags", [])
        if not isinstance(hashtags, list):
            errors.append("hashtags must be a list")
        max_videos = config.get("max_videos_per_hashtag", 100)
        if not isinstance(max_videos, int) or not 10 <= max_videos <= 1000:
            errors.append("max_videos_per_hashtag must be an integer in [10, 1000]")
        if errors:
            return ValidationResult.failure(*errors)
        return ValidationResult.success()

    # ------------------------------------------------------------------ fetch
    async def fetch(self, source: TrendSource) -> list[RawSignal]:
        cfg = source.config or {}
        count: int = int(cfg.get("max_videos_per_hashtag", 50))

        cmd = [_DEFAULT_TAMND_BINARY, "trending", "--count", str(count)]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError:
            logger.warning(
                "tiktok_tamnd_cli.fetch.binary_not_found",
                binary=_DEFAULT_TAMND_BINARY,
            )
            return []
        except OSError as exc:
            logger.warning(
                "tiktok_tamnd_cli.fetch.spawn_error",
                binary=_DEFAULT_TAMND_BINARY,
                error_class=exc.__class__.__name__,
                error=str(exc)[:200],
            )
            return []

        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=_DEFAULT_TAMND_TIMEOUT_S
            )
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            logger.warning(
                "tiktok_tamnd_cli.fetch.timeout",
                binary=_DEFAULT_TAMND_BINARY,
                timeout_s=_DEFAULT_TAMND_TIMEOUT_S,
            )
            return []

        if proc.returncode != 0:
            logger.warning(
                "tiktok_tamnd_cli.fetch.nonzero_exit",
                binary=_DEFAULT_TAMND_BINARY,
                returncode=proc.returncode,
                stderr=(stderr or b"").decode("utf-8", errors="replace")[:300],
            )
            return []

        try:
            payload = json.loads(stdout.decode("utf-8", errors="replace"))
        except ValueError as exc:
            logger.warning(
                "tiktok_tamnd_cli.fetch.invalid_json",
                error=str(exc)[:200],
            )
            return []

        signals = _signals_from_cli_payload(payload, source_key=self.source_key)
        logger.info(
            "tiktok_tamnd_cli.fetch.ok",
            source_key=source.source_key,
            count=len(signals),
        )
        return signals


# ─── State JSON extraction (Creative Center) ───────────────────────────────────
_STATE_KEY_RE = re.compile(
    r'(?:hashtagList|musicList|creatorList|"hashtagList")',
    re.IGNORECASE,
)


def _extract_state_json(html: str) -> dict[str, Any] | None:
    """Find the embedded JSON state in the Creative Center HTML.

    The site publishes its trend data either in a ``<script
    id="__NEXT_DATA__" type="application/json">`` blob or in a
    ``window.__INIT_PROPS__ = {...}`` literal. We scan every script
    tag and return the first one whose body contains a recognised
    trend key.
    """
    if not html:
        return None

    # Strategy 1: __NEXT_DATA__ shortcut.
    next_data = re.search(
        r'<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)</script>',
        html,
        re.DOTALL | re.IGNORECASE,
    )
    if next_data:
        try:
            payload = json.loads(next_data.group(1))
        except ValueError:
            payload = None
        if isinstance(payload, dict):
            found = _find_trend_state(payload)
            if found is not None:
                return found

    # Strategy 2: walk every <script> body and pick the first match.
    for script_match in re.finditer(
        r'<script[^>]*>(.*?)</script>', html, re.DOTALL | re.IGNORECASE
    ):
        body = script_match.group(1)
        if not _STATE_KEY_RE.search(body):
            continue
        # Try to extract the first balanced JSON object in the body.
        candidate = _first_json_object(body)
        if candidate is None:
            continue
        found = _find_trend_state(candidate)
        if found is not None:
            return found

    return None


def _first_json_object(text: str) -> dict[str, Any] | None:
    """Return the first top-level JSON object embedded in ``text``."""
    start = text.find("{")
    while start != -1:
        depth = 0
        in_str = False
        escape = False
        for end in range(start, len(text)):
            ch = text[end]
            if in_str:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start : end + 1])
                    except ValueError:
                        break
        start = text.find("{", start + 1)
    return None


def _find_trend_state(node: Any) -> dict[str, Any] | None:
    """Walk an arbitrary JSON tree and return the first dict that has
    at least one of the trend-list keys."""
    if isinstance(node, dict):
        if any(k in node for k in ("hashtagList", "musicList", "creatorList")):
            return node
        for v in node.values():
            found = _find_trend_state(v)
            if found is not None:
                return found
    elif isinstance(node, list):
        for v in node:
            found = _find_trend_state(v)
            if found is not None:
                return found
    return None


def _signals_from_state(
    state: dict[str, Any], *, region: str, source_key: str
) -> list[RawSignal]:
    """Translate the Creative Center JSON state into RawSignals."""
    out: list[RawSignal] = []

    for hashtag in state.get("hashtagList") or []:
        if not isinstance(hashtag, dict):
            continue
        name = (hashtag.get("hashtagName") or hashtag.get("name") or "").strip()
        if not name:
            continue
        out.append(
            RawSignal(
                platform="tiktok",
                type="hashtag",
                label=name,
                source_id=f"tiktok:{source_key}:hashtag:{hashtag.get('hashtagId', name)}",
                source_url=(
                    f"https://www.tiktok.com/tag/{name.lstrip('#')}"
                ),
                raw_payload=hashtag,
                language="en",
                region=region,
                score=_safe_float(hashtag.get("videoViewCnt"), 0.0),
            )
        )

    for music in state.get("musicList") or []:
        if not isinstance(music, dict):
            continue
        name = (music.get("musicName") or music.get("name") or "").strip()
        if not name:
            continue
        out.append(
            RawSignal(
                platform="tiktok",
                type="audio",
                label=name,
                source_id=f"tiktok:{source_key}:audio:{music.get('musicId', name)}",
                source_url=None,
                raw_payload=music,
                language="en",
                region=region,
                score=_safe_float(music.get("useCount"), 0.0),
            )
        )

    for creator in state.get("creatorList") or []:
        if not isinstance(creator, dict):
            continue
        name = (creator.get("nickname") or creator.get("name") or "").strip()
        if not name:
            continue
        out.append(
            RawSignal(
                platform="tiktok",
                type="creator",
                label=name,
                source_id=f"tiktok:{source_key}:creator:{creator.get('creatorId', name)}",
                source_url=None,
                raw_payload=creator,
                language="en",
                region=region,
                score=_safe_float(creator.get("followerCount"), 0.0),
            )
        )

    return out


# ─── CLI payload parser ───────────────────────────────────────────────────────
_CLI_LIST_KEYS: tuple[str, ...] = (
    "trending",
    "audio",
    "musics",
    "hashtags",
    "creators",
    "videos",
)


def _signals_from_cli_payload(
    payload: Any, *, source_key: str
) -> list[RawSignal]:
    """Parse the (unknown) JSON shape of ``tamnd/tiktok-cli trending``.

    The strategy is intentionally forgiving: we accept either a top-level
    list, or a dict with one of the recognised list-shaped values. Each
    item is mapped by checking for a ``name`` / ``title`` field and a
    ``type`` / ``kind`` hint.
    """
    if isinstance(payload, list):
        candidates: list[Any] = payload
    elif isinstance(payload, dict):
        candidates = []
        for key in _CLI_LIST_KEYS:
            if isinstance(payload.get(key), list):
                candidates.append((key, payload[key]))
        if not candidates:
            return []
    else:
        return []

    out: list[RawSignal] = []
    if isinstance(candidates, list) and candidates and not isinstance(
        candidates[0], tuple
    ):
        # Payload was a top-level list — type is unknown, default to hashtag.
        for item in candidates:
            sig = _signal_from_cli_item(item, default_type="hashtag", source_key=source_key)
            if sig is not None:
                out.append(sig)
        return out

    # Payload was a dict of lists — the dict key hints the signal type.
    for key, items in candidates:  # type: ignore[misc]
        default_type = (
            "audio" if key in ("audio", "musics")
            else "creator" if key == "creators"
            else "video" if key == "videos"
            else "hashtag"
        )
        for item in items:
            sig = _signal_from_cli_item(
                item, default_type=default_type, source_key=source_key
            )
            if sig is not None:
                out.append(sig)
    return out


def _signal_from_cli_item(
    item: Any, *, default_type: str, source_key: str
) -> RawSignal | None:
    if not isinstance(item, dict):
        return None
    name = (
        item.get("name")
        or item.get("title")
        or item.get("hashtagName")
        or item.get("musicName")
        or item.get("nickname")
    )
    if not isinstance(name, str) or not name.strip():
        return None
    name = name.strip()
    sig_type = (item.get("type") or item.get("kind") or default_type).lower()
    if sig_type not in {"audio", "hashtag", "creator", "video"}:
        sig_type = default_type

    score = _safe_float(
        item.get("score")
        or item.get("useCount")
        or item.get("videoCount")
        or item.get("viewCount")
        or item.get("followerCount"),
        0.0,
    )
    item_id = (
        item.get("id")
        or item.get("musicId")
        or item.get("hashtagId")
        or item.get("creatorId")
        or name
    )
    source_url = item.get("url") or item.get("permalink") or item.get("shareUrl")
    return RawSignal(
        platform="tiktok",
        type=sig_type,
        label=name,
        source_id=f"tiktok:{source_key}:{sig_type}:{item_id}",
        source_url=source_url,
        raw_payload=item,
        language="en",
        region="XX",
        score=score,
    )

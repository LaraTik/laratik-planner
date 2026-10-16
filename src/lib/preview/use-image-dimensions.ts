"use client";

import { useEffect, useState } from "react";

/**
 * useImageDimensions — load an image URL and return its
 * intrinsic dimensions. Used by the aspect-ratio diagnostic
 * to verify that a creative asset actually matches the
 * platform's recommended shape.
 *
 * Phase 4 of the planning-workspace-v2 refactor (2026-08-30).
 *
 * The hook is client-side only (it touches `Image()` and
 * the DOM). Server components should not import this — the
 * `diagnoseAspectRatio` helper is the pure server-safe
 * counterpart.
 *
 * The probe is intentionally cheap: one `<img>` load per
 * URL, with `loading="eager"` so the diagnostic is ready by
 * the time the user reads it. We do NOT measure a hidden
 * <img> repeatedly — a single probe is enough.
 *
 * Module-level cache: when multiple components on the same
 * page probe the same URL (e.g. a pre-mount + a
 * post-mount), the second call subscribes to the in-flight
 * promise and resolves to the same result. Pre-PR 1 the
 * second call would issue a parallel `new Image()` load —
 * a duplicate R2 round-trip on every Preview tab open.
 */

export interface ImageDimensions {
  width: number | null;
  height: number | null;
  status: "loading" | "ok" | "error" | "skipped";
  errorMessage?: string;
}

const EMPTY: ImageDimensions = { width: null, height: null, status: "skipped" };

/**
 * In-flight and resolved probes keyed by URL. Survives only as
 * long as the JS runtime — fine for the planning-detail case
 * where the same image is referenced from one or two components
 * in a single render tree. Memory is bounded: each entry holds
 * one Promise and one ImageDimensions record (≤ 32 bytes).
 */
const probeCache = new Map<
  string,
  { promise: Promise<ImageDimensions>; result: ImageDimensions | null }
>();

/**
 * Bound on the cache. Entries are keyed by URL and this module lives for
 * the whole JS session, so an unbounded map would retain one entry per
 * distinct image the operator ever opened. The oldest insertion is
 * dropped once the cap is reached — first-in, first-out, because Map
 * preserves insertion order.
 */
const MAX_CACHE_ENTRIES = 64;

function rememberProbe(
  url: string,
  entry: { promise: Promise<ImageDimensions>; result: ImageDimensions | null },
) {
  if (probeCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = probeCache.keys().next();
    if (!oldest.done) probeCache.delete(oldest.value);
  }
  probeCache.set(url, entry);
}

function probeImageOnce(url: string): Promise<ImageDimensions> {
  const cached = probeCache.get(url);
  if (cached) {
    if (cached.result) return Promise.resolve(cached.result);
    return cached.promise;
  }
  const entry: { promise: Promise<ImageDimensions>; result: ImageDimensions | null } = {
    promise: Promise.resolve({ width: null, height: null, status: "loading" }),
    result: null,
  };
  rememberProbe(url, entry);
  const promise = new Promise<ImageDimensions>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const result: ImageDimensions = {
        width: img.naturalWidth,
        height: img.naturalHeight,
        status: "ok",
      };
      entry.result = result;
      resolve(result);
    };
    img.onerror = () => {
      const result: ImageDimensions = {
        width: null,
        height: null,
        status: "error",
        errorMessage: "Could not load image",
      };
      // A failure is evicted rather than cached. A failed probe carries
      // no information worth keeping — it is usually transient (the
      // asset finished uploading, a signed URL rotated, the network
      // blipped) — and a cached `error` would pin the caller to
      // "unknown" for the rest of the session with no way to retry.
      // `cancelled` in the caller still guards the late setState.
      if (probeCache.get(url) === entry) probeCache.delete(url);
      resolve(result);
    };
    img.src = url;
  });
  entry.promise = promise;
  return promise;
}

export function useImageDimensions(url: string | null | undefined): ImageDimensions {
  const [dims, setDims] = useState<ImageDimensions>(EMPTY);

  useEffect(() => {
    // The setState calls here are part of an effect
    // synchronising the hook's internal state to the input
    // `url` change. The React lint rule flags this as
    // potentially-cascading, but the alternative (deriving
    // `dims` during render) would re-trigger the <img>
    // load on every parent re-render. The effect runs
    // exactly once per `url` change.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!url) {
      setDims(EMPTY);
      return;
    }
    // Only probe URLs that look like direct images. Drive
    // pages, share pages, and folders never resolve as
    // <img> — we'd just get a network error and a noisy
    // console. The media route
    // (`/api/media/assets/<uuid>`) also short-circuits
    // here so the planning preview never re-downloads an
    // image that is already in the rendered <img>; the
    // server-supplied `thumbnailWidth`/`thumbnailHeight`
    // props on `PlatformPreview` are the canonical
    // source.
    const isDirectImage = /\.(png|jpe?g|gif|webp|avif|heic|heif|bmp|svg)(\?.*)?$/i.test(
      new URL(url, "http://x").pathname,
    );
    if (!isDirectImage) {
      setDims({ width: null, height: null, status: "skipped" });
      return;
    }
    setDims({ width: null, height: null, status: "loading" });
    let cancelled = false;
    void probeImageOnce(url).then((result) => {
      if (cancelled) return;
      setDims(result);
    });
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [url]);

  return dims;
}

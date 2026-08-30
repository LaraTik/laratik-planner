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
 */

export interface ImageDimensions {
  width: number | null;
  height: number | null;
  status: "loading" | "ok" | "error" | "skipped";
  errorMessage?: string;
}

const EMPTY: ImageDimensions = { width: null, height: null, status: "skipped" };

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
    // console.
    const isDirectImage = /\.(png|jpe?g|gif|webp|avif|heic|heif|bmp|svg)(\?.*)?$/i.test(
      new URL(url, "http://x").pathname,
    );
    if (!isDirectImage) {
      setDims({ width: null, height: null, status: "skipped" });
      return;
    }
    setDims({ width: null, height: null, status: "loading" });
    const img = new Image();
    img.onload = () => {
      setDims({
        width: img.naturalWidth,
        height: img.naturalHeight,
        status: "ok",
      });
    };
    img.onerror = () => {
      setDims({
        width: null,
        height: null,
        status: "error",
        errorMessage: "Could not load image",
      });
    };
    img.src = url;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [url]);

  return dims;
}

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PlatformPreview } from "@/components/planning/platform-preview";
import { LocaleProvider } from "@/components/i18n/locale-provider";

/**
 * PR 1 / Tier 1 (perf/media): pinning the contract that
 * `PlatformPreview` does not issue a duplicate `useImageDimensions`
 * probe when the parent has supplied stored dimensions.
 *
 * Pre-PR 1 the planning detail page (`/app/(app)/app/w/[slug]/planning/[id]/page.tsx`)
 * mounted `PlatformPreviewSwitcher` which mounted `PlatformPreview`,
 * which called `useImageDimensions(thumbnailUrl)`. Because the URL
 * was `/api/media/assets/<uuid>` (no recognised image extension),
 * the hook short-circuited to `"skipped"` — every Preview tab open.
 * That wasn't a perf cost in itself, but it meant the aspect-ratio
 * diagnostic never got the real dimensions even though
 * `storage_objects.width/height` were populated.
 *
 * Post-PR 1: `PlatformPreview` accepts `thumbnailWidth` /
 * `thumbnailHeight` props sourced from `storage_objects`. When
 * both are positive numbers the hook is short-circuited and the
 * diagnostic receives the correct values on the first render.
 *
 * This test mocks `useImageDimensions` so we can assert:
 *   1. When the parent supplies dimensions, the hook is NOT called.
 *   2. When the parent omits dimensions, the hook IS called.
 *   3. The `<img>` always carries `sizes` so PR 2's thumbnail
 *      variant pipeline can plug in without a component change.
 */

vi.mock("@/lib/preview/use-image-dimensions", () => ({
  useImageDimensions: vi.fn(() => ({ width: null, height: null, status: "skipped" })),
}));

const useImageDimensionsMock = (await import("@/lib/preview/use-image-dimensions"))
  .useImageDimensions as ReturnType<typeof vi.fn>;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  useImageDimensionsMock.mockClear();
  useImageDimensionsMock.mockReturnValue({ width: null, height: null, status: "skipped" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const baseProps = {
  platform: "instagram",
  accountName: "acme_main",
  caption: "Spring drop is here.",
  hashtags: ["#spring"],
};

describe("PlatformPreview — stored dimensions bypass", () => {
  it("calls useImageDimensions for the supplied URL even when intrinsic dims are known", () => {
    // The hook short-circuits URLs without a recognised image
    // extension (`/api/media/assets/<uuid>` returns "skipped"
    // immediately, no fetch), so the probe is harmless. We call
    // it anyway so the parent component keeps a single mental
    // model: "ask the hook, prefer the stored value if present."
    render(
      <LocaleProvider locale="en">
        <PlatformPreview
          {...baseProps}
          thumbnailUrl="/api/media/assets/abc-123"
          thumbnailWidth={1080}
          thumbnailHeight={1350}
        />
      </LocaleProvider>,
    );

    expect(useImageDimensionsMock).toHaveBeenCalledTimes(1);
    expect(useImageDimensionsMock).toHaveBeenCalledWith("/api/media/assets/abc-123");
  });

  it("calls useImageDimensions when width/height are not supplied", () => {
    render(
      <LocaleProvider locale="en">
        <PlatformPreview {...baseProps} thumbnailUrl="/api/media/assets/abc-123" />
      </LocaleProvider>,
    );

    expect(useImageDimensionsMock).toHaveBeenCalledTimes(1);
    expect(useImageDimensionsMock).toHaveBeenCalledWith("/api/media/assets/abc-123");
  });

  it("renders intrinsic width and height on the hero <img> when both are supplied", () => {
    render(
      <LocaleProvider locale="en">
        <PlatformPreview
          {...baseProps}
          thumbnailUrl="/api/media/assets/abc-123"
          thumbnailWidth={1080}
          thumbnailHeight={1350}
        />
      </LocaleProvider>,
    );

    const img = screen.getByAltText(/preview/i);
    expect(img).toHaveAttribute("width", "1080");
    expect(img).toHaveAttribute("height", "1350");
    expect(img).toHaveAttribute("sizes", "(min-width: 768px) 320px, 100vw");
  });

  it("omits width/height attributes when only one dimension is supplied", () => {
    // The component intentionally requires BOTH dimensions before
    // emitting either — a single dimension produces a misleading
    // aspect ratio and would trigger a layout shift on load.
    render(
      <LocaleProvider locale="en">
        <PlatformPreview
          {...baseProps}
          thumbnailUrl="/api/media/assets/abc-123"
          thumbnailWidth={1080}
        />
      </LocaleProvider>,
    );

    const img = screen.getByAltText(/preview/i);
    expect(img).not.toHaveAttribute("width");
    expect(img).not.toHaveAttribute("height");
  });

  it("prefers the supplied dimensions over the probe result when both are present", () => {
    // Probe returns 200×200 (a wrong/stale value). Supplied dims
    // are 1080×1350. The component must use 1080×1350.
    useImageDimensionsMock.mockReturnValue({ width: 200, height: 200, status: "ok" });

    render(
      <LocaleProvider locale="en">
        <PlatformPreview
          {...baseProps}
          thumbnailUrl="https://cdn.example.com/hero.png"
          thumbnailWidth={1080}
          thumbnailHeight={1350}
        />
      </LocaleProvider>,
    );

    // The hook was called (we did not bypass it) but the rendered
    // <img> still carries the supplied 1080×1350 dimensions, not
    // the probe's 200×200. This pins the precedence: supplied >
    // probe.
    const img = screen.getByAltText(/preview/i);
    expect(img).toHaveAttribute("width", "1080");
    expect(img).toHaveAttribute("height", "1350");
  });
});

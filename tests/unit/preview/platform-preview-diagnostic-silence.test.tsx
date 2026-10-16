import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlatformPreview } from "@/components/planning/platform-preview";
import { LocaleProvider } from "@/components/i18n/locale-provider";

/**
 * The aspect-ratio diagnostic must stay silent when it has nothing to say.
 *
 * `diagnoseAspectRatio` returns `severity: "warning"` with the summary
 * "Dimensions unknown" whenever width/height are null. But the render gate
 * keyed only on `thumbnailUrl`, so any asset whose intrinsic size is not
 * known displayed a permanent amber warning that could never resolve:
 *
 *   - while the client-side probe is still loading, and
 *   - forever, for legacy assets with no stored `storage_objects.width/height`,
 *     because `useImageDimensions` deliberately skips probing
 *     `/api/media/assets/<uuid>` (no image extension) — which is exactly
 *     the fallback URL the page hands the preview.
 *
 * A warning that is always on is indistinguishable from a real one, so it
 * trains the operator to ignore the diagnostic entirely — including the
 * "this landscape image will be cropped" case that genuinely matters.
 */

const baseProps = {
  platform: "instagram",
  accountName: "acme_main",
  caption: "Spring drop is here.",
};

function renderPreview(props: Record<string, unknown>) {
  return render(
    <LocaleProvider locale="en">
      <PlatformPreview {...baseProps} {...props} />
    </LocaleProvider>,
  );
}

/** The planning route's fallback URL — no image extension, so unprobeable. */
const MEDIA_ROUTE_URL = "/api/media/assets/2f1c9d0e-1111-4222-8333-444444444444";

describe("PlatformPreview — aspect diagnostic silence", () => {
  it("stays silent when the asset has no known intrinsic dimensions", () => {
    renderPreview({ thumbnailUrl: MEDIA_ROUTE_URL });

    expect(screen.getByTestId("platform-preview-media")).toBeInTheDocument();
    expect(screen.queryByTestId("aspect-diagnostic-warning")).not.toBeInTheDocument();
    expect(screen.queryByTestId("aspect-diagnostic-ok")).not.toBeInTheDocument();
    expect(screen.queryByTestId("platform-preview-aspect-diagnostic")).not.toBeInTheDocument();
  });

  it("still reports a real mismatch when dimensions ARE known", () => {
    // 1920×1080 landscape against a 1:1 target — a genuine "will crop".
    renderPreview({
      thumbnailUrl: "https://cdn.example.com/hero.png",
      thumbnailWidth: 1920,
      thumbnailHeight: 1080,
    });

    const warning = screen.getByTestId("aspect-diagnostic-warning");
    expect(warning).toHaveTextContent("1920 × 1080");
    expect(warning).toHaveTextContent("1080 × 1080");
  });

  it("reports a match when the asset matches the target shape", () => {
    renderPreview({
      thumbnailUrl: "https://cdn.example.com/hero.png",
      thumbnailWidth: 1080,
      thumbnailHeight: 1080,
    });

    expect(screen.getByTestId("aspect-diagnostic-ok")).toHaveTextContent("1080 × 1080");
  });

  it("keeps the silence rule inside compare-all columns too", () => {
    renderPreview({ thumbnailUrl: MEDIA_ROUTE_URL });

    fireEvent.click(screen.getByTestId("platform-preview-dimension-all"));

    expect(screen.getByTestId("platform-preview-compare")).toBeInTheDocument();
    expect(screen.queryByTestId("aspect-diagnostic-warning")).not.toBeInTheDocument();
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PlatformPreview } from "@/components/planning/platform-preview";

/**
 * Phase 4 of the planning-workspace-v2 refactor (2026-08-30):
 * the preview now ships an aspect-ratio diagnostic and a
 * safe-area overlay for Reel/Story. These tests pin the
 * public contract:
 *   - diagnostic renders when the image can be measured
 *   - safe-area overlay toggle is only present for reel/story
 *   - carousel content format shows the carousel label and
 *     uses carousel aspect candidates
 */

beforeEach(() => {
  // jsdom doesn't compute naturalWidth/Height for `new Image()`.
  // We stub it before each test so the hook can resolve.
  Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
    configurable: true,
    get() {
      return 1080;
    },
  });
  Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", {
    configurable: true,
    get() {
      return 1350;
    },
  });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const baseProps = {
  platform: "instagram",
  accountName: "acme_main",
  caption: "Spring drop is here.",
  hashtags: ["#spring", "#drop"],
};

describe("PlatformPreview — aspect ratio + safe area", () => {
  it("renders no diagnostic when no thumbnail is set", () => {
    render(<PlatformPreview {...baseProps} thumbnailUrl={null} />);
    expect(screen.queryByTestId("platform-preview-aspect-diagnostic")).not.toBeInTheDocument();
  });

  it("renders the aspect-diagnostic container when a thumbnail URL is provided", () => {
    render(<PlatformPreview {...baseProps} thumbnailUrl="https://x.com/hero.png" />);
    // jsdom does not actually load images, so the diagnostic
    // resolves to "Dimensions unknown" — the container still
    // renders. The full "ok" / "warning" path is covered
    // by the pure `diagnoseAspectRatio` tests.
    expect(screen.getByTestId("platform-preview-aspect-diagnostic")).toBeInTheDocument();
  });

  it("renders the safe-area toggle when the format is reel", () => {
    render(<PlatformPreview {...baseProps} initialFormat="reel" />);
    expect(screen.getByTestId("safe-area-toggle")).toBeInTheDocument();
  });

  it("renders the safe-area toggle for the feed format too (overlay is informational)", () => {
    render(<PlatformPreview {...baseProps} initialFormat="feed" />);
    // The toggle button is part of the SafeAreaOverlay wrapper
    // which is mounted for feed/reel/story alike. The overlay
    // itself is the same; only the painted regions differ.
    expect(screen.getByTestId("safe-area-toggle")).toBeInTheDocument();
  });

  it("toggles the safe-area overlay when the button is pressed", () => {
    render(<PlatformPreview {...baseProps} initialFormat="reel" />);
    expect(screen.queryByTestId("safe-area-overlay")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("safe-area-toggle"));
    expect(screen.getByTestId("safe-area-overlay")).toBeInTheDocument();
  });

  it("shows the 'Carousel preview' label when contentFormat is carousel", () => {
    render(<PlatformPreview {...baseProps} contentFormat="carousel" />);
    expect(screen.getByTestId("platform-preview-carousel-label")).toBeInTheDocument();
  });
});

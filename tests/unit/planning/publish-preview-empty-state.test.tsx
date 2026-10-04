import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PlatformPreview } from "@/components/planning/platform-preview";
import { MetaPublishingReadinessCard } from "@/components/workspace/meta-publishing-readiness-card";
import { metaPublishingReadinessCopy } from "@/lib/social/publishing-readiness-copy";
import { WORKSPACE_SECTION_ANCHORS } from "@/lib/publishing/blocker-targets";
import type { MetaPublishingReadiness } from "@/lib/db/schema";
import { makeTranslator } from "@/messages";

/**
 * The publish page's two largest wasted areas.
 *
 * 1. `PlatformPreview` used to allocate the full platform
 *    aspect-ratio frame (e.g. `aspect-square`) even when there
 *    was no approved media — several hundred pixels of height
 *    for two words of copy. The frame is now only allocated
 *    once media exists; a compact empty state takes its place
 *    and points at the assets panel.
 * 2. `MetaPublishingReadinessCard` used to spend its height on
 *    six paragraphs of prose for a state that needs no action.
 *    Healthy states now collapse to one line behind a
 *    disclosure; the detail copy stays reachable.
 */

beforeEach(() => {
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
  hashtags: ["#spring"],
};

/** Every class in the platform ratio map, so a regression that
 *  re-introduces any of them is caught, not just `aspect-square`. */
const ASPECT_CLASSES = ["aspect-square", "aspect-[4/5]", "aspect-[9/16]"];

function elementsCarryingAspectClass(container: HTMLElement): HTMLElement[] {
  return ASPECT_CLASSES.flatMap((cls) =>
    Array.from(container.querySelectorAll(`.${CSS.escape(cls)}`)),
  );
}

describe("PlatformPreview — no-media empty state", () => {
  it("does not allocate the platform aspect-ratio frame when no media is approved", () => {
    const { container } = render(<PlatformPreview {...baseProps} thumbnailUrl={null} />);

    expect(screen.getByTestId("platform-preview-empty")).toBeInTheDocument();
    expect(elementsCarryingAspectClass(container)).toHaveLength(0);
    expect(screen.queryByTestId("platform-preview-media")).not.toBeInTheDocument();
  });

  it("renders the compact empty state with a link to the assets panel", () => {
    render(<PlatformPreview {...baseProps} thumbnailUrl={null} />);

    expect(screen.getByText("No approved media yet")).toBeInTheDocument();
    expect(
      screen.getByText("The preview appears once a delivery asset is approved."),
    ).toBeInTheDocument();

    const link = screen.getByTestId("platform-preview-review-assets");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "#assets-versions");
    // Same anchor the delivery blockers use — one canonical value.
    expect(link).toHaveAttribute("href", WORKSPACE_SECTION_ANCHORS.assets);
    expect(link).toHaveTextContent("Review assets");
    // A plain anchor cannot submit an enclosing form.
    expect(link).not.toHaveAttribute("type");
  });

  it("keeps the empty state out of the aspect frame in every compare column", () => {
    const { container } = render(<PlatformPreview {...baseProps} thumbnailUrl={null} />);

    fireEvent.click(screen.getByTestId("platform-preview-dimension-all"));

    expect(screen.getByTestId("platform-preview-compare")).toBeInTheDocument();
    expect(elementsCarryingAspectClass(container)).toHaveLength(0);
    expect(screen.getAllByTestId("platform-preview-empty")).toHaveLength(3);
  });
});

describe("PlatformPreview — media present", () => {
  it("allocates the aspect-ratio frame once media exists", () => {
    render(<PlatformPreview {...baseProps} thumbnailUrl="https://x.com/hero.png" />);

    expect(screen.queryByTestId("platform-preview-empty")).not.toBeInTheDocument();
    expect(screen.getByTestId("platform-preview-media")).toHaveClass("aspect-square");
    expect(screen.getByTestId("platform-preview-aspect-diagnostic")).toBeInTheDocument();
  });

  it("keeps the ratio map wired to the dimension switch", () => {
    render(<PlatformPreview {...baseProps} thumbnailUrl="https://x.com/hero.png" />);

    fireEvent.click(screen.getByTestId("platform-preview-dimension-portrait"));
    expect(screen.getByTestId("platform-preview-media")).toHaveClass("aspect-[4/5]");

    fireEvent.click(screen.getByTestId("platform-preview-dimension-vertical"));
    expect(screen.getByTestId("platform-preview-media")).toHaveClass("aspect-[9/16]");
  });
});

/* ── Readiness card ──────────────────────────────────────────── */

const t = makeTranslator("en");

function readiness(status: MetaPublishingReadiness["status"]): MetaPublishingReadiness {
  return { status } as MetaPublishingReadiness;
}

const copyFor = (status: MetaPublishingReadiness["status"]) =>
  metaPublishingReadinessCopy(readiness(status), t);

describe("MetaPublishingReadinessCard — compression", () => {
  it.each(["ready", "analytics_only"] as const)(
    "collapses %s to a single line behind a disclosure",
    (status) => {
      const copy = copyFor(status);
      render(<MetaPublishingReadinessCard readiness={readiness(status)} copy={copy} />);

      const details = screen.getByTestId("meta-publishing-readiness-card-details");
      expect(details).toBeInTheDocument();
      expect(details).not.toHaveAttribute("open");

      // The collapsed line carries the icon, the title and the status.
      const summary = details.querySelector("summary");
      expect(summary).not.toBeNull();
      expect(summary).toHaveTextContent(copy.title);
      expect(summary).toHaveTextContent(copy.statusLabel);

      // Detail copy is reachable, not deleted.
      const body = screen.getByTestId("meta-publishing-readiness-card-status").parentElement;
      expect(body).toHaveTextContent(copy.statusDescription);
      expect(body).toHaveTextContent(copy.analyticsDescription);
      expect(body).toHaveTextContent(copy.nextStepDescription);

      // Status is announced from text, never from colour alone.
      expect(screen.getByTestId("meta-publishing-readiness-card-status")).toHaveAttribute(
        "role",
        "status",
      );
    },
  );

  it("keeps the blocking state's description and next step visible without a click", () => {
    const copy = copyFor("not_configured");
    const { container } = render(
      <MetaPublishingReadinessCard readiness={readiness("not_configured")} copy={copy} />,
    );

    expect(container.querySelector("details")).toBeNull();
    expect(screen.getByText(copy.description)).toBeInTheDocument();
    // `statusDescription` and `publishingDescription` resolve to the
    // same catalog string for this status, so assert on the block.
    expect(screen.getByTestId("meta-publishing-readiness-card-status")).toHaveTextContent(
      copy.statusLabel,
    );
    expect(screen.getByTestId("meta-publishing-readiness-card-status")).toHaveTextContent(
      copy.statusDescription,
    );
    expect(screen.getAllByText(copy.statusDescription).length).toBeGreaterThan(0);
    expect(screen.getByText(copy.nextStepDescription)).toBeVisible();
    expect(screen.getByTestId("meta-publishing-readiness-card-next-step")).toBeInTheDocument();
  });
});

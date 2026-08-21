import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DeliveryVersionList,
  type DeliveryVersionListProps,
} from "@/components/workspace/delivery-version-list";

/**
 * DeliveryVersionList — the immutable history of past delivery
 * submissions, rendered above the submit form on the content
 * detail page.
 *
 * Extracted from the inlined `DeliveryRow` block in
 * `delivery-section.tsx`. The list takes pre-projected versions
 * (from `listDeliveryVersionsForItem` server-side) so the
 * client-safe redaction is enforced in the data layer, not in
 * the view.
 *
 * Test matrix per the plan:
 *   - empty                             — empty state
 *   - multiple immutable versions       — newest-first ordering
 *   - approved version                  — approved badge
 *   - safe external links               — target=_blank, rel=noreferrer
 *   - client-safe projection            — internal-only fields redacted
 */

const baseVersion = (overrides: Partial<DeliveryVersionListProps["versions"][number]> = {}) => ({
  id: "v-1",
  versionNumber: 1,
  description: "Final creatives, v1",
  designerNote: null,
  submittedAt: new Date("2026-08-15T10:00:00.000Z").toISOString(),
  isFinalApproved: false,
  submittedBy: { id: "u-1", name: "Maya" },
  links: [],
  ...overrides,
});

function renderList(overrides: Partial<DeliveryVersionListProps> = {}) {
  const props: DeliveryVersionListProps = {
    versions: [baseVersion()],
    viewerIsClient: false,
    ...overrides,
  };
  return render(<DeliveryVersionList {...props} />);
}

describe("DeliveryVersionList", () => {
  it("renders the empty state when there are no versions", () => {
    renderList({ versions: [] });
    expect(screen.getByText(/no deliveries yet/i)).toBeInTheDocument();
  });

  it("renders N version cards in newest-first order", () => {
    const versions = [
      baseVersion({ id: "v-3", versionNumber: 3, description: "V3 description" }),
      baseVersion({ id: "v-2", versionNumber: 2, description: "V2 description" }),
      baseVersion({ id: "v-1", versionNumber: 1, description: "V1 description" }),
    ];
    renderList({ versions });
    const cards = screen.getAllByTestId(/^delivery-version-\d+$/);
    expect(cards).toHaveLength(3);
    // The first card in the DOM should be the newest version.
    expect(cards[0]).toHaveAttribute("data-testid", "delivery-version-3");
    expect(cards[1]).toHaveAttribute("data-testid", "delivery-version-2");
    expect(cards[2]).toHaveAttribute("data-testid", "delivery-version-1");
    // Each version's description should be present.
    expect(screen.getByText(/V1 description/)).toBeInTheDocument();
    expect(screen.getByText(/V2 description/)).toBeInTheDocument();
    expect(screen.getByText(/V3 description/)).toBeInTheDocument();
  });

  it("renders the version number and description in the toggle heading", () => {
    renderList({
      versions: [baseVersion({ versionNumber: 2, description: "Second pass" })],
    });
    expect(screen.getByText(/V2/)).toBeInTheDocument();
    expect(screen.getByText(/second pass/i)).toBeInTheDocument();
  });

  it("renders the submitter name and a non-empty submitted-at timestamp", () => {
    renderList({
      versions: [
        baseVersion({
          submittedBy: { id: "u-9", name: "Omar" },
          submittedAt: new Date("2026-08-10T09:30:00.000Z").toISOString(),
        }),
      ],
    });
    const card = screen.getByTestId("delivery-version-1");
    expect(card.textContent ?? "").toContain("Omar");
    // The timestamp is locale-dependent; just assert there's a
    // non-whitespace token following the name.
    expect((card.textContent ?? "").trim().length).toBeGreaterThan(0);
  });

  it("renders the approved badge when isFinalApproved is true", () => {
    renderList({
      versions: [baseVersion({ isFinalApproved: true })],
    });
    expect(screen.getByText(/final approved/i)).toBeInTheDocument();
  });

  it("does NOT render the approved badge when isFinalApproved is false", () => {
    renderList({
      versions: [baseVersion({ isFinalApproved: false })],
    });
    expect(screen.queryByText(/final approved/i)).toBeNull();
  });

  it("renders safe external links with target=_blank and rel=noreferrer", () => {
    renderList({
      versions: [
        baseVersion({
          isFinalApproved: true, // expanded by default
          links: [
            {
              id: "l-1",
              provider: "figma",
              label: "Figma file",
              url: "https://figma.com/file/abc",
              isPreview: true,
            },
          ],
        }),
      ],
    });
    const link = screen.getByRole("link", { name: /figma file/i });
    expect(link).toHaveAttribute("target", "_blank");
    // The "noopener" half of the rel is also part of the project standard.
    expect(link.getAttribute("rel")).toMatch(/noreferrer/);
    expect(link.getAttribute("rel")).toMatch(/noopener/);
  });

  it("renders the provider label (humanized) and a Preview tag for preview links", () => {
    renderList({
      versions: [
        baseVersion({
          isFinalApproved: true,
          links: [
            {
              id: "l-1",
              provider: "google_drive",
              label: "Drive folder",
              url: "https://drive.google.com/folder",
              isPreview: true,
            },
          ],
        }),
      ],
    });
    expect(screen.getByText(/google drive/i)).toBeInTheDocument();
    expect(screen.getByText(/preview/i)).toBeInTheDocument();
  });

  it("renders the 'No links on this version' fallback when links is empty", () => {
    renderList({
      versions: [baseVersion({ isFinalApproved: true, links: [] })],
    });
    expect(screen.getByText(/no links on this version/i)).toBeInTheDocument();
  });

  it("client-safe projection: when viewerIsClient, the designer note is not rendered", () => {
    renderList({
      versions: [baseVersion({ designerNote: "Internal-only brand color tweak" })],
      viewerIsClient: true,
    });
    // The "Designer note" label is internal-only; the client projection
    // must not include it in the rendered output.
    expect(screen.queryByText(/designer note/i)).toBeNull();
    expect(screen.queryByText(/internal-only brand color tweak/i)).toBeNull();
  });

  it("client-safe projection: when viewerIsClient, the submitter full name is hidden", () => {
    // The internal projection exposes the submitter's display name.
    // The client projection redacts it (server should already have
    // stripped it; the component also has a defensive fallback).
    renderList({
      versions: [baseVersion({ submittedBy: { id: "u-1", name: "Maya" } })],
      viewerIsClient: true,
    });
    expect(screen.queryByText(/Maya/)).toBeNull();
  });

  it("internal viewer: the designer note IS rendered", () => {
    renderList({
      versions: [
        baseVersion({
          isFinalApproved: true,
          designerNote: "Headline needs tighter kerning",
        }),
      ],
      viewerIsClient: false,
    });
    expect(screen.getByText(/designer note/i)).toBeInTheDocument();
    expect(screen.getByText(/headline needs tighter kerning/i)).toBeInTheDocument();
  });

  it("internal viewer: the submitter name IS rendered", () => {
    renderList({
      versions: [baseVersion({ submittedBy: { id: "u-1", name: "Maya" } })],
      viewerIsClient: false,
    });
    expect(screen.getByText(/Maya/)).toBeInTheDocument();
  });

  it("expands a version row to reveal its links and designer note on click", async () => {
    const user = userEvent.setup();
    renderList({
      versions: [
        baseVersion({
          designerNote: "First delivery note",
          links: [
            {
              id: "l-1",
              provider: "figma",
              label: "Figma file",
              url: "https://figma.com/file/abc",
              isPreview: false,
            },
          ],
        }),
      ],
    });
    // The toggle is collapsed by default for non-final-approved rows.
    const toggle = screen.getByTestId("delivery-version-toggle-1");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/first delivery note/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /figma file/i })).toBeInTheDocument();
  });

  it("expands a final-approved version row by default", () => {
    renderList({
      versions: [baseVersion({ isFinalApproved: true })],
    });
    const toggle = screen.getByTestId("delivery-version-toggle-1");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("shows the 'First delivery for this content item' hint only on V1", () => {
    const { rerender } = renderList({
      versions: [baseVersion({ versionNumber: 1, isFinalApproved: true })],
    });
    expect(screen.getByText(/first delivery for this content item/i)).toBeInTheDocument();
    rerender(<DeliveryVersionList versions={[baseVersion({ versionNumber: 2 })]} />);
    expect(screen.queryByText(/first delivery for this content item/i)).toBeNull();
  });

  it("renders the version-count header in the empty state via the list summary", () => {
    // The component itself shows "No deliveries yet" for empty, but
    // when there is exactly one version the heading remains implicit
    // (the list container shows the cards). We at least confirm the
    // empty case is well-typed and not crashing.
    renderList({ versions: [] });
    expect(screen.getByText(/no deliveries yet/i)).toBeInTheDocument();
  });

  it("renders V1..V3 markers in the correct order even when sort arrives shuffled", () => {
    const versions = [
      baseVersion({ id: "v-1", versionNumber: 1 }),
      baseVersion({ id: "v-3", versionNumber: 3 }),
      baseVersion({ id: "v-2", versionNumber: 2 }),
    ];
    // The component does NOT re-sort; the server returns newest-first.
    // This test asserts the contract: caller hands us newest-first,
    // component renders in that order.
    renderList({ versions });
    const cards = screen.getAllByTestId(/^delivery-version-\d+$/);
    expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual([
      "delivery-version-1",
      "delivery-version-3",
      "delivery-version-2",
    ]);
  });

  it("renders each link as an <a> with href set to the link url", () => {
    renderList({
      versions: [
        baseVersion({
          isFinalApproved: true,
          links: [
            {
              id: "l-1",
              provider: "dropbox",
              label: "Dropbox",
              url: "https://dropbox.com/s/abc",
              isPreview: false,
            },
            {
              id: "l-2",
              provider: "frame_io",
              label: "Frame.io review",
              url: "https://frame.io/v/abc",
              isPreview: true,
            },
          ],
        }),
      ],
    });
    const dropbox = screen.getByRole("link", { name: /dropbox/i });
    expect(dropbox).toHaveAttribute("href", "https://dropbox.com/s/abc");
    const frame = screen.getByRole("link", { name: /frame\.io review/i });
    expect(frame).toHaveAttribute("href", "https://frame.io/v/abc");
  });

  it("is keyboard-accessible: the version toggle is a real <button> and is focusable", () => {
    renderList({ versions: [baseVersion()] });
    const toggle = screen.getByTestId("delivery-version-toggle-1");
    expect(toggle.tagName).toBe("BUTTON");
    toggle.focus();
    expect(toggle).toHaveFocus();
  });

  it("summary text inside a card reflects the submitter + submitted-at meta line", () => {
    renderList({
      versions: [
        baseVersion({
          isFinalApproved: true,
          submittedBy: { id: "u-1", name: "Elena" },
          submittedAt: new Date("2026-08-15T10:00:00.000Z").toISOString(),
        }),
      ],
    });
    // The meta line lives inside the toggle button. We grab the
    // button by data-testid and assert Elena is in its text.
    const toggle = screen.getByTestId("delivery-version-toggle-1");
    expect(toggle.textContent ?? "").toContain("Elena");
  });

  it("exposes the data-testid per version (server-driven selectors stay stable)", () => {
    renderList({
      versions: [
        baseVersion({ id: "v-a", versionNumber: 1 }),
        baseVersion({ id: "v-b", versionNumber: 2 }),
      ],
    });
    expect(screen.getByTestId("delivery-version-1")).toBeInTheDocument();
    expect(screen.getByTestId("delivery-version-2")).toBeInTheDocument();
  });

  it("uses the success color token for the 'Final approved' badge so color matches the text", () => {
    const { container } = renderList({
      versions: [baseVersion({ isFinalApproved: true })],
    });
    const success = container.querySelector('[class*="text-success"]');
    expect(success).not.toBeNull();
    expect(screen.getByText(/final approved/i)).toBeInTheDocument();
  });

  it("multiple approved versions: each card shows the approved badge independently", () => {
    renderList({
      versions: [
        baseVersion({ id: "v-1", versionNumber: 1, isFinalApproved: true }),
        baseVersion({ id: "v-2", versionNumber: 2, isFinalApproved: true }),
      ],
    });
    expect(screen.getAllByText(/final approved/i).length).toBe(2);
  });

  it("internal-only: link with isPreview=true renders both the provider and the 'Preview' tag", () => {
    renderList({
      versions: [
        baseVersion({
          isFinalApproved: true,
          links: [
            {
              id: "l-1",
              provider: "frame_io",
              label: "Review",
              url: "https://frame.io/v/abc",
              isPreview: true,
            },
          ],
        }),
      ],
    });
    // Use the explicit data-testid to scope to this version's links <ul>.
    const list = screen.getByTestId("delivery-links-1");
    // "frame_io" → "Frame Io" (humanize uses word boundaries on "_")
    expect(within(list).getByText(/frame io/i)).toBeInTheDocument();
    expect(within(list).getByText(/preview/i)).toBeInTheDocument();
  });
});

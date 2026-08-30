import { describe, expect, it, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DeliveryVersionList,
  type DeliveryVersion,
} from "@/components/workspace/delivery-version-card";

/**
 * DeliveryVersionCard / DeliveryVersionList — Phase 3 of
 * the planning-workspace-v2 refactor (2026-08-30).
 *
 * Test matrix:
 *   - empty list                          — empty state
 *   - multiple versions                   — one card per version
 *   - approved version                    — "Final approved" badge
 *   - awaiting version                    — "Awaiting review" badge
 *   - changes_requested content status    — "Changes requested" badge
 *   - client viewer                       — designer note redacted
 *   - safe external links                 — target=_blank, rel=noreferrer
 *   - thumbnail strip                     — one tile per link
 *   - approve action                      — fires onApprove
 *   - approve disabled while pending      — button disabled
 */

const baseVersion = (overrides: Partial<DeliveryVersion> = {}): DeliveryVersion => ({
  id: "v-1",
  versionNumber: 1,
  description: "First cut of the hero",
  designerNote: "Updated CTA per review feedback.",
  submittedAt: "2026-08-25T10:00:00.000Z",
  isFinalApproved: false,
  submittedBy: { id: "u-1", name: "Ghaleb" },
  links: [
    {
      id: "l-1",
      provider: "google_drive",
      label: "Final carousel — 5 slides",
      url: "https://drive.google.com/file/d/abc123",
      isPreview: false,
    },
  ],
  ...overrides,
});

describe("DeliveryVersionCard", () => {
  it("renders the empty state when there are no versions", () => {
    render(<DeliveryVersionList versions={[]} />);
    expect(screen.getByTestId("delivery-version-list-empty")).toBeInTheDocument();
  });

  it("renders one card per version, newest-first", () => {
    render(
      <DeliveryVersionList
        versions={[
          baseVersion({ id: "v-1", versionNumber: 1 }),
          baseVersion({ id: "v-2", versionNumber: 2, isFinalApproved: true }),
        ]}
      />,
    );
    expect(screen.getByTestId("delivery-version-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("delivery-version-card-2")).toBeInTheDocument();
  });

  it("shows the 'Final approved' badge for approved versions", () => {
    render(
      <DeliveryVersionList
        versions={[baseVersion({ isFinalApproved: true })]}
        contentStatus="ready_to_publish"
      />,
    );
    expect(screen.getByTestId("delivery-version-status-approved")).toHaveTextContent(
      /Final approved/i,
    );
  });

  it("shows the 'Awaiting review' badge for unapproved versions by default", () => {
    render(<DeliveryVersionList versions={[baseVersion()]} />);
    expect(screen.getByTestId("delivery-version-status-awaiting")).toHaveTextContent(
      /Awaiting review/i,
    );
  });

  it("shows the 'Changes requested' badge when contentStatus is changes_requested", () => {
    render(<DeliveryVersionList versions={[baseVersion()]} contentStatus="changes_requested" />);
    expect(screen.getByTestId("delivery-version-status-changes-requested")).toHaveTextContent(
      /Changes requested/i,
    );
  });

  it("hides the designer note for client viewers", () => {
    render(
      <DeliveryVersionList
        versions={[baseVersion({ designerNote: "internal note here" })]}
        viewerIsClient
      />,
    );
    expect(screen.queryByText(/internal note here/i)).not.toBeInTheDocument();
  });

  it("renders external links with target=_blank and rel=noreferrer", () => {
    render(<DeliveryVersionList versions={[baseVersion()]} />);
    const link = screen.getByTestId("delivery-version-open-assets-1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders one thumbnail tile per link", () => {
    render(
      <DeliveryVersionList
        versions={[
          baseVersion({
            links: [
              {
                id: "l-1",
                provider: "google_drive",
                label: "File 1",
                url: "https://example.com/file1.png",
                isPreview: false,
              },
              {
                id: "l-2",
                provider: "figma",
                label: "File 2",
                url: "https://example.com/file2.png",
                isPreview: false,
              },
            ],
          }),
        ]}
      />,
    );
    const strip = screen.getByTestId("delivery-version-thumbnails-1");
    expect(within(strip).getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders an <img> for direct image URLs and a provider-icon tile for share pages", () => {
    render(
      <DeliveryVersionList
        versions={[
          baseVersion({
            links: [
              {
                id: "l-1",
                provider: "google_drive",
                label: "Hero",
                url: "https://cdn.example.com/hero.png",
                isPreview: false,
              },
              {
                id: "l-2",
                provider: "google_drive",
                label: "Share page",
                url: "https://drive.google.com/file/d/abc123",
                isPreview: false,
              },
            ],
          }),
        ]}
      />,
    );
    // direct image → <img> rendered
    expect(
      screen.getByTestId("delivery-version-thumbnail-1-l-1").querySelector("img"),
    ).toBeInTheDocument();
    // share page → no <img>, falls back to provider icon
    expect(
      screen.getByTestId("delivery-version-thumbnail-1-l-2").querySelector("img"),
    ).not.toBeInTheDocument();
  });

  it("renders an Approve button when showApprove is set and the version is not approved", () => {
    render(<DeliveryVersionList versions={[baseVersion()]} showApprove onApprove={vi.fn()} />);
    expect(screen.getByTestId("delivery-version-approve-1")).toBeInTheDocument();
  });

  it("hides the Approve button when the version is already final approved", () => {
    render(
      <DeliveryVersionList
        versions={[baseVersion({ isFinalApproved: true })]}
        showApprove
        onApprove={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("delivery-version-approve-1")).not.toBeInTheDocument();
  });

  it("disables the Approve button while the action is pending", () => {
    render(
      <DeliveryVersionList
        versions={[baseVersion({ id: "v-1" })]}
        showApprove
        onApprove={vi.fn()}
        approvingVersionId="v-1"
      />,
    );
    const btn = screen.getByTestId("delivery-version-approve-1") as HTMLButtonElement;
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(/Approving/i);
  });

  it("fires onApprove when the Approve button is clicked", () => {
    const onApprove = vi.fn();
    render(<DeliveryVersionList versions={[baseVersion()]} showApprove onApprove={onApprove} />);
    fireEvent.click(screen.getByTestId("delivery-version-approve-1"));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("renders the V1/V2 number as a prominent pill", () => {
    render(<DeliveryVersionList versions={[baseVersion({ versionNumber: 2 })]} />);
    const pill = screen.getByTestId("delivery-version-number-2");
    expect(pill).toHaveTextContent("V2");
  });

  it("expands the details disclosure to show the full link list", async () => {
    const user = userEvent.setup();
    render(<DeliveryVersionList versions={[baseVersion()]} />);
    // The toggle is collapsed by default (since not approved).
    const toggle = screen.getByTestId("delivery-version-toggle-1");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    // The links <ul> now has a different testid (delivery-version-links-N)
    expect(screen.getByTestId("delivery-version-links-1")).toBeInTheDocument();
  });
});

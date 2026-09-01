import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ReviewRow, type ReviewRowItem } from "@/components/workspace/review-row";
import { tFor } from "@/messages";

const t = tFor("en");

const baseItem: ReviewRowItem = {
  id: "r-1",
  contentId: "c-1",
  title: "Q3 launch teaser",
  format: "short_form_video",
  requestedAt: new Date("2026-08-10T10:00:00.000Z"),
  dueAt: new Date("2026-08-25T10:00:00.000Z"),
  gate: "creative_internal",
};

function renderRow(
  overrides: Partial<ReviewRowItem> = {},
  nowMs = Date.parse("2026-08-15T00:00:00.000Z"),
) {
  return render(
    <ul>
      <ReviewRow item={{ ...baseItem, ...overrides }} workspaceSlug="acme" nowMs={nowMs} t={t} />
    </ul>,
  );
}

describe("ReviewRow", () => {
  it("renders the title and the formatted format label", () => {
    renderRow();
    expect(screen.getByText("Q3 launch teaser")).toBeInTheDocument();
    expect(screen.getByText(/Short Form Video/)).toBeInTheDocument();
  });

  it("renders the requested date in the meta line", () => {
    renderRow();
    expect(screen.getByText(/Requested/)).toBeInTheDocument();
  });

  it("renders the due date when dueAt is provided", () => {
    renderRow();
    expect(screen.getByText(/due/)).toBeInTheDocument();
  });

  it("hides the due segment when dueAt is null", () => {
    renderRow({ dueAt: null });
    expect(screen.queryByText(/due/)).toBeNull();
  });

  it("builds the row href from the workspace slug and contentId", () => {
    renderRow();
    const link = screen.getByRole("link", { name: /Q3 launch teaser/i });
    expect(link).toHaveAttribute("href", "/app/w/acme/planning/c-1");
  });

  it("uses the data-testid with the request id", () => {
    renderRow({ id: "abc-123" });
    const link = screen.getByTestId("review-row-abc-123");
    expect(link).toBeInTheDocument();
  });

  it("uses the curated catalog label for the gate badge", () => {
    renderRow({ gate: "creative_client" });
    // Phase 6b: the row's gate badge uses the catalog's
    // `reviews.gateCreativeClient` label, which matches the
    // filter dropdown's curated value (was inconsistent with
    // `humanize(gate)`'s "Creative Client" in v1).
    expect(screen.getByText("Creative (client)")).toBeInTheDocument();
  });

  it("marks the row as overdue when dueAt is in the past", () => {
    const nowMs = Date.parse("2026-09-01T00:00:00.000Z");
    const { container } = renderRow({}, nowMs);
    const badge = container.querySelector('[class*="border-danger"]');
    expect(badge).not.toBeNull();
  });

  it("does not mark the row as overdue when dueAt is in the future", () => {
    const nowMs = Date.parse("2026-08-15T00:00:00.000Z");
    const { container } = renderRow({}, nowMs);
    const badge = container.querySelector('[class*="border-danger"]');
    expect(badge).toBeNull();
  });

  it("does not mark the row as overdue when dueAt is null", () => {
    const { container } = renderRow({ dueAt: null });
    const badge = container.querySelector('[class*="border-danger"]');
    expect(badge).toBeNull();
  });

  it("accepts a string date for requestedAt and dueAt", () => {
    renderRow({
      requestedAt: "2026-08-10T10:00:00.000Z",
      dueAt: "2026-08-25T10:00:00.000Z",
    });
    const link = screen.getByRole("link", { name: /Q3 launch teaser/i });
    expect(within(link).getByText(/due/)).toBeInTheDocument();
  });

  it("uses the default info variant for non-overdue items", () => {
    const nowMs = Date.parse("2026-08-15T00:00:00.000Z");
    const { container } = renderRow({}, nowMs);
    const infoBadge = container.querySelector('[class*="border-info"]');
    expect(infoBadge).not.toBeNull();
  });

  it("forwards an alternate overdueVariant to the badge", () => {
    const nowMs = Date.parse("2026-09-01T00:00:00.000Z");
    const { container } = render(
      <ul>
        <ReviewRow
          item={baseItem}
          workspaceSlug="acme"
          nowMs={nowMs}
          overdueVariant="warning"
          t={t}
        />
      </ul>,
    );
    // The Badge component for "warning" uses the text-warning class
    // (and border-warning/20). Just check the text-warning token.
    const warningBadge = container.querySelector('[class*="text-warning"]');
    expect(warningBadge).not.toBeNull();
    // And the danger one should be absent when we override to warning.
    const dangerBadge = container.querySelector('[class*="text-danger"]');
    expect(dangerBadge).toBeNull();
  });
});

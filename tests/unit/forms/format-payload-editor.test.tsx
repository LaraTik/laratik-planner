import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormatPayloadEditor } from "@/components/forms/format-payload-editor";
import { tFor } from "@/messages";

vi.mock("@/components/forms/per-field-ai-suggest", () => ({
  PerFieldAiSuggest: () => null,
}));

vi.mock("@/app/(app)/app/w/[slug]/planning/actions", () => ({
  updateFormatPayloadAction: vi.fn(),
}));

/**
 * Phase 5b (2026-09-01): the editor now receives a bound
 * translator via the `t` prop. The tests bind `tFor("en")`
 * so the assertions lock the English values the catalog
 * ships with — a future catalog refactor that drops a key
 * trips these tests.
 */
const t = tFor("en");

const STATIC_POST_PAYLOAD = {
  schemaVersion: 1,
  caption: "Spring drop is here.",
  hook: "Three days, then we drop.",
};

describe("FormatPayloadEditor", () => {
  it("renders the body hidden by default with the right completion count", () => {
    render(
      <FormatPayloadEditor
        t={t}
        workspaceSlug="acme"
        contentItemId="ci-1"
        format="static_post"
        initial={STATIC_POST_PAYLOAD}
        editable
        locale="en"
        aiEnabled={false}
      />,
    );
    // Body is hidden until the user clicks Show.
    expect(screen.queryByTestId("format-payload-editor-body")).toBeNull();
    // Header shows the total completion count and the essential count.
    expect(screen.getByTestId("format-payload-completion-total")).toHaveTextContent(
      "2 / 13 total filled",
    );
    expect(screen.getByTestId("format-payload-completion-essential")).toHaveTextContent(
      "2 / 6 essential",
    );
  });

  it("renders essential fields first when the body is open", async () => {
    const user = userEvent.setup();
    render(
      <FormatPayloadEditor
        t={t}
        workspaceSlug="acme"
        contentItemId="ci-1"
        format="static_post"
        initial={STATIC_POST_PAYLOAD}
        editable
        locale="en"
        aiEnabled={false}
      />,
    );
    await user.click(screen.getByTestId("format-payload-toggle"));
    const body = await screen.findByTestId("format-payload-editor-body");
    // Essential fields are present.
    const essentialTier = within(body).getByTestId("essential-tier");
    expect(within(essentialTier).getByTestId("essential-field-caption")).toBeInTheDocument();
    expect(within(essentialTier).getByTestId("essential-field-hook")).toBeInTheDocument();
    // Advanced fields are NOT rendered in the essential tier.
    expect(within(essentialTier).queryByTestId("essential-field-visualDirection")).toBeNull();
  });

  it("renders the advanced disclosure with the right count", async () => {
    render(
      <FormatPayloadEditor
        t={t}
        workspaceSlug="acme"
        contentItemId="ci-1"
        format="static_post"
        initial={STATIC_POST_PAYLOAD}
        editable
        locale="en"
        aiEnabled={false}
      />,
    );
    await userEvent.click(screen.getByTestId("format-payload-toggle"));
    const disclosure = screen.getByTestId("advanced-disclosure");
    expect(disclosure).toHaveAttribute("data-open", "false");
    // 5 advanced fields inside the disclosure; the
    // `objective` + `audience` pair is rendered separately
    // in the essential tier (it has a dedicated grid pair
    // component, not a single-field renderer).
    expect(within(disclosure).getByTestId("advanced-disclosure-show")).toHaveTextContent(
      "Advanced details (5)",
    );
  });

  it("renders format-specific essential fields for short_form_video", async () => {
    render(
      <FormatPayloadEditor
        t={t}
        workspaceSlug="acme"
        contentItemId="ci-1"
        format="short_form_video"
        initial={{ schemaVersion: 1 }}
        editable
        locale="en"
        aiEnabled={false}
      />,
    );
    await userEvent.click(screen.getByTestId("format-payload-toggle"));
    const essentialTier = screen.getByTestId("essential-tier");
    // The short-form video essentials include the format-specific fields.
    expect(within(essentialTier).getByTestId("essential-field-ratio")).toBeInTheDocument();
    expect(
      within(essentialTier).getByTestId("essential-field-durationSeconds"),
    ).toBeInTheDocument();
    expect(within(essentialTier).getByTestId("essential-field-scenes")).toBeInTheDocument();
    expect(within(essentialTier).getByTestId("essential-field-onScreenText")).toBeInTheDocument();
  });

  it("renders carousel-specific essentials including the slide outline", async () => {
    render(
      <FormatPayloadEditor
        t={t}
        workspaceSlug="acme"
        contentItemId="ci-1"
        format="carousel"
        initial={{ schemaVersion: 1 }}
        editable
        locale="en"
        aiEnabled={false}
      />,
    );
    await userEvent.click(screen.getByTestId("format-payload-toggle"));
    const essentialTier = screen.getByTestId("essential-tier");
    expect(within(essentialTier).getByTestId("essential-field-slideCount")).toBeInTheDocument();
    expect(within(essentialTier).getByTestId("essential-field-slideOutline")).toBeInTheDocument();
  });

  it("does not render a save button when read-only", async () => {
    render(
      <FormatPayloadEditor
        t={t}
        workspaceSlug="acme"
        contentItemId="ci-1"
        format="static_post"
        initial={STATIC_POST_PAYLOAD}
        editable={false}
        locale="en"
        aiEnabled={false}
      />,
    );
    await userEvent.click(screen.getByTestId("format-payload-toggle"));
    // The save button is only rendered when editable.
    expect(screen.queryByText(/Save creative details/i)).toBeNull();
  });

  it("shows a read-only notice when read-only", async () => {
    render(
      <FormatPayloadEditor
        t={t}
        workspaceSlug="acme"
        contentItemId="ci-1"
        format="static_post"
        initial={STATIC_POST_PAYLOAD}
        editable={false}
        locale="en"
        aiEnabled={false}
      />,
    );
    await userEvent.click(screen.getByTestId("format-payload-toggle"));
    expect(screen.getByText(/Read-only/i)).toBeInTheDocument();
  });
});

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
      "2 / 9 total filled",
    );
    expect(screen.getByTestId("format-payload-completion-essential")).toHaveTextContent(
      "1 / 9 essential",
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
    expect(within(body).getByText("Core creative fields")).toBeInTheDocument();
    // Essential fields are present.
    const essentialTier = within(body).getByTestId("essential-tier");
    expect(within(essentialTier).getByTestId("essential-field-caption")).toBeInTheDocument();
    expect(
      within(essentialTier).getByTestId("essential-field-visualDirection"),
    ).toBeInTheDocument();
    expect(
      within(essentialTier).getByTestId("essential-field-requiredImageLinks"),
    ).toBeInTheDocument();
    expect(within(essentialTier).queryByTestId("essential-field-hook")).toBeNull();
  });

  it("does not create a second advanced tier for the workbook fields", async () => {
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
    expect(screen.queryByTestId("advanced-disclosure")).toBeNull();
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
    expect(
      within(essentialTier).getByTestId("essential-field-visualDirection"),
    ).toBeInTheDocument();
    expect(within(essentialTier).getByTestId("essential-field-onImageText")).toBeInTheDocument();
  });

  it("renders carousel workbook essentials without an inferred slide outline", async () => {
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
    expect(
      within(essentialTier).getByTestId("essential-field-requiredImageLinks"),
    ).toBeInTheDocument();
    expect(within(essentialTier).queryByTestId("essential-field-slideOutline")).toBeNull();
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

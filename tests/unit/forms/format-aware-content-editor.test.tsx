import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FormatAwareContentEditor } from "@/components/forms/format-aware-content-editor";
import { tFor } from "@/messages";

vi.mock("@/components/forms/per-field-ai-suggest", () => ({
  PerFieldAiSuggest: () => null,
}));

vi.mock("@/app/(app)/app/w/[slug]/planning/actions", () => ({
  updateFormatPayloadAction: vi.fn(),
}));

/**
 * Phase 2 of the planning-workspace-v2 refactor (2026-08-30):
 * the Content tab now renders a sectioned editor with
 * Strategy / Copy / Creative groups. Each format gets
 * its own section composition; the data model is unchanged.
 *
 * Phase 5b (2026-09-01): the editor now resolves its
 * section title / description / field label through the
 * active message catalog. The tests bind `tFor("en")` so the
 * assertions lock the English values that the catalog ships
 * with — a future catalog refactor that drops a key trips
 * these tests.
 *
 * These tests pin the structural contract — they don't
 * exercise the per-field renderers (those are covered
 * by `format-payload-editor.test.tsx`).
 */

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const t = tFor("en");
const baseProps = {
  t,
  workspaceSlug: "acme",
  contentItemId: "ci-1",
  initial: { schemaVersion: 1 as const },
  editable: true,
  locale: "en",
  aiEnabled: false,
};

describe("FormatAwareContentEditor", () => {
  it("renders Strategy and Creative sections without a duplicate Copy surface for static_post", () => {
    render(<FormatAwareContentEditor {...baseProps} format="static_post" />);
    expect(screen.getByTestId("format-section-strategy")).toBeInTheDocument();
    expect(screen.queryByTestId("format-section-copy")).not.toBeInTheDocument();
    expect(screen.getByTestId("format-section-creative")).toBeInTheDocument();
  });

  it("renders Strategy and Creative sections for carousel", () => {
    render(<FormatAwareContentEditor {...baseProps} format="carousel" />);
    expect(screen.getByTestId("format-section-strategy")).toBeInTheDocument();
    expect(screen.queryByTestId("format-section-copy")).not.toBeInTheDocument();
    expect(screen.getByTestId("format-section-creative")).toBeInTheDocument();
  });

  it("renders Strategy and Creative direction sections for short_form_video (Reel)", () => {
    render(<FormatAwareContentEditor {...baseProps} format="short_form_video" />);
    expect(screen.getByTestId("format-section-strategy")).toBeInTheDocument();
    expect(screen.queryByTestId("format-section-copy")).not.toBeInTheDocument();
    expect(screen.getByTestId("format-section-creative")).toBeInTheDocument();
  });

  it("mounts the slide outline as a first-class array manager for carousel", () => {
    render(<FormatAwareContentEditor {...baseProps} format="carousel" />);
    // The NavigableArrayField renders with fieldKey="slideOutline".
    expect(screen.getByTestId("format-section-creative-slideOutline")).toBeInTheDocument();
    // The chip-strip / add affordance from NavigableArrayField is present.
    expect(screen.getByTestId("navigable-array-slider-slideOutline")).toBeInTheDocument();
  });

  it("mounts scenes as a first-class array manager for short_form_video", () => {
    render(<FormatAwareContentEditor {...baseProps} format="short_form_video" />);
    expect(screen.getByTestId("format-section-creative-scenes")).toBeInTheDocument();
    expect(screen.getByTestId("navigable-array-slider-scenes")).toBeInTheDocument();
  });

  it("hides the Save button in read-only mode and shows the read-only notice", () => {
    render(<FormatAwareContentEditor {...baseProps} editable={false} format="static_post" />);
    expect(screen.queryByTestId("format-aware-save")).not.toBeInTheDocument();
    expect(screen.getByText(/Read-only/i)).toBeInTheDocument();
  });

  it("renders the Save button in editable mode", () => {
    render(<FormatAwareContentEditor {...baseProps} format="static_post" />);
    expect(screen.getByTestId("format-aware-save")).toBeInTheDocument();
  });

  it("uses the humanised format name in the editor title", () => {
    render(<FormatAwareContentEditor {...baseProps} format="short_form_video" />);
    // humanFormat("short_form_video") → "Short Form Video"
    expect(screen.getByText(/Short Form Video content/i)).toBeInTheDocument();
  });

  it("keeps audience copy out of Content while preserving the format save contract", () => {
    // Phase 1 of the planning-detail refactor (2026-08-30)
    // used a 220-char single-line TextFieldRenderer for
    // `caption` and `firstComment`. The new CaptionFieldRenderer
    // wires the shared 8-row / 2200-char CaptionField so the
    // Content tab's editing experience matches the Messages
    // tab and the per-platform publish form.
    render(
      <FormatAwareContentEditor
        {...baseProps}
        format="static_post"
        initial={{ schemaVersion: 1, caption: "Hello world" }}
      />,
    );
    expect(screen.queryByTestId("field-caption-caption")).not.toBeInTheDocument();
    // The `format` hidden input is required by the
    // `updateFormatPayloadFormSchema` Zod schema; before the
    // fix, every save failed with a `format` field error.
    const saveForm = document.querySelector("form") as HTMLFormElement | null;
    expect(saveForm).toBeInTheDocument();
    const formatInput = saveForm?.querySelector('input[name="format"]');
    expect(formatInput).toBeInTheDocument();
    expect(formatInput?.getAttribute("value")).toBe("static_post");
  });
});

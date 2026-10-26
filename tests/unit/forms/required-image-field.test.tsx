import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { FormatAwareContentEditor } from "@/components/forms/format-aware-content-editor";
import { tFor } from "@/messages";

vi.mock("@/components/forms/per-field-ai-suggest", () => ({
  PerFieldAiSuggest: () => null,
}));

const saveAction = vi.fn(async () => ({}));

/**
 * "Required image / design reference" is ONE field with two inputs: the
 * planner can paste a URL or hand the designer the file itself.
 *
 * These tests lock that the field renders both halves as one section, that
 * an uploaded reference survives a round trip through the payload, and that
 * the upload affordance disappears when the field is read-only (a designer
 * editing a post they do not own).
 */

const t = tFor("en");
const baseProps = {
  t,
  saveAction,
  contentItemId: "ci-1",
  workspaceId: "ws-1",
  editable: true,
  locale: "en",
  aiEnabled: false,
};

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Required image / design reference field", () => {
  it("shows the upload affordance and the link list as one section", () => {
    render(
      <FormatAwareContentEditor
        {...baseProps}
        format="static_post"
        initial={{ schemaVersion: 1, requiredImageLinks: ["https://cdn.example.test/a.png"] }}
      />,
    );

    const field = screen.getByTestId("field-requiredImageLinks");
    expect(within(field).getByText("Required image / design reference")).toBeInTheDocument();
    expect(within(field).getByText("Uploaded images")).toBeInTheDocument();
    expect(within(field).getByText("Image links")).toBeInTheDocument();

    // The URL list keeps its value, and the upload half is present.
    expect(screen.getByLabelText("Image links")).toHaveValue("https://cdn.example.test/a.png");
    expect(within(field).getByLabelText(/choose files/i)).toBeInTheDocument();
  });

  it("renders the uploaded references that are already on the payload", () => {
    render(
      <FormatAwareContentEditor
        {...baseProps}
        format="static_post"
        initial={{
          schemaVersion: 1,
          requiredImageUploads: [
            { id: "3f1b7a52-0c4e-4a2b-9f2d-8a1c5e7b4d10", title: "hero-reference" },
          ],
        }}
      />,
    );

    const field = screen.getByTestId("field-requiredImageLinks");
    expect(within(field).getByAltText("hero-reference")).toBeInTheDocument();
    expect(within(field).getByText("hero-reference")).toBeInTheDocument();
    expect(
      within(field).getByRole("button", { name: /remove hero-reference/i }),
    ).toBeInTheDocument();
  });

  it("hides the upload affordance when the field is read-only", () => {
    render(
      <FormatAwareContentEditor
        {...baseProps}
        format="static_post"
        editable={false}
        initial={{ schemaVersion: 1 }}
      />,
    );

    const field = screen.getByTestId("field-requiredImageLinks");
    expect(within(field).queryByLabelText(/choose files/i)).not.toBeInTheDocument();
    // The link list is still visible, read-only.
    expect(screen.getByLabelText("Image links")).toHaveAttribute("readonly");
  });

  it("offers the field on every workbook format that carries it", () => {
    for (const format of ["static_post", "carousel", "story", "short_form_video"] as const) {
      const { unmount } = render(
        <FormatAwareContentEditor {...baseProps} format={format} initial={{ schemaVersion: 1 }} />,
      );
      expect(screen.getByTestId("field-requiredImageLinks"), format).toBeInTheDocument();
      unmount();
    }
  });
});

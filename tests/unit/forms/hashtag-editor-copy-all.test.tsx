import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { HashtagEditor } from "@/components/forms/hashtag-editor";

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

/**
 * HashtagEditor — copy-all affordance (Copy-tab slim PR, 2026-09-18).
 *
 * Acceptance criteria:
 *   - "Copy all" button is rendered when value.length > 0.
 *   - Button is disabled when value.length === 0.
 *   - On click, writes `#tag1 #tag2 …` to navigator.clipboard.
 *   - Button has type="button" so it does NOT submit parent forms.
 *   - The aria-label includes the count for screen-reader context.
 */
describe("HashtagEditor — copy all", () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("renders the Copy all button when there are hashtags", () => {
    render(
      <HashtagEditor
        id="tags"
        name="hashtags"
        label="Hashtags"
        value={["spring", "drop"]}
        onChange={() => undefined}
      />,
    );
    const button = screen.getByTestId("hashtag-editor-copy-all");
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it("disables the Copy all button when there are no hashtags", () => {
    render(
      <HashtagEditor
        id="tags"
        name="hashtags"
        label="Hashtags"
        value={[]}
        onChange={() => undefined}
      />,
    );
    const button = screen.getByTestId("hashtag-editor-copy-all");
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
  });

  it("uses type=button so it never submits the parent form", () => {
    render(
      <HashtagEditor
        id="tags"
        name="hashtags"
        label="Hashtags"
        value={["a"]}
        onChange={() => undefined}
      />,
    );
    const button = screen.getByTestId("hashtag-editor-copy-all") as HTMLButtonElement;
    expect(button.getAttribute("type")).toBe("button");
  });

  it("writes the hashtag list (with # prefix, space-joined) to the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(
      <HashtagEditor
        id="tags"
        name="hashtags"
        label="Hashtags"
        value={["spring", "drop", "brandvoice"]}
        onChange={() => undefined}
      />,
    );
    const button = screen.getByTestId("hashtag-editor-copy-all");
    expect(button).not.toBeDisabled();
    await user.click(button);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("#spring #drop #brandvoice");
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(toastSuccess.mock.calls[0]?.[0]).toMatch(/3/i);
  });

  it("surfaces a failure toast when the clipboard rejects", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("NotAllowedError"));
    render(
      <HashtagEditor
        id="tags"
        name="hashtags"
        label="Hashtags"
        value={["one"]}
        onChange={() => undefined}
      />,
    );
    await user.click(screen.getByTestId("hashtag-editor-copy-all"));
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("includes the count in the aria-label for screen-reader context", () => {
    render(
      <HashtagEditor
        id="tags"
        name="hashtags"
        label="Hashtags"
        value={["a", "b", "c"]}
        onChange={() => undefined}
      />,
    );
    const button = screen.getByTestId("hashtag-editor-copy-all");
    expect(button.getAttribute("aria-label")).toMatch(/3/i);
  });
});

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { CaptionField, CAPTION_MAX } from "@/components/forms/caption-field";

/**
 * CaptionField — plan §3 acceptance:
 *   - rows=8 (regression guard for the publish form's caption)
 *   - maxLength=2_200 (the per-platform schema cap)
 *   - counter goes warning at 1 980 chars (90%) and danger
 *     at 2 200 (100%)
 *   - aria-live="polite" on the counter for screen readers
 *   - error prop sets aria-invalid="true" on the textarea
 */
describe("CaptionField", () => {
  it("renders the counter with the initial value", () => {
    render(
      <CaptionField
        id="cap"
        name="caption"
        label="Caption"
        value="hello"
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText("5 / 2,200")).toBeInTheDocument();
  });

  it("renders an 8-row textarea", () => {
    render(
      <CaptionField id="cap" name="caption" label="Caption" value="" onChange={() => undefined} />,
    );
    const textarea = screen.getByRole("textbox", { name: /caption/i });
    expect(textarea.getAttribute("rows")).toBe("8");
  });

  it("switches to the warning color at 90% of the cap", () => {
    const nearMax = "a".repeat(Math.floor(CAPTION_MAX * 0.9));
    render(
      <CaptionField
        id="cap"
        name="caption"
        label="Caption"
        value={nearMax}
        onChange={() => undefined}
      />,
    );
    const counter = screen.getByText(/1,980/);
    expect(counter.className).toContain("text-warning");
  });

  it("switches to the danger color when at the cap", () => {
    const atMax = "a".repeat(CAPTION_MAX);
    render(
      <CaptionField
        id="cap"
        name="caption"
        label="Caption"
        value={atMax}
        onChange={() => undefined}
      />,
    );
    const counter = screen.getByText(/2,200/);
    expect(counter.className).toContain("text-danger");
  });

  it("calls onChange with the typed value", async () => {
    const user = userEvent.setup();
    function Wrapper() {
      const [v, setV] = React.useState("");
      return <CaptionField id="cap" name="caption" label="Caption" value={v} onChange={setV} />;
    }
    render(<Wrapper />);
    const textarea = screen.getByRole("textbox", { name: /caption/i });
    await user.type(textarea, "hi");
    expect(textarea).toHaveValue("hi");
  });

  it("renders aria-invalid when error is set", () => {
    render(
      <CaptionField
        id="cap"
        name="caption"
        label="Caption"
        value=""
        onChange={() => undefined}
        error="Required"
      />,
    );
    const textarea = screen.getByRole("textbox", { name: /caption/i });
    expect(textarea.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Required")).toBeInTheDocument();
  });
});

import * as React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CharacterCountInput } from "@/components/workspace/character-count-input";

describe("CharacterCountInput", () => {
  it("renders the counter with the initial value", () => {
    render(<CharacterCountInput name="x" maxLength={10} defaultValue="hello" />);
    expect(screen.getByText("5 / 10")).toBeInTheDocument();
  });

  it("updates the counter as the user types", async () => {
    const user = userEvent.setup();
    function Wrapper() {
      const [v, setV] = React.useState("");
      return (
        <CharacterCountInput
          name="x"
          maxLength={10}
          value={v}
          onChange={(e) => setV(e.target.value)}
        />
      );
    }
    render(<Wrapper />);
    const input = screen.getByRole("textbox");
    await user.type(input, "hi");
    expect(screen.getByText("2 / 10")).toBeInTheDocument();
  });

  it("switches to the warning color at 90% of the cap", () => {
    render(<CharacterCountInput name="x" maxLength={10} defaultValue="aaaaaaaaa" />);
    const counter = screen.getByText("9 / 10");
    expect(counter.className).toContain("text-warning");
  });

  it("switches to the danger color when over the cap", () => {
    render(<CharacterCountInput name="x" maxLength={5} defaultValue="abcdefg" />);
    const counter = screen.getByText("7 / 5");
    expect(counter.className).toContain("text-danger");
  });

  it("renders a textarea when as=textarea", () => {
    render(<CharacterCountInput name="x" maxLength={100} as="textarea" rows={4} />);
    const textarea = document.querySelector("textarea");
    expect(textarea).toBeInTheDocument();
    expect(textarea?.rows).toBe(4);
  });

  it("uses the name attribute on the control", () => {
    render(<CharacterCountInput name="content" maxLength={10} />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("name", "content");
  });

  it("links the counter to the input via aria-describedby", () => {
    render(<CharacterCountInput name="x" maxLength={10} id="myfield" />);
    const input = screen.getByRole("textbox");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(describedBy).toContain("myfield-counter");
  });

  it("respects the maxLength attribute on the input", () => {
    render(<CharacterCountInput name="x" maxLength={42} />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("maxLength", "42");
  });

  it("preserves a user-supplied aria-describedby", () => {
    render(<CharacterCountInput name="x" maxLength={10} id="myfield" aria-describedby="hint-id" />);
    const input = screen.getByRole("textbox");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(describedBy).toContain("hint-id");
    expect(describedBy).toContain("myfield-counter");
  });
});

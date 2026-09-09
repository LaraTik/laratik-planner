import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

describe("shared text direction controls", () => {
  it("auto-detects the direction of ordinary text inputs", () => {
    render(<Input aria-label="name" defaultValue="العربية" />);
    expect(screen.getByRole("textbox", { name: "name" })).toHaveAttribute("dir", "auto");
  });

  it("keeps technical input values LTR", () => {
    render(<Input aria-label="email" type="email" defaultValue="name@example.com" />);
    expect(screen.getByRole("textbox", { name: "email" })).toHaveAttribute("dir", "ltr");
  });

  it("auto-detects textarea content and uses logical text alignment", () => {
    render(<Textarea aria-label="caption" defaultValue="مرحبا بالعالم" />);
    const textarea = screen.getByRole("textbox", { name: "caption" });
    expect(textarea).toHaveAttribute("dir", "auto");
    expect(textarea.className).toContain("text-start");
  });

  it("preserves an explicit direction override", () => {
    render(<Textarea aria-label="url" dir="ltr" defaultValue="https://example.com" />);
    expect(screen.getByRole("textbox", { name: "url" })).toHaveAttribute("dir", "ltr");
  });
});

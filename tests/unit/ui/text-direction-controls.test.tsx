import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DirAwareInput, DirAwareTextarea } from "@/components/forms/dir-aware-textarea";

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

  it("aligns Arabic content at the RTL inline start, independent of interface locale", () => {
    render(
      <DirAwareInput aria-label="title" value="العربية" locale="en" onChange={() => undefined} />,
    );
    const input = screen.getByRole("textbox", { name: "title" });
    expect(input).toHaveAttribute("dir", "rtl");
    expect(input.className).toContain("text-start");
    expect(input.className).not.toContain("text-end");
  });

  it("aligns English content at the LTR inline start, independent of interface locale", () => {
    render(
      <DirAwareTextarea
        aria-label="brief"
        value="English content"
        locale="ar"
        onChange={() => undefined}
      />,
    );
    const textarea = screen.getByRole("textbox", { name: "brief" });
    expect(textarea).toHaveAttribute("dir", "ltr");
    expect(textarea.className).toContain("text-start");
    expect(textarea.className).not.toContain("text-end");
  });
});

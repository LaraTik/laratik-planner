import { describe, expect, it } from "vitest";
import { safeHref } from "@/lib/utils/safe-href";

/**
 * `safeHref` is the second line of defence against `javascript:` and
 * other unsafe schemes that might reach the brand-kit page through
 * older DB rows (pre-HTTPS-check-constraint) or a future refactor.
 * The tests pin the contract.
 */
describe("safeHref", () => {
  it("passes https URLs through unchanged", () => {
    expect(safeHref("https://figma.com/file/abc")).toEqual({
      href: "https://figma.com/file/abc",
    });
  });

  it("flags http URLs with a warning so the UI can show an icon", () => {
    expect(safeHref("http://example.com/x")).toEqual({
      href: "http://example.com/x",
      warning: "insecure",
    });
  });

  it("passes mailto URLs through", () => {
    expect(safeHref("mailto:hi@example.com")).toEqual({
      href: "mailto:hi@example.com",
    });
  });

  it("neutralises javascript: URLs to a harmless anchor", () => {
    expect(safeHref("javascript:alert(1)")).toEqual({ href: "#" });
  });

  it("neutralises data: URLs", () => {
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toEqual({ href: "#" });
  });

  it("neutralises vbscript: URLs", () => {
    expect(safeHref("vbscript:msgbox(1)")).toEqual({ href: "#" });
  });

  it("trims surrounding whitespace", () => {
    expect(safeHref("  https://x.com/y  ")).toEqual({ href: "https://x.com/y" });
  });

  it("is case-insensitive about the scheme", () => {
    expect(safeHref("JAVASCRIPT:alert(1)")).toEqual({ href: "#" });
    expect(safeHref("HTTPS://x.com")).toEqual({ href: "HTTPS://x.com" });
  });
});

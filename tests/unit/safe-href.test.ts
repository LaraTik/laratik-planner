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

  // TEST-15 (GAP-FULL-REVIEW-2026-08-25) — the `safeHref` signature
  // is `string` but the `brand_linked_resource.url` column is
  // `string | null` in the DB, and runtime callers from
  // template-string interpolation can pass anything. The current
  // contract is that a non-string throws on `.trim()`; the desired
  // contract is a safe fallback so the brand-kit page never 500s
  // on a stale row. The throws-branch is asserted below so the
  // current behavior is locked; the .todo() entries document the
  // target contract a follow-up PR should land (defensive guard
  // in safe-href.ts + flip the .todo()s to .it() with the matching
  // `{ href: "#" }` expectation).
  describe("defensive against non-string inputs (current contract: throws)", () => {
    it("throws on null input", () => {
      expect(() => safeHref(null as unknown as string)).toThrow();
    });
    it("throws on undefined input", () => {
      expect(() => safeHref(undefined as unknown as string)).toThrow();
    });
    it("throws on number input", () => {
      expect(() => safeHref(42 as unknown as string)).toThrow();
    });
    it("throws on object input", () => {
      expect(() => safeHref({} as unknown as string)).toThrow();
    });
  });

  describe("desired defensive contract (not yet implemented)", () => {
    it.todo("returns { href: '#' } on null input");
    it.todo("returns { href: '#' } on undefined input");
    it.todo("returns { href: '#' } on number input");
    it.todo("returns { href: '#' } on object input");
  });
});

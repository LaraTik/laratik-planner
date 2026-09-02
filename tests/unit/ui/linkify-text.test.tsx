import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import * as React from "react";
import { LinkifyText, linkifySegments } from "@/components/ui/linkify-text";

/**
 * LinkifyText — pin the auto-link contract:
 *   - http:// and https:// URLs become clickable <a> tags
 *   - Trailing punctuation (".", ",", ")", "]", "!", "?",
 *     ";", "،" U+060C, "。" U+3002) is stripped from the
 *     `href` but preserved in the visible text
 *   - mailto: / tel: / relative paths / bare hostnames are
 *     NOT auto-linked
 *   - The link has target="_blank" and rel="noopener
 *     noreferrer nofollow" (user-generated default)
 *   - The user can pass `userGenerated={false}` for curated
 *     surfaces to drop `nofollow`
 *   - Multiple URLs in one string all become links
 *   - Pure text (no URLs) renders unchanged
 *   - The component is a safe Server-renderable React
 *     component (no useState / useEffect needed)
 */
describe("linkifySegments", () => {
  it("returns an empty array for empty input", () => {
    expect(linkifySegments("")).toEqual([]);
  });

  it("returns a single text segment for plain text", () => {
    const segs = linkifySegments("Hello, world!");
    expect(segs).toHaveLength(1);
    expect(segs[0]?.type).toBe("text");
    expect(segs[0]?.value).toBe("Hello, world!");
  });

  it("turns a single URL into a link segment", () => {
    const segs = linkifySegments("See https://example.com for details");
    expect(segs).toHaveLength(3);
    expect(segs[0]?.type).toBe("text");
    expect(segs[0]?.value).toBe("See ");
    expect(segs[1]?.type).toBe("link");
    expect(segs[1]?.value).toBe("https://example.com");
    expect(segs[1]?.href).toBe("https://example.com");
    expect(segs[2]?.type).toBe("text");
    expect(segs[2]?.value).toBe(" for details");
  });

  it("strips trailing punctuation from the href but preserves it in the text", () => {
    const segs = linkifySegments("Visit https://example.com.");
    const link = segs.find((s) => s.type === "link");
    expect(link?.value).toBe("https://example.com");
    expect(link?.href).toBe("https://example.com");
    expect(link?.trailing).toBe(".");
  });

  it("handles multiple URLs in a single string", () => {
    const segs = linkifySegments(
      "Track at https://spotify.com/track/1 and YouTube at https://youtu.be/abc.",
    );
    const links = segs.filter((s) => s.type === "link");
    expect(links).toHaveLength(2);
    expect(links[0]?.value).toBe("https://spotify.com/track/1");
    expect(links[1]?.value).toBe("https://youtu.be/abc");
  });

  it("does NOT auto-link mailto: / tel: / relative paths / bare hostnames", () => {
    const input = "Email me at user@example.com or call tel:+1-555-0100 or visit example.com";
    const segs = linkifySegments(input);
    expect(segs.every((s) => s.type === "text")).toBe(true);
  });
});

describe("LinkifyText component", () => {
  it("renders plain text unchanged when there are no URLs", () => {
    render(<LinkifyText>Hello, world</LinkifyText>);
    expect(screen.getByText("Hello, world")).toBeInTheDocument();
    expect(screen.queryByTestId("linkify-link")).toBeNull();
  });

  it("renders a clickable link for a single URL", () => {
    render(<LinkifyText>See https://example.com here</LinkifyText>);
    const link = screen.getByTestId("linkify-link");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("https://example.com");
    expect(link.getAttribute("target")).toBe("_blank");
    // userGenerated defaults to true → rel includes nofollow
    expect(link.getAttribute("rel")).toBe("noopener noreferrer nofollow");
  });

  it("drops nofollow when the surface is not user-generated", () => {
    render(<LinkifyText userGenerated={false}>See https://example.com here</LinkifyText>);
    const link = screen.getByTestId("linkify-link");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("strips trailing punctuation from the href", () => {
    render(<LinkifyText>Check https://example.com.</LinkifyText>);
    const link = screen.getByTestId("linkify-link");
    expect(link.getAttribute("href")).toBe("https://example.com");
    // The full text "https://example.com." is still in the
    // document (the trailing period lives after the link).
    expect(link.parentElement?.textContent).toBe("Check https://example.com.");
  });
});

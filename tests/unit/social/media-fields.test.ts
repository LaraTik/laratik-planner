import { describe, expect, it } from "vitest";
import {
  blankToNull,
  httpsOrNull,
  httpsUrl,
  stringValue,
  truncateCaption,
} from "@/lib/social/media-fields";

describe("httpsOrNull", () => {
  it("accepts an absolute https URL", () => {
    expect(httpsOrNull("https://scontent.xx.fbcdn.net/v/t1.jpg")).toBe(
      "https://scontent.xx.fbcdn.net/v/t1.jpg",
    );
  });

  it("rejects non-https schemes so the value can never become an image source", () => {
    // A thumbnail URL is rendered as an `src`. http, javascript: and data:
    // must all fail here rather than at the point of use.
    expect(httpsOrNull("http://scontent.xx.fbcdn.net/v/t1.jpg")).toBeNull();
    expect(httpsOrNull("javascript:alert(1)")).toBeNull();
    expect(httpsOrNull("data:image/svg+xml;base64,AAA")).toBeNull();
  });

  it("rejects a relative or malformed value", () => {
    expect(httpsOrNull("/e2e-thumbnails/post-0.svg")).toBeNull();
    expect(httpsOrNull("not a url")).toBeNull();
    expect(httpsOrNull(undefined)).toBeNull();
    expect(httpsOrNull(42)).toBeNull();
  });

  it("is exported as httpsUrl for the publishing path", () => {
    expect(httpsUrl).toBe(httpsOrNull);
  });
});

describe("stringValue / blankToNull", () => {
  it("returns null for whitespace-only and non-string values", () => {
    expect(stringValue("   ")).toBeNull();
    expect(stringValue("")).toBeNull();
    expect(stringValue(null)).toBeNull();
    expect(blankToNull(undefined)).toBeNull();
  });

  it("keeps a real value", () => {
    expect(blankToNull("  hello  ")).toBe("  hello  ");
  });
});

describe("truncateCaption", () => {
  it("leaves a short caption untouched", () => {
    expect(truncateCaption("short caption")).toBe("short caption");
  });

  it("collapses whitespace so a caption never renders as a blank line", () => {
    expect(truncateCaption("a\n\n  b")).toBe("a b");
  });

  it("truncates on a word boundary with an ellipsis", () => {
    const long = `${"word ".repeat(40)}end`;
    const result = truncateCaption(long, 40);
    expect(result).toMatch(/…$/);
    expect(result!.length).toBeLessThanOrEqual(41);
    // Never cut mid-word.
    expect(result).not.toMatch(/wor…$/);
  });

  it("returns null for a missing caption", () => {
    expect(truncateCaption(null)).toBeNull();
  });
});

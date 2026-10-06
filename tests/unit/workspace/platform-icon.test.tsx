import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Linkedin, Music2, PlayCircle, Twitter } from "lucide-react";
import {
  localizedPlatformLabel,
  PlatformIcon,
  platformLabel,
} from "@/components/workspace/platform-icon";

describe("platformLabel", () => {
  it("returns human-friendly names for the canonical enums", () => {
    expect(platformLabel("instagram")).toBe("Instagram");
    expect(platformLabel("facebook")).toBe("Facebook");
    expect(platformLabel("tiktok")).toBe("TikTok");
    expect(platformLabel("linkedin")).toBe("LinkedIn");
    expect(platformLabel("youtube")).toBe("YouTube");
    expect(platformLabel("x")).toBe("X (Twitter)");
  });

  it("falls back to the raw value for unknown platforms", () => {
    expect(platformLabel("myspace")).toBe("myspace");
    expect(platformLabel("")).toBe("");
  });
});

describe("localizedPlatformLabel", () => {
  it("uses the active catalog for known platforms", () => {
    const t = (key: string) =>
      key === "contentDetail.publishForm.platformLabels.instagram" ? "إنستغرام" : key;
    expect(localizedPlatformLabel("instagram", t)).toBe("إنستغرام");
  });

  it("falls back to the human-friendly label for unknown catalog entries", () => {
    expect(localizedPlatformLabel("instagram", (key) => key)).toBe("Instagram");
    expect(localizedPlatformLabel("future_network", (key) => `[${key}]`)).toBe("future_network");
  });
});

describe("PlatformIcon", () => {
  it("renders a recognizable icon per platform", () => {
    const { container: ig, rerender } = render(<PlatformIcon platform="instagram" />);
    expect(ig.querySelector("svg")).toBeTruthy();
    rerender(<PlatformIcon platform="facebook" />);
    rerender(<PlatformIcon platform="linkedin" />);
    rerender(<PlatformIcon platform="tiktok" />);
    rerender(<PlatformIcon platform="youtube" />);
    rerender(<PlatformIcon platform="x" />);
  });

  it("falls back to PlayCircle for unknown platforms", () => {
    const { container } = render(<PlatformIcon platform="myspace" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders the official brand mark for Instagram and Facebook", () => {
    const { container: ig } = render(<PlatformIcon platform="instagram" />);
    expect(ig.querySelector('[data-testid="brand-mark-instagram"]')).toBeTruthy();
    // A brand mark must not fall back to the monochrome lucide glyphs —
    // Instagram used to render a generic Camera icon.
    expect(ig.querySelector('[class*="lucide"]')).toBeNull();

    const { container: fb } = render(<PlatformIcon platform="facebook" />);
    expect(fb.querySelector('[data-testid="brand-mark-facebook"]')).toBeTruthy();
  });

  it("keeps the lucide glyph for platforms without a brand mark", () => {
    const { container } = render(<PlatformIcon platform="tiktok" />);
    expect(container.querySelector("[class*='lucide']")).toBeTruthy();
  });

  it("wraps a monochrome glyph in a coloured tile when tile=true", () => {
    const { container } = render(<PlatformIcon platform="linkedin" tile />);
    const tile = container.firstElementChild;
    expect(tile?.className).toMatch(/inline-flex/);
    expect(tile?.className).toMatch(/rounded-lg/);
  });

  it("does not wrap a brand mark in the neutral tile", () => {
    // The mark already carries its own square silhouette and full colour, so
    // a neutral tile behind it would only mute it.
    const { container } = render(<PlatformIcon platform="instagram" tile />);
    const root = container.firstElementChild;
    expect(root?.getAttribute("data-testid")).toBe("brand-mark-instagram");
    expect(root?.getAttribute("class") ?? "").not.toMatch(/inline-flex/);
  });

  it("hides brand marks from assistive tech", () => {
    // The account name beside the mark is the accessible name; the glyph
    // must never announce itself a second time.
    const { container } = render(<PlatformIcon platform="facebook" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("uses the published Instagram gradient and Facebook blue", () => {
    const { container: ig } = render(<PlatformIcon platform="instagram" />);
    const stops = [...ig.querySelectorAll("stop")].map((s) => s.getAttribute("stop-color"));
    expect(stops).toEqual(["#FEDA75", "#FA7E1E", "#D62976", "#962FBF", "#4F5BD5"]);

    const { container: fb } = render(<PlatformIcon platform="facebook" />);
    expect(fb.querySelector("circle")?.getAttribute("fill")).toBe("#1877F2");
  });

  it("imports the right lucide primitives (regression)", () => {
    // If the icon map ever drifts, this test fails fast. Instagram and
    // Facebook are excluded: they resolve to brand marks, not lucide.
    const expected = {
      tiktok: Music2,
      linkedin: Linkedin,
      youtube: PlayCircle,
      x: Twitter,
    };
    for (const [platform, Icon] of Object.entries(expected)) {
      const { container } = render(<PlatformIcon platform={platform} />);
      const rendered = container.querySelector("svg");
      expect(rendered).toBeTruthy();
      const cls = rendered?.getAttribute("class") ?? "";
      expect(Icon.displayName ?? "").toBeTruthy();
      expect(cls).toContain("lucide");
    }
  });
});

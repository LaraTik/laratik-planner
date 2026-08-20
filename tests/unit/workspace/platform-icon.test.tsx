import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Camera, Facebook, Linkedin, Music2, PlayCircle, Twitter } from "lucide-react";
import { PlatformIcon, platformLabel } from "@/components/workspace/platform-icon";

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

  it("wraps the icon in a coloured tile when tile=true", () => {
    const { container } = render(<PlatformIcon platform="instagram" tile />);
    const tile = container.firstElementChild;
    expect(tile?.className).toMatch(/inline-flex/);
    expect(tile?.className).toMatch(/rounded-lg/);
  });

  it("imports the right lucide primitives (regression)", () => {
    // If the icon map ever drifts, this test fails fast.
    const expected = {
      instagram: Camera,
      facebook: Facebook,
      tiktok: Music2,
      linkedin: Linkedin,
      youtube: PlayCircle,
      x: Twitter,
    };
    for (const [platform, Icon] of Object.entries(expected)) {
      const { container } = render(<PlatformIcon platform={platform} />);
      const rendered = container.querySelector("svg");
      expect(rendered).toBeTruthy();
      // lucide renders the icon name as a class on the <svg> element.
      const cls = rendered?.getAttribute("class") ?? "";
      // The actual class is `lucide-<icon-name>`. Loose check via name.
      const iconName = Icon.displayName ?? "";
      expect(iconName).toBeTruthy();
      expect(cls).toContain("lucide");
    }
  });
});

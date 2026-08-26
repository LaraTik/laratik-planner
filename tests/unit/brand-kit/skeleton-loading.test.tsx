import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import BrandKitLoading from "@/app/(app)/app/w/[slug]/brand-kit/loading";

describe("BrandKitLoading skeleton", () => {
  it("renders the loading state with aria-busy and aria-live", () => {
    const { container } = render(<BrandKitLoading />);
    const root = container.firstElementChild;
    expect(root).toHaveAttribute("aria-busy", "true");
    expect(root).toHaveAttribute("aria-live", "polite");
  });

  it("renders 9 section-shaped skeletons matching the Bento grid", () => {
    const { container } = render(<BrandKitLoading />);
    // The Bento has 9 cards (1 hero + 8 sections). Each is a Skeleton.
    const skeletons = container.querySelectorAll(
      '[class*="animate-pulse"], [data-slot="skeleton"]',
    );
    expect(skeletons.length).toBeGreaterThanOrEqual(9);
  });

  it("includes a page-header-shaped skeleton (eyebrow + title + actions)", () => {
    const { container } = render(<BrandKitLoading />);
    // The page-header row has 2 right-side action skeletons.
    const actionSkeletons = container.querySelectorAll(".h-9");
    expect(actionSkeletons.length).toBeGreaterThanOrEqual(2);
  });

  it("is wrapped in the same outer spacing as the real page", () => {
    const { container } = render(<BrandKitLoading />);
    const root = container.firstElementChild;
    expect(root?.className).toContain("space-y-6");
  });
});

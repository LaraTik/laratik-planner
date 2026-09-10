import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScreenLoading, type ScreenLoadingVariant } from "@/components/feedback/screen-loading";

const VARIANTS: ScreenLoadingVariant[] = [
  "overview",
  "planning",
  "content-detail",
  "reviews",
  "analytics",
  "table",
  "form",
  "client-review",
  "publish",
];

describe("ScreenLoading", () => {
  it.each(VARIANTS)("announces the %s loading state accessibly", (variant) => {
    render(<ScreenLoading variant={variant} />);

    const root = screen.getByRole("status", { hidden: true });
    expect(root).toHaveAttribute("aria-busy", "true");
    expect(root).toHaveAttribute("aria-live", "polite");
  });

  it("keeps the skeletons decorative inside the announced loading region", () => {
    const { container } = render(<ScreenLoading variant="content-detail" />);

    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(8);
  });
});

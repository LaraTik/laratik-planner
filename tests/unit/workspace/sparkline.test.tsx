import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sparkline } from "@/components/workspace/sparkline";

function pathOf(container: HTMLElement): string {
  return container.querySelector("path.stroke-primary")?.getAttribute("d") ?? "";
}

describe("Sparkline", () => {
  it("draws a flat baseline when there are fewer than two points", () => {
    const { container } = render(<Sparkline values={[5]} />);
    const line = container.querySelector("line");
    expect(line).toBeTruthy();
    // A single value has no shape to plot, so it must not fake a trend.
    expect(container.querySelector("path.stroke-primary")).toBeNull();
  });

  it("renders nothing instead of a flat line when hideWhenInsufficient is set", () => {
    const { container } = render(<Sparkline values={[5]} hideWhenInsufficient />);
    expect(container.firstChild).toBeNull();
  });

  it("draws an area and line once there are two points", () => {
    const { container } = render(<Sparkline values={[1, 4, 2]} />);
    expect(container.querySelector("path.stroke-primary")).toBeTruthy();
    expect(container.querySelectorAll("path")).toHaveLength(2);
  });

  it("collapses gaps by default so the trend reads as continuous", () => {
    const { container } = render(<Sparkline values={[1, null, 3, 5]} />);
    // One continuous run: a single M, then L commands.
    expect(pathOf(container).match(/M/g)).toHaveLength(1);
  });

  it("breaks the line at a gap when preserveGaps is set", () => {
    const { container } = render(<Sparkline values={[1, null, 3, 5]} preserveGaps />);
    // Two runs means two M commands — the gap stays a gap.
    expect(pathOf(container).match(/M/g)).toHaveLength(2);
  });

  it("keeps a gap's horizontal space when preserveGaps is set", () => {
    // x is derived from the full index (2 inset + index/3 of a 96 span), so
    // the point after the gap stays at ~3/4 width even though the gap
    // itself contributes no coordinate.
    const { container } = render(<Sparkline values={[1, 2, null, 4]} preserveGaps />);
    const xValues = [...pathOf(container).matchAll(/[ML]([\d.]+),/g)].map((m) => Number(m[1]));
    expect(xValues).toEqual([2, 34, 98]);
  });

  it("omits the area fill when fill is disabled", () => {
    const { container } = render(<Sparkline values={[1, 4, 2]} fill={false} />);
    expect(container.querySelectorAll("path")).toHaveLength(1);
  });

  it("is hidden from assistive tech by default because the card text carries the value", () => {
    const { container } = render(<Sparkline values={[1, 2]} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
  });

  it("becomes a labelled image when an ariaLabel is supplied", () => {
    render(<Sparkline values={[1, 2]} ariaLabel="Followers trending up" />);
    const svg = screen.getByLabelText("Followers trending up");
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg).not.toHaveAttribute("aria-hidden");
  });

  it("honours a custom testId", () => {
    render(<Sparkline values={[1, 2]} testId="social-sparkline" />);
    expect(screen.getByTestId("social-sparkline")).toBeTruthy();
  });
});

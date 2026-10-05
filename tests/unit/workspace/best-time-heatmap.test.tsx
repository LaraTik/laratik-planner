import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BestTimeHeatmap } from "@/components/workspace/best-time-heatmap";
import { Sparkline } from "@/components/workspace/sparkline";
import type { CommandCenterTimeSlot } from "@/lib/social/command-center";

const labels = {
  days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  averageViews: "average views",
  sampleSize: "posts",
  noData: "No posts in this slot",
  legend: "Average views by day and hour in {timezone}",
  less: "Less",
  more: "More",
  bestSlot: "Best slot",
  notEnoughData: "Not enough data",
};

function slot(over: Partial<CommandCenterTimeSlot> = {}): CommandCenterTimeSlot {
  return {
    dayOfWeek: 2,
    hour: 9,
    sampleSize: 4,
    averageViews: 900,
    reliable: true,
    ...over,
  };
}

describe("BestTimeHeatmap", () => {
  it("renders a cell carrying the slot value, not an empty box", () => {
    render(
      <BestTimeHeatmap slots={[slot()]} locale="en" timezone="Europe/Berlin" labels={labels} />,
    );

    const cell = screen.getByTestId("command-center-heatmap-cell-2-9");
    expect(cell).toHaveAttribute("data-has-data", "true");
    // The cell must expose its value in text, not only as a colour.
    expect(cell).toHaveTextContent("900 average views");
    expect(cell).toHaveAccessibleName(/Tue 09:00/);
  });

  it("marks the strongest slot as best and leaves empty slots unfilled", () => {
    render(
      <BestTimeHeatmap
        slots={[
          slot({ dayOfWeek: 2, hour: 9, averageViews: 200 }),
          slot({ dayOfWeek: 5, hour: 18, averageViews: 1500 }),
        ]}
        locale="en"
        timezone="Europe/Berlin"
        labels={labels}
      />,
    );

    expect(screen.getByTestId("command-center-heatmap-cell-5-18")).toHaveAttribute(
      "data-best",
      "true",
    );
    expect(screen.getByTestId("command-center-heatmap-cell-2-9")).toHaveAttribute(
      "data-best",
      "false",
    );
    // A day/hour with no observation must stay visibly empty rather than
    // inheriting the strongest slot's intensity.
    expect(screen.getByTestId("command-center-heatmap-cell-0-6")).toHaveAttribute(
      "data-has-data",
      "false",
    );
  });

  it("renders all six band rows and seven day columns", () => {
    render(
      <BestTimeHeatmap slots={[slot()]} locale="en" timezone="Europe/Berlin" labels={labels} />,
    );

    for (const hour of [6, 9, 12, 15, 18, 21]) {
      for (let day = 0; day < 7; day += 1) {
        expect(screen.getByTestId(`command-center-heatmap-cell-${day}-${hour}`)).toBeTruthy();
      }
    }
  });

  it("keeps the timezone in the accessible description", () => {
    render(
      <BestTimeHeatmap slots={[slot()]} locale="en" timezone="Europe/Berlin" labels={labels} />,
    );

    expect(
      screen.getByRole("table", { name: /Average views by day and hour in Europe\/Berlin/ }),
    ).toBeTruthy();
  });

  it("flags a low-sample slot so a weak signal is never read as a recommendation", () => {
    render(
      <BestTimeHeatmap
        slots={[slot({ sampleSize: 1, reliable: false })]}
        locale="en"
        timezone="Europe/Berlin"
        labels={labels}
      />,
    );

    expect(screen.getByTestId("command-center-heatmap-cell-2-9")).toHaveAccessibleName(
      /Not enough data/,
    );
  });
});

describe("Sparkline", () => {
  it("draws a flat baseline when there are fewer than two points", () => {
    const { container } = render(<Sparkline values={[5]} />);
    const line = container.querySelector("line");
    expect(line).toBeTruthy();
    // A single value has no shape to plot, so it must not fake a trend.
    expect(container.querySelector("path.stroke-primary")).toBeNull();
  });

  it("draws an area and line once there are two points", () => {
    const { container } = render(<Sparkline values={[1, 4, 2]} />);
    expect(container.querySelector("path.stroke-primary")).toBeTruthy();
    expect(container.querySelectorAll("path")).toHaveLength(2);
  });

  it("is hidden from assistive tech because the card text carries the value", () => {
    const { container } = render(<Sparkline values={[1, 2]} />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

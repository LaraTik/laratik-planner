import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BestTimeHeatmap } from "@/components/workspace/best-time-heatmap";
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
  notEnoughData: "Too few posts to recommend",
  noPosts: "No posts",
};

function slot(over: Partial<CommandCenterTimeSlot> = {}): CommandCenterTimeSlot {
  return {
    dayOfWeek: 2,
    hour: 9,
    sampleSize: 4,
    averageViews: 900,
    reliable: true,
    liftRatio: 1.5,
    confidence: "good",
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

  it("rings the slot the panel actually recommends, not the loudest cell", () => {
    // The regression this pins: the grid used to pick its own winner as the
    // highest average across ALL slots, while the header pill took the highest
    // among RELIABLE ones. On real data the pill read "Tue 15:00" (382 views,
    // 3 posts) while the ring landed on a 502-view cell backed by ONE post —
    // the panel recommended Tuesday and highlighted Friday.
    const noisy = slot({
      dayOfWeek: 5,
      hour: 12,
      averageViews: 502,
      sampleSize: 1,
      reliable: false,
    });
    const recommended = slot({ dayOfWeek: 2, hour: 15, averageViews: 382, sampleSize: 3 });

    render(
      <BestTimeHeatmap
        slots={[noisy, recommended]}
        locale="en"
        timezone="Europe/Berlin"
        labels={labels}
        bestTime={recommended}
      />,
    );

    expect(screen.getByTestId("command-center-heatmap-cell-2-15")).toHaveAttribute(
      "data-best",
      "true",
    );
    expect(screen.getByTestId("command-center-heatmap-cell-5-12")).toHaveAttribute(
      "data-best",
      "false",
    );
  });

  it("rings nothing when there is no recommendation, even if a cell is loud", () => {
    render(
      <BestTimeHeatmap
        slots={[
          slot({ dayOfWeek: 5, hour: 18, averageViews: 1500, sampleSize: 2, reliable: false }),
        ]}
        locale="en"
        timezone="Europe/Berlin"
        labels={labels}
        bestTime={null}
      />,
    );

    expect(screen.getByTestId("command-center-heatmap-cell-5-18")).toHaveAttribute(
      "data-best",
      "false",
    );
  });

  it("leaves empty slots unfilled and keeps them visibly distinct", () => {
    render(
      <BestTimeHeatmap
        slots={[slot({ dayOfWeek: 2, hour: 9, averageViews: 200 })]}
        locale="en"
        timezone="Europe/Berlin"
        labels={labels}
        bestTime={slot({ dayOfWeek: 2, hour: 9, averageViews: 200 })}
      />,
    );

    expect(screen.getByTestId("command-center-heatmap-cell-2-9")).toHaveAttribute(
      "data-best",
      "true",
    );
    // A day/hour with no observation must stay visibly empty rather than
    // inheriting the strongest slot's intensity.
    const empty = screen.getByTestId("command-center-heatmap-cell-0-6");
    expect(empty).toHaveAttribute("data-has-data", "false");
    expect(empty).toHaveAttribute("data-reliable", "false");
  });

  it("says 'no posts' in an empty cell instead of the below-threshold copy", () => {
    // Both states previously rendered the same "at least three posts"
    // sentence, repeated across thirty-odd cells of the grid.
    render(
      <BestTimeHeatmap
        slots={[slot({ dayOfWeek: 2, hour: 9, sampleSize: 1, reliable: false })]}
        locale="en"
        timezone="Europe/Berlin"
        labels={labels}
      />,
    );

    const empty = screen.getByTestId("command-center-heatmap-cell-0-6");
    expect(empty).toHaveTextContent("No posts");
    expect(empty).not.toHaveTextContent("Too few posts to recommend");

    const belowGate = screen.getByTestId("command-center-heatmap-cell-2-9");
    expect(belowGate).toHaveTextContent("Too few posts to recommend");
    expect(belowGate).toHaveAttribute("data-reliable", "false");
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

  it("renders a real dim on below-threshold cells, not a dead utility class", () => {
    // The cell sets `opacity` as an inline style, which always beats a class —
    // so an `opacity-60` utility on this element renders nothing at all. The
    // dim has to be folded into the computed value or the distinction silently
    // does not exist.
    const reliable = slot({ dayOfWeek: 2, hour: 9, averageViews: 900, reliable: true });
    const thin = slot({
      dayOfWeek: 2,
      hour: 15,
      averageViews: 900,
      reliable: false,
      sampleSize: 1,
    });
    render(
      <BestTimeHeatmap
        slots={[reliable, thin]}
        locale="en"
        timezone="Europe/Berlin"
        labels={labels}
        bestTime={reliable}
      />,
    );

    const read = (id: string) =>
      Number(
        screen
          .getByTestId(id)
          .getAttribute("style")
          ?.match(/opacity:\s*([\d.]+)/)?.[1],
      );
    const reliableOpacity = read("command-center-heatmap-cell-2-9");
    const thinOpacity = read("command-center-heatmap-cell-2-15");

    expect(reliableOpacity).toBeGreaterThan(0);
    // Same average views, different support -> the thin one must render dimmer.
    expect(thinOpacity).toBeLessThan(reliableOpacity);
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
      /Too few posts to recommend/,
    );
  });
});

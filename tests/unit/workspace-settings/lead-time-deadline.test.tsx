import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeadTimeDeadline } from "@/app/(app)/app/w/[slug]/settings/_components/lead-time-deadline";

describe("LeadTimeDeadline", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses a stable short month label across server and browser engines", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      () =>
        ({
          format: () => "Tue 29 Sept",
          formatToParts: () => [
            { type: "year", value: "2026" },
            { type: "month", value: "9" },
            { type: "day", value: "29" },
          ],
        }) as Intl.DateTimeFormat,
    );

    render(
      <LeadTimeDeadline
        totalDays={18}
        today={new Date("2026-09-03T12:00:00.000Z")}
        timezone="UTC"
      />,
    );

    expect(screen.getByTestId("lead-times-deadline-date")).toHaveTextContent(/^Tue 29 Sep$/);
  });
});

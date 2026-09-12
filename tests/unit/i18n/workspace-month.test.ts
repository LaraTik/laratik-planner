import { describe, expect, it } from "vitest";
import { formatDate } from "@/lib/i18n/format-locale";
import {
  currentWorkspaceMonthRange,
  workspaceMonthDisplayDate,
  workspaceMonthRange,
} from "@/lib/i18n/workspace-month";

describe("currentWorkspaceMonthRange", () => {
  it("keeps a displayed month stable when formatted in a western timezone", () => {
    const displayDate = workspaceMonthDisplayDate(2026, 8);

    expect(
      formatDate(displayDate, "en", {
        month: "long",
        year: "numeric",
        timeZone: "America/Los_Angeles",
      }),
    ).toBe("September 2026");
  });

  it("uses the workspace month when UTC is still the previous local day", () => {
    const { start, end } = currentWorkspaceMonthRange(
      new Date("2026-09-01T00:30:00.000Z"),
      "America/Los_Angeles",
    );

    expect(start.toISOString()).toBe("2026-08-01T07:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-01T07:00:00.000Z");
  });

  it("handles a workspace that has already entered the next month", () => {
    const { start, end } = currentWorkspaceMonthRange(
      new Date("2026-08-31T15:30:00.000Z"),
      "Asia/Tokyo",
    );

    expect(start.toISOString()).toBe("2026-08-31T15:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-30T15:00:00.000Z");
  });

  it("builds a requested month in the workspace timezone", () => {
    const { start, end } = workspaceMonthRange(2026, 8, "America/Los_Angeles");

    expect(start.toISOString()).toBe("2026-09-01T07:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-01T07:00:00.000Z");
  });
});

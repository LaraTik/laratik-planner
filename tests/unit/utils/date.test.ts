import { describe, expect, it } from "vitest";
import { formatDateForInput, parseInputAsLocalDate } from "@/lib/utils/date";

describe("formatDateForInput", () => {
  it("formats a Date as YYYY-MM-DDTHH:mm in local time", () => {
    const d = new Date(2026, 7, 29, 9, 5); // Aug 29 2026 09:05 local
    expect(formatDateForInput(d)).toBe("2026-08-29T09:05");
  });

  it("pads single-digit month / day / hour / minute with a leading zero", () => {
    const d = new Date(2026, 0, 5, 3, 7);
    expect(formatDateForInput(d)).toBe("2026-01-05T03:07");
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatDateForInput(new Date(NaN))).toBe("");
  });
});

describe("parseInputAsLocalDate", () => {
  it("parses YYYY-MM-DDTHH:mm as local time", () => {
    const d = parseInputAsLocalDate("2026-08-29T09:00");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(29);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });

  it("returns Invalid Date for an empty string", () => {
    expect(Number.isNaN(parseInputAsLocalDate("").getTime())).toBe(true);
  });
});

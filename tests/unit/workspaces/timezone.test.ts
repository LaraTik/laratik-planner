import { describe, expect, it } from "vitest";
import { ianaTimezoneSchema, isValidIanaTimezone } from "@/lib/workspaces/timezone";

describe("IANA timezone validation", () => {
  it("accepts UTC and supported IANA zones", () => {
    expect(isValidIanaTimezone("UTC")).toBe(true);
    expect(ianaTimezoneSchema.safeParse("Europe/Berlin").success).toBe(true);
  });

  it("rejects arbitrary strings before they can be persisted", () => {
    expect(isValidIanaTimezone("not-a-timezone")).toBe(false);
    expect(ianaTimezoneSchema.safeParse("not-a-timezone").success).toBe(false);
  });
});

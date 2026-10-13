import { describe, expect, it } from "vitest";
import { nextAdvertisingRetryAt } from "@/lib/advertising/sync-worker";

describe("advertising sync worker retry policy", () => {
  const now = new Date("2026-10-13T12:00:00.000Z");

  it.each([
    [0, "2026-10-13T12:15:00.000Z"],
    [1, "2026-10-13T12:15:00.000Z"],
    [2, "2026-10-13T13:00:00.000Z"],
    [3, "2026-10-13T18:00:00.000Z"],
    [99, "2026-10-13T18:00:00.000Z"],
  ])("schedules attempt %s with bounded backoff", (attempt, expected) => {
    expect(nextAdvertisingRetryAt(now, attempt).toISOString()).toBe(expected);
  });
});

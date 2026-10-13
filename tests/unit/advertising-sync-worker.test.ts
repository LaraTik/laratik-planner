import { describe, expect, it } from "vitest";
import {
  advertisingSyncFailureStatus,
  ADVERTISING_SYNC_MAX_ATTEMPTS,
  nextAdvertisingRetryAt,
} from "@/lib/advertising/sync-worker";

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

  it("dead-letters after the bounded retry budget and retries after explicit re-enable", () => {
    expect(ADVERTISING_SYNC_MAX_ATTEMPTS).toBe(4);
    expect(advertisingSyncFailureStatus(3)).toBe("failed");
    expect(advertisingSyncFailureStatus(4)).toBe("dead_letter");
  });
});

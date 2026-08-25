import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { SetNotificationPreferencesSchema } from "@/lib/notifications/service";

/**
 * FEAT-08 (GAP-FULL-REVIEW-2026-08-25) — notification_preferences was a
 * dead schema: the columns existed but the rest of the codebase
 * never read or wrote them. The new account-page form persists via
 * `SetNotificationPreferencesSchema`; this test pins its public
 * contract.
 *
 *  - The schema accepts both booleans (no defaults; the account page
 *    always submits both flags together so the persistence layer
 *    never has to infer a missing value).
 *  - Any non-boolean input is rejected with a structured error.
 */
describe("SetNotificationPreferencesSchema", () => {
  it("accepts the full pair of boolean flags", () => {
    expect(
      SetNotificationPreferencesSchema.safeParse({
        emailOnMention: true,
        dailyDigest: false,
      }).success,
    ).toBe(true);
    expect(
      SetNotificationPreferencesSchema.safeParse({
        emailOnMention: false,
        dailyDigest: true,
      }).success,
    ).toBe(true);
  });

  it("rejects missing fields so the writer never has to infer defaults", () => {
    expect(SetNotificationPreferencesSchema.safeParse({ emailOnMention: true }).success).toBe(
      false,
    );
    expect(SetNotificationPreferencesSchema.safeParse({ dailyDigest: true }).success).toBe(false);
  });

  it("rejects non-boolean payloads (e.g. the raw form string)", () => {
    expect(
      SetNotificationPreferencesSchema.safeParse({
        emailOnMention: "on",
        dailyDigest: "off",
      }).success,
    ).toBe(false);
  });
});

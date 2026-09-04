import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  SetNotificationPreferencesSchema,
  defaultNotificationPreferences,
  NotificationKindSchemaValues,
} from "@/lib/notifications/service";

/**
 * R4 — `SetNotificationPreferencesSchema` now accepts a per-kind
 * matrix plus the daily-digest toggle. The matrix is a record
 * keyed by every value of `NotificationKindSchemaValues`. The
 * service writes each kind row independently so a partial
 * matrix (e.g. a form that posts only the kinds the user
 * touched) is still a valid input.
 */
describe("SetNotificationPreferencesSchema (R4)", () => {
  it("accepts the full per-kind matrix + daily digest", () => {
    const full = defaultNotificationPreferences();
    const prefs = Object.fromEntries(
      Object.entries(full).filter(([k]) => k !== "dailyDigest"),
    ) as Record<string, { inAppEnabled: boolean; emailEnabled: boolean }>;
    const out = SetNotificationPreferencesSchema.safeParse({
      prefs,
      dailyDigest: true,
    });
    expect(out.success).toBe(true);
  });

  it("accepts a partial matrix (the form posts only touched kinds)", () => {
    const out = SetNotificationPreferencesSchema.safeParse({
      prefs: {
        mention: { inAppEnabled: true, emailEnabled: true },
        review_request: { inAppEnabled: true, emailEnabled: false },
      },
      dailyDigest: false,
    });
    expect(out.success).toBe(true);
  });

  it("rejects non-boolean inAppEnabled", () => {
    const out = SetNotificationPreferencesSchema.safeParse({
      prefs: { mention: { inAppEnabled: "on", emailEnabled: false } },
      dailyDigest: false,
    });
    expect(out.success).toBe(false);
  });

  it("rejects non-boolean dailyDigest", () => {
    const out = SetNotificationPreferencesSchema.safeParse({
      prefs: { mention: { inAppEnabled: true, emailEnabled: false } },
      dailyDigest: "on",
    });
    expect(out.success).toBe(false);
  });

  it("defaultNotificationPreferences covers every kind in the schema", () => {
    const defaults = defaultNotificationPreferences();
    for (const kind of NotificationKindSchemaValues) {
      expect(defaults[kind]).toBeDefined();
      expect(defaults[kind].inAppEnabled).toBe(true);
      expect(defaults[kind].emailEnabled).toBe(false);
    }
    expect(defaults.dailyDigest).toBe(false);
  });
});

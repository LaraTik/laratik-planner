import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  requirePlatformPermission: vi.fn(),
  recordCronTick: vi.fn(),
  runSyncTick: vi.fn(),
  revalidatePath: vi.fn(),
  captureError: vi.fn(),
  db: { insert: vi.fn() },
}));

vi.mock("@/lib/auth/current-actor", () => ({ currentActor: mocks.currentActor }));
vi.mock("@/lib/auth/platform-access", () => ({
  requirePlatformPermission: mocks.requirePlatformPermission,
}));
vi.mock("@/lib/cron/history", () => ({ recordCronTick: mocks.recordCronTick }));
vi.mock("@/lib/social/sync", () => ({ runSyncTick: mocks.runSyncTick }));
vi.mock("@/lib/observability/sentry", () => ({ captureError: mocks.captureError }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { runSocialMetricsNowAction } from "@/app/(app)/app/platform/operations/cron/actions";

describe("runSocialMetricsNowAction failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentActor.mockResolvedValue({ id: "operator-1" });
    mocks.requirePlatformPermission.mockResolvedValue(undefined);
    mocks.runSyncTick.mockRejectedValue(new Error("postgres://private-password@internal/db"));
    mocks.recordCronTick.mockResolvedValue(1);
    mocks.db.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
  });

  it("keeps raw errors in diagnostics and returns safe copy", async () => {
    const result = await runSocialMetricsNowAction();

    expect(result).toEqual({ ok: false, error: "Social metrics sync failed." });
    expect(mocks.recordCronTick).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "error",
        errorText: "Social metrics sync failed.",
      }),
    );
    expect(mocks.captureError).toHaveBeenCalledWith(
      "cron.run_now.failed",
      expect.objectContaining({ message: "postgres://private-password@internal/db" }),
      expect.objectContaining({ cronName: "social-metrics" }),
    );
  });
});

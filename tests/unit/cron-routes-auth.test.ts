import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  isCronAuthorized: vi.fn(),
  dispatchEmailOnce: vi.fn(),
  dispatchOutboxOnce: vi.fn(),
  runSyncTick: vi.fn(),
  recordCronTick: vi.fn(),
  runAdvertisingSyncTick: vi.fn(),
  pruneAppErrorRetention: vi.fn(),
  logError: vi.fn(),
  expireStorageUploadIntents: vi.fn(),
  processPendingMediaAssets: vi.fn(),
  expungeExpiredTrashedMedia: vi.fn(),
  purgeSoftDeletedStorageObjects: vi.fn(),
}));

vi.mock("@/lib/cron/auth", () => ({ isCronAuthorized: mocks.isCronAuthorized }));
vi.mock("@/lib/notifications/service", () => ({
  dispatchEmailOnce: mocks.dispatchEmailOnce,
  dispatchOutboxOnce: mocks.dispatchOutboxOnce,
}));
vi.mock("@/lib/social/sync", () => ({ runSyncTick: mocks.runSyncTick }));
vi.mock("@/lib/cron/history", () => ({ recordCronTick: mocks.recordCronTick }));
vi.mock("@/lib/advertising/sync-worker", () => ({
  runAdvertisingSyncTick: mocks.runAdvertisingSyncTick,
  normalizeAdvertisingSyncDateRange: vi.fn(),
}));
vi.mock("@/lib/observability/app-errors", () => ({
  pruneAppErrorRetention: mocks.pruneAppErrorRetention,
}));
vi.mock("@/lib/observability/logger", () => ({ logError: mocks.logError }));
vi.mock("@/lib/media/service", () => ({
  expungeExpiredTrashedMedia: mocks.expungeExpiredTrashedMedia,
  processPendingMediaAssets: mocks.processPendingMediaAssets,
}));
vi.mock("@/lib/storage/intent-service", () => ({
  expireStorageUploadIntents: mocks.expireStorageUploadIntents,
  purgeSoftDeletedStorageObjects: mocks.purgeSoftDeletedStorageObjects,
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/validation/env", () => ({
  serverEnv: { SOCIAL_SYNC_ENABLED: true, ADVERTISING_SYNC_ENABLED: true },
}));

import {
  GET as advertisingSyncGet,
  POST as advertisingSyncPost,
} from "@/app/api/cron/advertising-sync/route";
import {
  GET as emailDispatchGet,
  POST as emailDispatchPost,
} from "@/app/api/cron/email-dispatch/route";
import {
  GET as errorRetentionGet,
  POST as errorRetentionPost,
} from "@/app/api/cron/error-retention/route";
import { GET as outboxGet, POST as outboxPost } from "@/app/api/cron/outbox/route";
import { GET as socialMetricsGet } from "@/app/api/cron/social-metrics/route";
import {
  GET as storageCleanupGet,
  POST as storageCleanupPost,
} from "@/app/api/cron/storage-cleanup/route";

const unauthorizedHandlers = [
  ["email-dispatch GET", "GET", emailDispatchGet],
  ["email-dispatch POST", "POST", emailDispatchPost],
  ["outbox GET", "GET", outboxGet],
  ["outbox POST", "POST", outboxPost],
  ["social-metrics GET", "GET", socialMetricsGet],
  ["advertising-sync GET", "GET", advertisingSyncGet],
  ["advertising-sync POST", "POST", advertisingSyncPost],
  ["error-retention GET", "GET", errorRetentionGet],
  ["error-retention POST", "POST", errorRetentionPost],
  ["storage-cleanup GET", "GET", storageCleanupGet],
  ["storage-cleanup POST", "POST", storageCleanupPost],
] as const;

function request(method: "GET" | "POST") {
  return new NextRequest("http://localhost/api/cron/test", { method });
}

describe("cron route authorization boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isCronAuthorized.mockReturnValue(false);
  });

  it.each(unauthorizedHandlers)(
    "rejects an unauthorized %s without running the job",
    async (_, method, handler) => {
      const response = await handler(request(method));

      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
      await expect(response.text()).resolves.toBe("Unauthorized");
      expect(mocks.dispatchEmailOnce).not.toHaveBeenCalled();
      expect(mocks.dispatchOutboxOnce).not.toHaveBeenCalled();
      expect(mocks.runSyncTick).not.toHaveBeenCalled();
      expect(mocks.recordCronTick).not.toHaveBeenCalled();
      expect(mocks.runAdvertisingSyncTick).not.toHaveBeenCalled();
      expect(mocks.pruneAppErrorRetention).not.toHaveBeenCalled();
      expect(mocks.expireStorageUploadIntents).not.toHaveBeenCalled();
      expect(mocks.processPendingMediaAssets).not.toHaveBeenCalled();
      expect(mocks.expungeExpiredTrashedMedia).not.toHaveBeenCalled();
      expect(mocks.purgeSoftDeletedStorageObjects).not.toHaveBeenCalled();
    },
  );
});

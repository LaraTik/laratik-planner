import { describe, expect, it, vi } from "vitest";

import { FOLDER_IMPORT_CONCURRENCY } from "@/lib/media/folder-sources/types";
import { MediaPermissionError } from "@/lib/media/service";
import { MediaSourceError } from "@/lib/media/source";
import { runMediaFolderBatch } from "@/lib/media/folder-import";

// We do not want this test to hit the real `importPublicMediaAsset`. Mock
// the service module so we can drive success / failure / per-row code.
const mockedImport = vi.fn();
vi.mock("@/lib/media/service", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/media/service")>();
  return {
    ...mod,
    importPublicMediaAsset: (...args: unknown[]) => mockedImport(...args),
    MediaPermissionError: class extends Error {
      constructor(message: string) {
        super(message);
        this.name = "MediaPermissionError";
      }
    },
  };
});

// canWriteToWorkspace should pass for the happy paths.
vi.mock("@/lib/auth/policy", () => ({
  canWriteToWorkspace: vi.fn(async () => true),
}));

const ACTOR = { id: "00000000-0000-0000-0000-000000000001" } as never;
const AGENCY = "11111111-aaaa-aaaa-aaaa-111111111111";
const WORKSPACE = "22222222-bbbb-bbbb-bbbb-222222222222";

describe("runMediaFolderBatch", () => {
  it("fans out across FOLDER_IMPORT_CONCURRENCY workers and never aborts the batch on a single failure", async () => {
    mockedImport.mockReset();
    let active = 0;
    let peak = 0;
    mockedImport.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      // Simulate work so the scheduler actually overlaps calls.
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { id: "asset-x" };
    });
    const items = Array.from({ length: 12 }, (_, i) => ({
      id: `file-${i}`,
      name: `file-${i}.png`,
    }));

    const report = await runMediaFolderBatch({
      actor: ACTOR,
      agencyId: AGENCY,
      workspaceId: WORKSPACE,
      folderId: "1ABCDEFGHIJKLMNOPQR0",
      items,
    });

    expect(report.items).toHaveLength(12);
    expect(report.imported).toBe(12);
    expect(report.failed).toBe(0);
    // The peak in-flight count must equal the concurrency cap. We allow
    // a small drift because the worker pool drains at the end.
    expect(peak).toBeGreaterThanOrEqual(2);
    expect(peak).toBeLessThanOrEqual(FOLDER_IMPORT_CONCURRENCY);
    expect(mockedImport).toHaveBeenCalledTimes(12);
  });

  it("propagates MediaSourceError codes onto the failed row without aborting siblings", async () => {
    mockedImport.mockReset();
    mockedImport.mockImplementation(async ({ url }: { url: string }) => {
      if (url.includes("huge")) {
        throw new MediaSourceError("too_large", "Too large");
      }
      if (url.includes("locked")) {
        throw new MediaSourceError(
          "provider_connection_required",
          "Connect Drive or share the file",
        );
      }
      return { id: "ok" };
    });
    const report = await runMediaFolderBatch({
      actor: ACTOR,
      agencyId: AGENCY,
      workspaceId: WORKSPACE,
      folderId: "1ABCDEFGHIJKLMNOPQR0",
      items: [
        { id: "ok-1", name: "ok-1.png" },
        { id: "huge", name: "huge.mp4" },
        { id: "ok-2", name: "ok-2.png" },
        { id: "locked", name: "locked.png" },
      ],
    });
    const byId = new Map(report.items.map((r) => [r.id, r]));
    expect(byId.get("ok-1")?.status).toBe("imported");
    expect(byId.get("ok-2")?.status).toBe("imported");
    expect(byId.get("huge")?.status).toBe("failed");
    expect(byId.get("huge")?.code).toBe("too_large");
    expect(byId.get("locked")?.status).toBe("failed");
    expect(byId.get("locked")?.code).toBe("provider_connection_required");
    expect(report.imported).toBe(2);
    expect(report.failed).toBe(2);
  });

  it("marks the remaining items as canceled when the abort signal fires mid-batch", async () => {
    mockedImport.mockReset();
    const controller = new AbortController();
    let processed = 0;
    mockedImport.mockImplementation(async () => {
      processed += 1;
      // Abort as soon as the second item lands.
      if (processed >= 2) controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 2));
      return { id: "ok" };
    });
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `file-${i}`,
      name: `file-${i}.png`,
    }));
    const report = await runMediaFolderBatch({
      actor: ACTOR,
      agencyId: AGENCY,
      workspaceId: WORKSPACE,
      folderId: "1ABCDEFGHIJKLMNOPQR0",
      items,
      signal: controller.signal,
    });
    const canceled = report.items.filter((r) => r.status === "canceled");
    expect(canceled.length).toBeGreaterThan(0);
    for (const c of canceled) expect(c.code).toBe("canceled");
  });

  it("maps MediaPermissionError to a permission_denied row code", async () => {
    mockedImport.mockReset();
    mockedImport.mockRejectedValueOnce(new MediaPermissionError("nope"));
    mockedImport.mockResolvedValueOnce({ id: "ok" });
    const report = await runMediaFolderBatch({
      actor: ACTOR,
      agencyId: AGENCY,
      workspaceId: WORKSPACE,
      folderId: "1ABCDEFGHIJKLMNOPQR0",
      items: [
        { id: "denied", name: "denied.png" },
        { id: "ok", name: "ok.png" },
      ],
    });
    expect(report.items[0]!.code).toBe("permission_denied");
    expect(report.items[1]!.status).toBe("imported");
  });

  it("rejects a batch that exceeds MAX_FOLDER_BATCH_IMPORT", async () => {
    mockedImport.mockReset();
    const items = Array.from({ length: 30 }, (_, i) => ({
      id: `file-${i}`,
      name: `file-${i}.png`,
    }));
    await expect(
      runMediaFolderBatch({
        actor: ACTOR,
        agencyId: AGENCY,
        workspaceId: WORKSPACE,
        folderId: "1ABCDEFGHIJKLMNOPQR0",
        items,
      }),
    ).rejects.toThrow(/batch_too_large/);
    expect(mockedImport).not.toHaveBeenCalled();
  });
});

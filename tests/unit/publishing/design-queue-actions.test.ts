import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({ auth: vi.fn() }));
const archiveMock = vi.hoisted(() => ({ bulkArchiveContentItems: vi.fn() }));
const loggerMock = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/config", () => authMock);
vi.mock("@/lib/observability/logger", () => loggerMock);
vi.mock("@/features/content/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/content/server")>();
  return { ...actual, ...archiveMock };
});

const { PermissionDeniedError } = await import("@/lib/auth/policy");
const { revalidatePath } = await import("next/cache");
const { bulkArchiveDesignQueueAction } =
  await import("@/app/(app)/app/a/[agencySlug]/w/[slug]/design-queue/actions");

const validInput = {
  workspaceId: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
  contentItemIds: ["bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"],
};

beforeEach(() => {
  authMock.auth.mockReset().mockResolvedValue({ user: { id: "user-1" } });
  archiveMock.bulkArchiveContentItems.mockReset();
  loggerMock.logError.mockReset();
  vi.mocked(revalidatePath).mockReset();
});

describe("bulk archive design queue action error boundary", () => {
  it("returns a stable code when the user is signed out", async () => {
    authMock.auth.mockResolvedValueOnce(null);

    const result = await bulkArchiveDesignQueueAction(validInput);

    expect(result).toEqual({ errorCode: "unauthenticated" });
    expect(archiveMock.bulkArchiveContentItems).not.toHaveBeenCalled();
  });

  it("rejects invalid selections without returning validator details", async () => {
    const result = await bulkArchiveDesignQueueAction({
      workspaceId: "workspace",
      contentItemIds: [],
    });

    expect(result).toEqual({ errorCode: "invalidSelection" });
    expect(archiveMock.bulkArchiveContentItems).not.toHaveBeenCalled();
  });

  it("maps permission denials to a stable code", async () => {
    archiveMock.bulkArchiveContentItems.mockRejectedValue(
      new PermissionDeniedError("bulk_archive_content"),
    );

    const result = await bulkArchiveDesignQueueAction(validInput);

    expect(result).toEqual({ errorCode: "forbidden" });
    expect(loggerMock.logError).not.toHaveBeenCalled();
  });

  it("logs unexpected persistence errors and returns safe copy state", async () => {
    const error = new Error("postgres://planner:credential-shaped-secret@db.test/planner");
    archiveMock.bulkArchiveContentItems.mockRejectedValue(error);

    const result = await bulkArchiveDesignQueueAction(validInput);

    expect(result).toEqual({ errorCode: "failed" });
    expect(JSON.stringify(result)).not.toContain("credential-shaped-secret");
    expect(loggerMock.logError).toHaveBeenCalledWith("design_queue.bulk_archive_failed", {
      err: error,
      workspaceId: validInput.workspaceId,
    });
  });

  it("keeps the successful archive result and revalidation behavior", async () => {
    archiveMock.bulkArchiveContentItems.mockResolvedValue({
      archivedIds: validInput.contentItemIds,
      skippedIds: [],
    });

    const result = await bulkArchiveDesignQueueAction(validInput);

    expect(result).toEqual({ ok: true, archivedIds: validInput.contentItemIds, skippedIds: [] });
    expect(revalidatePath).toHaveBeenCalledWith("/app");
  });
});

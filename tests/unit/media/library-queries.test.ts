import { beforeEach, describe, expect, it, vi } from "vitest";

const isAgencyMemberMock = vi.fn();
const accessibleWorkspaceIdsForActorMock = vi.fn();
const selectMock = vi.fn();

vi.mock("@/lib/auth/policy", () => ({ isAgencyMember: isAgencyMemberMock }));
vi.mock("@/lib/media/accessible-workspaces", () => ({
  accessibleWorkspaceIdsForActor: accessibleWorkspaceIdsForActorMock,
}));
vi.mock("@/lib/db", () => ({ db: { select: selectMock } }));

type QueryChain = {
  from: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  leftJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

function queryChain(result: unknown): QueryChain {
  const chain = {} as QueryChain;
  const continueQuery = () => chain;
  chain.from = vi.fn(continueQuery);
  chain.innerJoin = vi.fn(continueQuery);
  chain.leftJoin = vi.fn(continueQuery);
  chain.where = vi.fn(continueQuery);
  chain.groupBy = vi.fn(continueQuery);
  chain.orderBy = vi.fn(continueQuery);
  chain.limit = vi.fn().mockResolvedValue(result);
  return chain;
}

async function loadQueries() {
  vi.resetModules();
  return import("@/features/media/library-queries.server");
}

describe("media library queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAgencyMemberMock.mockResolvedValue(true);
    accessibleWorkspaceIdsForActorMock.mockResolvedValue(["22222222-2222-4222-8222-222222222222"]);
  });

  it("denies folder audit reads for an inaccessible workspace before querying", async () => {
    const { getMediaFolderAudit } = await loadQueries();

    await expect(
      getMediaFolderAudit(
        { id: "user-1" },
        {
          agencyId: "11111111-1111-4111-8111-111111111111",
          workspaceId: "33333333-3333-4333-8333-333333333333",
        },
      ),
    ).rejects.toMatchObject({ name: "MediaPermissionError" });
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("preserves folder audit projection and defaults a missing actor name", async () => {
    selectMock.mockReturnValueOnce(
      queryChain([
        {
          id: "event-1",
          reason: "content_moved",
          fromFolderId: null,
          toFolderId: "folder-1",
          contentItemId: "content-1",
          mediaAssetId: "asset-1",
          reconciledAt: new Date("2026-10-21T10:00:00.000Z"),
          actorName: null,
        },
      ]),
    );
    const { getMediaFolderAudit } = await loadQueries();

    const events = await getMediaFolderAudit(
      { id: "user-1" },
      {
        agencyId: "11111111-1111-4111-8111-111111111111",
        workspaceId: "22222222-2222-4222-8222-222222222222",
        limit: 5,
      },
    );

    expect(events).toEqual([
      {
        id: "event-1",
        reason: "content_moved",
        fromFolderId: null,
        toFolderId: "folder-1",
        contentItemId: "content-1",
        mediaAssetId: "asset-1",
        reconciledAt: "2026-10-21T10:00:00.000Z",
        actorName: "Unknown",
      },
    ]);
    expect(selectMock).toHaveBeenCalledOnce();
  });

  it("denies filter queries for an inaccessible workspace before querying", async () => {
    const { getMediaLibraryFilters } = await loadQueries();

    await expect(
      getMediaLibraryFilters(
        { id: "user-1" },
        {
          agencyId: "11111111-1111-4111-8111-111111111111",
          workspaceId: "33333333-3333-4333-8333-333333333333",
        },
      ),
    ).rejects.toMatchObject({ name: "MediaPermissionError" });
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("returns tag and uploader facets for the authorized workspace", async () => {
    const tags = [{ name: "launch", count: 3 }];
    const uploaders = [{ id: "user-2", name: "Designer", count: 4 }];
    selectMock.mockReturnValueOnce(queryChain(tags)).mockReturnValueOnce(queryChain(uploaders));
    const { getMediaLibraryFilters } = await loadQueries();

    const filters = await getMediaLibraryFilters(
      { id: "user-1" },
      {
        agencyId: "11111111-1111-4111-8111-111111111111",
        workspaceId: "22222222-2222-4222-8222-222222222222",
      },
    );

    expect(filters).toEqual({ tags, uploaders });
    expect(isAgencyMemberMock).toHaveBeenCalledWith(
      { id: "user-1" },
      "11111111-1111-4111-8111-111111111111",
    );
    expect(selectMock).toHaveBeenCalledTimes(2);
  });

  it("denies filter queries to non-members before resolving workspace scope", async () => {
    isAgencyMemberMock.mockResolvedValue(false);
    const { getMediaLibraryFilters } = await loadQueries();

    await expect(
      getMediaLibraryFilters(
        { id: "user-1" },
        { agencyId: "11111111-1111-4111-8111-111111111111" },
      ),
    ).rejects.toMatchObject({ name: "MediaPermissionError" });

    expect(accessibleWorkspaceIdsForActorMock).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
  });
});

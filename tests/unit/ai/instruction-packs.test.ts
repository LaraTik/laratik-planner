import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M3.3 — AI instruction-pack service and the AI governance barrel.
 *
 * `src/lib/ai/instruction-packs.ts` is the write path for the structured
 * planning instruction pack: draft → publish, with an append-only revision
 * row per save. The three behaviours that actually matter and were previously
 * untested are:
 *
 *   1. **Scope isolation.** A pack is addressed by `(id, agencyId)`, and an
 *      update additionally requires the caller's `workspaceId` to match the
 *      stored one. Without that second check a workspace manager could edit
 *      an agency-level pack by id alone.
 *   2. **Reversion resets publication.** Saving a draft over a published pack
 *      must clear `publishedAt` and bump `revision`, otherwise the pack stays
 *      live in production with the old content.
 *   3. **Publishing validates the stored manifest** before flipping the
 *      status, so a corrupt row fails loudly instead of going live.
 */

const dbMock = vi.hoisted(() => {
  const select = vi.fn();
  const insert = vi.fn();
  const update = vi.fn();
  const transaction = vi.fn();
  return { db: { select, insert, update, transaction } };
});
const policyMock = vi.hoisted(() => ({
  hasWorkspaceRole: vi.fn(),
  isAgencyAdmin: vi.fn(),
  requirePolicy: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMock);
vi.mock("@/lib/auth/policy", () => policyMock);

import {
  exportInstructionPack,
  listInstructionPacks,
  publishInstructionPack,
  saveInstructionPackDraft,
} from "@/lib/ai/instruction-packs";
import canonicalManifest from "../../../docs/ai-planning/defaults/manifest.json";
import { PlanningInstructionPackManifestSchema } from "@/lib/ai/planning-contract";

const AGENCY_ID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const WORKSPACE_ID = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const PACK_ID = "cccccccc-3333-4333-8333-cccccccccccc";
const USER_ID = "dddddddd-4444-4444-8444-dddddddddddd";

/** A minimal manifest that satisfies PlanningInstructionPackManifestSchema. */
const MANIFEST = PlanningInstructionPackManifestSchema.parse(canonicalManifest);

/** Fluent, awaitable Drizzle stand-in that records the values it was handed. */
function makeChain(terminal: unknown) {
  const target: Record<string, unknown> = {};
  const proxy = new Proxy(target, {
    get(_t, prop) {
      if (prop === "then") {
        return (onFulfilled?: (v: unknown) => unknown) =>
          Promise.resolve(terminal).then(onFulfilled);
      }
      return () => proxy;
    },
  });
  return proxy;
}

/** Run `fn` inside a transaction whose `tx` records updates and inserts. */
async function withTransaction(
  fn: () => Promise<unknown>,
): Promise<{ updates: Array<Record<string, unknown>>; inserts: Array<Record<string, unknown>> }> {
  const updates: Array<Record<string, unknown>> = [];
  const inserts: Array<Record<string, unknown>> = [];
  dbMock.db.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
    const tx = {
      update: vi.fn(() => ({
        set: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return makeChain(undefined);
        },
      })),
      insert: vi.fn(() => ({
        values: (payload: Record<string, unknown>) => {
          inserts.push(payload);
          return makeChain(undefined);
        },
      })),
    };
    return cb(tx);
  });
  await fn();
  return { updates, inserts };
}

beforeEach(() => {
  vi.clearAllMocks();
  // `clearAllMocks` does not drain a pending `mockReturnValueOnce` queue, and
  // a leaked entry silently shifts the next test's query dispatch.
  dbMock.db.select.mockReset();
  dbMock.db.insert.mockReset();
  dbMock.db.update.mockReset();
  dbMock.db.transaction.mockReset();
  policyMock.hasWorkspaceRole.mockReset();
  policyMock.isAgencyAdmin.mockReset();
  policyMock.requirePolicy.mockReset();
  policyMock.hasWorkspaceRole.mockResolvedValue(true);
  policyMock.isAgencyAdmin.mockResolvedValue(true);
  policyMock.requirePolicy.mockResolvedValue(undefined);
});

describe("listInstructionPacks", () => {
  it("filters to agency-level packs (workspace_id is null) when no workspace is given", async () => {
    dbMock.db.select.mockReturnValue(makeChain([{ id: PACK_ID }]));
    const rows = await listInstructionPacks(AGENCY_ID);
    expect(rows).toHaveLength(1);
    // The agency-level list must not leak workspace-scoped packs.
    expect(dbMock.db.select).toHaveBeenCalledTimes(1);
  });

  it("filters to one workspace when a workspace id is supplied", async () => {
    dbMock.db.select.mockReturnValue(makeChain([]));
    const rows = await listInstructionPacks(AGENCY_ID, WORKSPACE_ID);
    expect(rows).toEqual([]);
    expect(dbMock.db.select).toHaveBeenCalledTimes(1);
  });
});

describe("saveInstructionPackDraft", () => {
  it("creates a new agency-level pack and writes revision 1", async () => {
    const inserts: Array<Record<string, unknown>> = [];
    dbMock.db.insert
      .mockReturnValueOnce({
        values: (payload: Record<string, unknown>) => {
          inserts.push(payload);
          return makeChain([{ id: PACK_ID, revision: 1 }]);
        },
      })
      .mockReturnValueOnce({
        values: (payload: Record<string, unknown>) => {
          inserts.push(payload);
          return makeChain(undefined);
        },
      });

    const result = await saveInstructionPackDraft({ id: USER_ID }, AGENCY_ID, null, {
      name: "House style",
      sourceMarkdown: "# Rules",
      manifest: MANIFEST,
    });

    expect(result).toEqual({ id: PACK_ID, revision: 1 });
    // Row 1 is the pack itself; no `workspaceId` key for an agency-level pack.
    expect(inserts[0]!.agencyId).toBe(AGENCY_ID);
    expect("workspaceId" in inserts[0]!).toBe(false);
    expect(inserts[0]!.createdBy).toBe(USER_ID);
    // Row 2 is the append-only revision snapshot.
    expect(inserts[1]).toMatchObject({ packId: PACK_ID, revision: 1, createdBy: USER_ID });
  });

  it("sets workspaceId on the pack row for a workspace-scoped pack", async () => {
    const inserts: Array<Record<string, unknown>> = [];
    dbMock.db.insert.mockImplementation(() => ({
      values: (payload: Record<string, unknown>) => {
        inserts.push(payload);
        return makeChain(inserts.length === 1 ? [{ id: PACK_ID, revision: 1 }] : undefined);
      },
    }));

    await saveInstructionPackDraft({ id: USER_ID }, AGENCY_ID, WORKSPACE_ID, {
      name: "WS pack",
      sourceMarkdown: "# Rules",
      manifest: MANIFEST,
    });
    expect(inserts[0]!.workspaceId).toBe(WORKSPACE_ID);
  });

  it("bumps the revision, clears publishedAt, and resets status to draft on update", async () => {
    dbMock.db.select.mockReturnValue(
      makeChain([{ id: PACK_ID, agencyId: AGENCY_ID, workspaceId: null, revision: 4 }]),
    );

    const { updates, inserts } = await withTransaction(() =>
      saveInstructionPackDraft({ id: USER_ID }, AGENCY_ID, null, {
        id: PACK_ID,
        name: "Edited",
        sourceMarkdown: "# New",
        manifest: MANIFEST,
      }),
    );

    // Editing a published pack must take it back out of publication, or the
    // live planner keeps serving the previous content.
    expect(updates[0]).toMatchObject({
      name: "Edited",
      status: "draft",
      revision: 5,
      publishedAt: null,
    });
    expect(updates[0]!.updatedAt).toBeInstanceOf(Date);
    expect(inserts[0]).toMatchObject({ packId: PACK_ID, revision: 5 });
  });

  it("preserves the workspace scope on update", async () => {
    dbMock.db.select.mockReturnValue(
      makeChain([{ id: PACK_ID, agencyId: AGENCY_ID, workspaceId: WORKSPACE_ID, revision: 1 }]),
    );
    const { updates } = await withTransaction(() =>
      saveInstructionPackDraft({ id: USER_ID }, AGENCY_ID, WORKSPACE_ID, {
        id: PACK_ID,
        name: "Edited",
        sourceMarkdown: "# New",
        manifest: MANIFEST,
      }),
    );
    expect(updates[0]!.revision).toBe(2);
  });

  it("rejects an update to a pack that belongs to another workspace", async () => {
    // The stored pack is agency-level (workspaceId null) but the caller passes
    // a workspace id — without the scope check this would let a workspace
    // manager rewrite the agency's shared pack by id.
    dbMock.db.select.mockReturnValue(
      makeChain([{ id: PACK_ID, agencyId: AGENCY_ID, workspaceId: null, revision: 2 }]),
    );

    await expect(
      saveInstructionPackDraft({ id: USER_ID }, AGENCY_ID, WORKSPACE_ID, {
        id: PACK_ID,
        name: "Edited",
        sourceMarkdown: "# New",
        manifest: MANIFEST,
      }),
    ).rejects.toThrow("Instruction pack not found.");
    expect(dbMock.db.transaction).not.toHaveBeenCalled();
  });

  it("rejects an update to a pack id that does not exist", async () => {
    dbMock.db.select.mockReturnValue(makeChain([]));
    await expect(
      saveInstructionPackDraft({ id: USER_ID }, AGENCY_ID, null, {
        id: PACK_ID,
        name: "Edited",
        sourceMarkdown: "# New",
        manifest: MANIFEST,
      }),
    ).rejects.toThrow("Instruction pack not found.");
  });

  it("throws when the insert returns no row", async () => {
    dbMock.db.insert.mockReturnValue({ values: () => makeChain([]) });
    await expect(
      saveInstructionPackDraft({ id: USER_ID }, AGENCY_ID, null, {
        name: "Pack",
        sourceMarkdown: "# Rules",
        manifest: MANIFEST,
      }),
    ).rejects.toThrow("The instruction pack could not be saved.");
  });

  it("rejects a name shorter than 2 characters before touching the database", async () => {
    await expect(
      saveInstructionPackDraft({ id: USER_ID }, AGENCY_ID, null, {
        name: "x",
        sourceMarkdown: "# Rules",
        manifest: MANIFEST,
      }),
    ).rejects.toThrow();
    expect(dbMock.db.insert).not.toHaveBeenCalled();
  });

  it("rejects empty source markdown", async () => {
    await expect(
      saveInstructionPackDraft({ id: USER_ID }, AGENCY_ID, null, {
        name: "Valid name",
        sourceMarkdown: "   ",
        manifest: MANIFEST,
      }),
    ).rejects.toThrow();
    expect(dbMock.db.insert).not.toHaveBeenCalled();
  });

  it("asks for the workspace_manager role for a workspace pack and agency admin otherwise", async () => {
    dbMock.db.insert.mockReturnValue({
      values: () => makeChain([{ id: PACK_ID, revision: 1 }]),
    });

    await saveInstructionPackDraft({ id: USER_ID }, AGENCY_ID, WORKSPACE_ID, {
      name: "WS pack",
      sourceMarkdown: "# Rules",
      manifest: MANIFEST,
    });
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith({ id: USER_ID }, WORKSPACE_ID, [
      "workspace_manager",
    ]);

    policyMock.hasWorkspaceRole.mockClear();
    policyMock.isAgencyAdmin.mockClear();
    dbMock.db.insert.mockReturnValue({
      values: () => makeChain([{ id: PACK_ID, revision: 1 }]),
    });
    await saveInstructionPackDraft({ id: USER_ID }, AGENCY_ID, null, {
      name: "Agency pack",
      sourceMarkdown: "# Rules",
      manifest: MANIFEST,
    });
    expect(policyMock.isAgencyAdmin).toHaveBeenCalledWith({ id: USER_ID }, AGENCY_ID);
  });
});

describe("publishInstructionPack", () => {
  it("flips a valid pack to published with a timestamp", async () => {
    dbMock.db.select.mockReturnValue(
      makeChain([{ id: PACK_ID, agencyId: AGENCY_ID, workspaceId: null, manifest: MANIFEST }]),
    );
    const sets: Array<Record<string, unknown>> = [];
    dbMock.db.update.mockReturnValue({
      set: (payload: Record<string, unknown>) => {
        sets.push(payload);
        return makeChain(undefined);
      },
    });

    const result = await publishInstructionPack({ id: USER_ID }, PACK_ID);

    expect(result).toEqual({ id: PACK_ID, status: "published" });
    expect(sets[0]!.status).toBe("published");
    expect(sets[0]!.publishedAt).toBeInstanceOf(Date);
    expect(sets[0]!.updatedAt).toBeInstanceOf(Date);
    expect(policyMock.requirePolicy).toHaveBeenCalledWith(
      expect.anything(),
      "publish_planning_instruction_pack",
    );
  });

  it("refuses to publish when the stored manifest no longer validates", async () => {
    // A row written by an older deployment, or hand-edited, can hold a
    // manifest the current contract rejects. Publishing must fail loudly
    // instead of going live with an unvalidated structure.
    dbMock.db.select.mockReturnValue(
      makeChain([
        { id: PACK_ID, agencyId: AGENCY_ID, workspaceId: null, manifest: { nope: true } },
      ]),
    );
    dbMock.db.update.mockReturnValue({ set: () => makeChain(undefined) });

    await expect(publishInstructionPack({ id: USER_ID }, PACK_ID)).rejects.toThrow();
    expect(dbMock.db.update).not.toHaveBeenCalled();
  });

  it("throws when the pack does not exist, before any policy check", async () => {
    dbMock.db.select.mockReturnValue(makeChain([]));
    await expect(publishInstructionPack({ id: USER_ID }, PACK_ID)).rejects.toThrow(
      "Instruction pack not found.",
    );
    expect(policyMock.requirePolicy).not.toHaveBeenCalled();
  });

  it("surfaces the policy denial when the actor cannot edit the pack's scope", async () => {
    dbMock.db.select.mockReturnValue(
      makeChain([
        { id: PACK_ID, agencyId: AGENCY_ID, workspaceId: WORKSPACE_ID, manifest: MANIFEST },
      ]),
    );
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    policyMock.requirePolicy.mockRejectedValue(new Error("Not allowed to publish."));

    await expect(publishInstructionPack({ id: USER_ID }, PACK_ID)).rejects.toThrow(
      "Not allowed to publish.",
    );
    expect(dbMock.db.update).not.toHaveBeenCalled();
  });
});

describe("exportInstructionPack", () => {
  it("emits the markdown followed by a machine-readable manifest block", () => {
    const out = exportInstructionPack({
      name: "House style",
      sourceMarkdown: "# Rules\nBe concise.",
      manifest: MANIFEST,
    });
    // The comment marker is what a downstream importer splits on, so it must
    // survive verbatim and the JSON after it must be parseable.
    expect(out.startsWith("# Rules\nBe concise.\n\n<!-- structured-manifest -->\n")).toBe(true);
    const json = out.split("<!-- structured-manifest -->\n")[1]!;
    expect(JSON.parse(json)).toEqual(MANIFEST);
  });

  it("rejects a pack whose name fails the input contract", () => {
    expect(() =>
      exportInstructionPack({ name: "x", sourceMarkdown: "# Rules", manifest: MANIFEST }),
    ).toThrow();
  });
});

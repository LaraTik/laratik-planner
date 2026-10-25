import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

describe("Workspace AI Assistant session privacy and prompt governance", () => {
  let db: typeof import("@/lib/db").db;
  let schema: typeof import("@/lib/db/schema");
  let sql: typeof import("drizzle-orm").sql;
  let assistant: typeof import("@/features/workspace-assistant/server");
  let skillGovernance: typeof import("@/features/workspace-assistant/skill-governance.server");
  let agencyId: string;
  let workspaceAId: string;
  let workspaceBId: string;
  let workspaceManagerA: { id: string };
  let plannerA: { id: string };
  let workspaceManagerB: { id: string };
  let agencyAdmin: { id: string };
  let secondAgencyAdmin: { id: string };

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    schema = await import("@/lib/db/schema");
    ({ sql } = await import("drizzle-orm"));
    assistant = await import("@/features/workspace-assistant/server");
    skillGovernance = await import("@/features/workspace-assistant/skill-governance.server");
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE agency, "user" CASCADE`);
    const [agency] = await db
      .insert(schema.agencies)
      .values({ name: "Assistant Test", slug: `assistant-${randomUUID()}` })
      .returning({ id: schema.agencies.id });
    if (!agency) throw new Error("Failed to seed assistant agency");
    agencyId = agency.id;

    async function createActor(input: { name: string; isAgencyAdmin?: boolean }) {
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `${input.name.toLowerCase().replaceAll(" ", "-")}-${randomUUID()}@example.test`,
          displayName: input.name,
        })
        .returning({ id: schema.users.id });
      if (!user) throw new Error("Failed to seed assistant user");
      await db.insert(schema.agencyMemberships).values({
        agencyId,
        userId: user.id,
        status: "active",
        isAgencyAdmin: input.isAgencyAdmin ?? false,
      });
      return user;
    }

    workspaceManagerA = await createActor({ name: "Workspace Manager A" });
    plannerA = await createActor({ name: "Content Planner A" });
    workspaceManagerB = await createActor({ name: "Workspace Manager B" });
    agencyAdmin = await createActor({ name: "Agency Admin", isAgencyAdmin: true });
    secondAgencyAdmin = await createActor({ name: "Second Agency Admin", isAgencyAdmin: true });

    async function createWorkspace(input: { name: string; managerId: string }) {
      const [workspace] = await db
        .insert(schema.workspaces)
        .values({
          agencyId,
          name: input.name,
          slug: `${input.name.toLowerCase().replaceAll(" ", "-")}-${randomUUID()}`,
          createdBy: input.managerId,
        })
        .returning({ id: schema.workspaces.id });
      if (!workspace) throw new Error("Failed to seed assistant workspace");
      const [membership] = await db
        .insert(schema.workspaceMemberships)
        .values({ workspaceId: workspace.id, userId: input.managerId, status: "active" })
        .returning({ id: schema.workspaceMemberships.id });
      if (!membership) throw new Error("Failed to seed assistant workspace membership");
      await db.insert(schema.workspaceMembershipRoles).values({
        workspaceMembershipId: membership.id,
        role: "workspace_manager",
      });
      return workspace.id;
    }

    workspaceAId = await createWorkspace({
      name: "Assistant Workspace A",
      managerId: workspaceManagerA.id,
    });
    workspaceBId = await createWorkspace({
      name: "Assistant Workspace B",
      managerId: workspaceManagerB.id,
    });

    for (const user of [plannerA, agencyAdmin]) {
      const [membership] = await db
        .insert(schema.workspaceMemberships)
        .values({ workspaceId: workspaceAId, userId: user.id, status: "active" })
        .returning({ id: schema.workspaceMemberships.id });
      if (!membership) throw new Error("Failed to seed assistant planner membership");
      await db.insert(schema.workspaceMembershipRoles).values({
        workspaceMembershipId: membership.id,
        role: "content_planner",
      });
    }
  });

  afterAll(async () => {
    await db?.execute(sql`TRUNCATE agency, "user" CASCADE`);
  });

  it("keeps session metadata private, returns no transcript, and enforces archive state", async () => {
    const conversation = await assistant.createAssistantConversation(
      { id: workspaceManagerA.id },
      workspaceAId,
      "November review",
      "plan",
    );
    expect(
      await assistant.listAssistantConversations({ id: workspaceManagerA.id }, workspaceAId),
    ).toMatchObject([{ title: "November review", mode: "plan" }]);
    expect(
      await assistant.getAssistantConversation({ id: plannerA.id }, workspaceAId, conversation.id),
    ).toBe(null);
    expect(
      await assistant.listAssistantConversations({ id: plannerA.id }, workspaceAId),
    ).toHaveLength(0);

    await assistant.updateAssistantConversation(
      { id: workspaceManagerA.id },
      workspaceAId,
      conversation.id,
      { archived: true, mode: "apply" },
    );
    expect(
      await assistant.getAssistantConversation(
        { id: workspaceManagerA.id },
        workspaceAId,
        conversation.id,
      ),
    ).toBe(null);
    expect(
      await assistant.getAssistantConversation(
        { id: workspaceManagerA.id },
        workspaceAId,
        conversation.id,
        true,
      ),
    ).toMatchObject({
      title: "November review",
      mode: "apply",
      messages: [],
    });
    expect(await db.select().from(schema.workspaceAssistantMessages)).toEqual([]);
  });

  it("defaults conversation replies to Arabic and persists explicit language and pin state", async () => {
    const arabicConversation = await assistant.createAssistantConversation(
      { id: workspaceManagerA.id },
      workspaceAId,
      "Arabic default",
    );
    const englishConversation = await assistant.createAssistantConversation(
      { id: workspaceManagerA.id },
      workspaceAId,
      "English override",
      "ask",
      "en",
    );

    expect(arabicConversation).toMatchObject({ responseLocale: "ar", pinnedAt: null });
    expect(englishConversation).toMatchObject({ responseLocale: "en", pinnedAt: null });

    expect(
      await assistant.updateAssistantConversation(
        { id: workspaceManagerA.id },
        workspaceAId,
        englishConversation.id,
        { responseLocale: "en", pinned: true },
      ),
    ).toBe(true);
    expect(
      await assistant.getAssistantConversation(
        { id: workspaceManagerA.id },
        workspaceAId,
        englishConversation.id,
      ),
    ).toMatchObject({ responseLocale: "en" });

    expect(
      await assistant.listAssistantConversations({ id: workspaceManagerA.id }, workspaceAId),
    ).toEqual([
      expect.objectContaining({
        id: englishConversation.id,
        responseLocale: "en",
        pinnedAt: expect.any(Date),
      }),
      expect.objectContaining({
        id: arabicConversation.id,
        responseLocale: "ar",
        pinnedAt: null,
      }),
    ]);
  });

  it("isolates private/workspace prompts and requires agency-admin publication", async () => {
    const privatePrompt = await assistant.createAssistantPrompt(
      { id: plannerA.id },
      agencyId,
      workspaceAId,
      {
        scope: "private",
        name: "Private prompt",
        purpose: "For my own use",
        goal: "Review {{plan_month}} for {{audience}}",
        instructions: "Use the bounded plan context only for {{audience}}.",
        tags: ["private"],
        parameters: [
          { key: "plan_month", type: "month", label: "Plan month", required: true },
          { key: "audience", type: "text", label: "Audience", required: true },
        ],
      },
    );
    const workspacePrompt = await assistant.createAssistantPrompt(
      { id: workspaceManagerA.id },
      agencyId,
      workspaceAId,
      {
        scope: "workspace",
        name: "Workspace prompt",
        purpose: "Shared within workspace A",
        goal: "Summarize the plan",
        instructions: "Cite supplied evidence.",
        tags: ["review"],
        parameters: [],
      },
    );
    await assistant.publishAssistantPrompt(
      { id: workspaceManagerA.id },
      agencyId,
      workspaceAId,
      workspacePrompt.id,
    );
    const pendingAgencyPrompt = await assistant.createAssistantPrompt(
      { id: plannerA.id },
      agencyId,
      workspaceAId,
      {
        scope: "agency",
        name: "Agency prompt",
        purpose: "Await central approval",
        goal: "Review content coverage",
        instructions: "Use only authorized evidence.",
        tags: ["agency"],
        parameters: [],
      },
    );

    expect(pendingAgencyPrompt.status).toBe("pending_approval");
    expect(
      await assistant.resolveAssistantPrompt(
        { id: plannerA.id },
        agencyId,
        workspaceAId,
        privatePrompt.id,
      ),
    ).toMatchObject({
      parameters: [
        { key: "plan_month", type: "month", required: true },
        { key: "audience", type: "text", required: true },
      ],
    });
    expect(
      await assistant.resolveAssistantPrompt(
        { id: workspaceManagerB.id },
        agencyId,
        workspaceBId,
        privatePrompt.id,
      ),
    ).toBeNull();
    expect(
      await assistant.resolveAssistantPrompt(
        { id: workspaceManagerB.id },
        agencyId,
        workspaceBId,
        workspacePrompt.id,
      ),
    ).toBeNull();

    await expect(
      assistant.publishAssistantPrompt(
        { id: workspaceManagerA.id },
        agencyId,
        workspaceAId,
        pendingAgencyPrompt.id,
      ),
    ).rejects.toThrow("workspace_assistant_prompt_forbidden");
    await assistant.publishAssistantPrompt(
      { id: agencyAdmin.id },
      agencyId,
      workspaceAId,
      pendingAgencyPrompt.id,
    );
    expect(
      await assistant.resolveAssistantPrompt(
        { id: workspaceManagerB.id },
        agencyId,
        workspaceBId,
        pendingAgencyPrompt.id,
      ),
    ).not.toBeNull();
  });

  it("isolates knowledge by workspace and records immutable revisions", async () => {
    const entry = await assistant.createAssistantKnowledge(
      { id: workspaceManagerA.id },
      agencyId,
      workspaceAId,
      {
        scope: "workspace",
        category: "brand",
        title: "Workspace A voice",
        content: "Use clear, practical language for Workspace A.",
        tags: ["voice"],
        verificationStatus: "verified",
      },
    );
    const agencyEntry = await assistant.createAssistantKnowledge(
      { id: agencyAdmin.id },
      agencyId,
      workspaceAId,
      {
        scope: "agency",
        category: "operations",
        title: "Agency review policy",
        content: "Every recommendation needs evidence.",
        tags: ["policy"],
        verificationStatus: "unverified",
      },
    );

    const workspaceBKnowledge = await assistant.listAssistantKnowledge(
      { id: workspaceManagerB.id },
      agencyId,
      workspaceBId,
    );
    // Built-in defaults are returned for every workspace, so isolation is
    // asserted over the stored entries rather than over the whole list.
    expect(workspaceBKnowledge.filter((row) => !row.isBuiltIn).map((row) => row.id)).toEqual([
      agencyEntry.id,
    ]);
    expect(workspaceBKnowledge.map((row) => row.id)).not.toContain(entry.id);
    expect(workspaceBKnowledge.filter((row) => row.isBuiltIn)).toHaveLength(9);
    expect(
      workspaceBKnowledge.every(
        (row) => row.isBuiltIn || row.id === agencyEntry.id || row.id === entry.id,
      ),
    ).toBe(true);
    const workspaceASearch = await assistant.searchAssistantKnowledge(
      { id: workspaceManagerA.id },
      agencyId,
      workspaceAId,
      "voice strategy",
    );
    expect(workspaceASearch[0]).toMatchObject({
      id: entry.id,
      verificationStatus: "verified",
      revision: 1,
    });
    expect(workspaceASearch.map((row) => row.id)).not.toContain(agencyEntry.id);
    expect(
      await assistant.listAssistantKnowledge({ id: workspaceManagerB.id }, agencyId, workspaceBId),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: agencyEntry.id, scope: "agency" })]),
    );

    await expect(
      assistant.createAssistantKnowledge({ id: plannerA.id }, agencyId, workspaceAId, {
        scope: "workspace",
        category: "reference",
        title: "Planner cannot publish knowledge",
        content: "No manager role.",
        tags: [],
        verificationStatus: "unverified",
      }),
    ).rejects.toThrow("workspace_assistant_knowledge_forbidden");

    const updated = await assistant.updateAssistantKnowledge(
      { id: workspaceManagerA.id },
      agencyId,
      workspaceAId,
      entry.id,
      1,
      {
        scope: "workspace",
        category: "brand",
        title: "Workspace A voice",
        content: "Use concise, practical language for Workspace A.",
        tags: ["voice", "approved"],
        verificationStatus: "verified",
      },
    );
    expect(updated).toMatchObject({ status: "updated", row: { revision: 2 } });
    await expect(
      assistant.updateAssistantKnowledge(
        { id: workspaceManagerA.id },
        agencyId,
        workspaceAId,
        entry.id,
        1,
        {
          scope: "workspace",
          category: "brand",
          title: "Stale edit",
          content: "This must not replace the newer revision.",
          tags: [],
          verificationStatus: "outdated",
        },
      ),
    ).resolves.toEqual({ status: "conflict" });
    expect(
      await assistant.listAssistantKnowledgeRevisions(
        { id: workspaceManagerA.id },
        agencyId,
        workspaceAId,
        entry.id,
      ),
    ).toMatchObject([
      { revision: 2, snapshot: { content: "Use concise, practical language for Workspace A." } },
      { revision: 1, snapshot: { content: "Use clear, practical language for Workspace A." } },
    ]);
    expect(agencyEntry.scope).toBe("agency");
  });

  it("applies an exact confirmed title proposal once through the content service", async () => {
    const [item] = await db
      .insert(schema.contentItems)
      .values({
        workspaceId: workspaceAId,
        title: "Original draft title",
        format: "static_post",
        brief: "Original brief",
        plannedPublishAt: new Date("2026-11-12T10:00:00.000Z"),
        contentOwnerId: workspaceManagerA.id,
        createdBy: workspaceManagerA.id,
      })
      .returning({ id: schema.contentItems.id });
    if (!item) throw new Error("Failed to seed proposal content item");
    const conversation = await assistant.createAssistantConversation(
      { id: workspaceManagerA.id },
      workspaceAId,
      "Improve draft",
    );
    const proposal = await assistant.createAssistantProposal(
      { id: workspaceManagerA.id },
      workspaceAId,
      conversation.id,
      {
        contentItemId: item.id,
        expectedRevision: 0,
        field: "title",
        title: "Make the title more specific",
        beforeValue: "Original draft title",
        afterValue: "A clearer seasonal announcement",
        evidenceIds: [`content-item-${item.id}-revision-0`],
      },
    );
    expect(proposal).toMatchObject({ status: "proposed" });

    await expect(
      assistant.decideAssistantProposal(
        { id: workspaceManagerB.id },
        workspaceAId,
        proposal!.id,
        "apply",
      ),
    ).rejects.toThrow("workspace_assistant_forbidden");

    await expect(
      assistant.decideAssistantProposal(
        { id: workspaceManagerA.id },
        workspaceAId,
        proposal!.id,
        "apply",
      ),
    ).resolves.toEqual({ status: "applied", contentItemId: item.id });
    await expect(
      assistant.decideAssistantProposal(
        { id: workspaceManagerA.id },
        workspaceAId,
        proposal!.id,
        "apply",
      ),
    ).resolves.toEqual({ status: "already_applied" });

    const [updated] = await db
      .select({ title: schema.contentItems.title, revision: schema.contentItems.revision })
      .from(schema.contentItems)
      .where(sql`${schema.contentItems.id} = ${item.id}`)
      .limit(1);
    expect(updated).toEqual({ title: "A clearer seasonal announcement", revision: 1 });
    const events = await db
      .select({ id: schema.activityEvents.id })
      .from(schema.activityEvents)
      .where(sql`${schema.activityEvents.contentItemId} = ${item.id}`);
    expect(events).toHaveLength(1);
  });

  it("applies selected same-revision edits atomically and makes batch replay idempotent", async () => {
    const [item] = await db
      .insert(schema.contentItems)
      .values({
        workspaceId: workspaceAId,
        title: "Original campaign title",
        format: "static_post",
        brief: "Original campaign brief",
        plannedPublishAt: new Date("2026-11-12T10:00:00.000Z"),
        contentOwnerId: workspaceManagerA.id,
        createdBy: workspaceManagerA.id,
      })
      .returning({ id: schema.contentItems.id });
    if (!item) throw new Error("Failed to seed batch proposal content item");
    const conversation = await assistant.createAssistantConversation(
      { id: workspaceManagerA.id },
      workspaceAId,
      "Improve campaign draft",
    );
    const evidenceId = `content-item-${item.id}-revision-0`;
    const titleProposal = await assistant.createAssistantProposal(
      { id: workspaceManagerA.id },
      workspaceAId,
      conversation.id,
      {
        contentItemId: item.id,
        expectedRevision: 0,
        field: "title",
        title: "Use a more specific title",
        beforeValue: "Original campaign title",
        afterValue: "Autumn product launch",
        evidenceIds: [evidenceId],
      },
    );
    const briefProposal = await assistant.createAssistantProposal(
      { id: workspaceManagerA.id },
      workspaceAId,
      conversation.id,
      {
        contentItemId: item.id,
        expectedRevision: 0,
        field: "brief",
        title: "Clarify the campaign brief",
        beforeValue: "Original campaign brief",
        afterValue: "Introduce the autumn collection and invite people to explore it.",
        evidenceIds: [evidenceId],
      },
    );
    const scheduleProposal = await assistant.createAssistantProposal(
      { id: workspaceManagerA.id },
      workspaceAId,
      conversation.id,
      {
        contentItemId: item.id,
        expectedRevision: 0,
        field: "plannedPublishAt",
        title: "Move to a better publishing date",
        beforeValue: "2026-11-12T10:00:00.000Z",
        afterValue: "2026-11-14",
        evidenceIds: [evidenceId],
      },
    );
    if (!titleProposal || !briefProposal || !scheduleProposal)
      throw new Error("Failed to seed edit proposals");
    const proposalIds = [titleProposal.id, briefProposal.id, scheduleProposal.id];

    await expect(
      assistant.decideAssistantProposalBatch(
        { id: workspaceManagerB.id },
        workspaceAId,
        proposalIds,
      ),
    ).rejects.toThrow("workspace_assistant_forbidden");
    await expect(
      assistant.decideAssistantProposalBatch(
        { id: workspaceManagerA.id },
        workspaceAId,
        proposalIds,
      ),
    ).resolves.toMatchObject({
      status: "applied",
      contentItemId: item.id,
      proposalIds,
    });
    await expect(
      assistant.decideAssistantProposalBatch(
        { id: workspaceManagerA.id },
        workspaceAId,
        proposalIds,
      ),
    ).resolves.toMatchObject({ status: "already_applied" });

    const [updated] = await db
      .select({
        title: schema.contentItems.title,
        brief: schema.contentItems.brief,
        plannedPublishAt: schema.contentItems.plannedPublishAt,
        revision: schema.contentItems.revision,
      })
      .from(schema.contentItems)
      .where(sql`${schema.contentItems.id} = ${item.id}`)
      .limit(1);
    expect(updated).toEqual({
      title: "Autumn product launch",
      brief: "Introduce the autumn collection and invite people to explore it.",
      plannedPublishAt: new Date("2026-11-14T10:00:00.000Z"),
      revision: 1,
    });
    const events = await db
      .select({ id: schema.activityEvents.id })
      .from(schema.activityEvents)
      .where(sql`${schema.activityEvents.contentItemId} = ${item.id}`);
    expect(events).toHaveLength(1);
  });

  it("rejects a selected edit batch when its shared preview revision is stale", async () => {
    const [item] = await db
      .insert(schema.contentItems)
      .values({
        workspaceId: workspaceAId,
        title: "Original stale title",
        format: "static_post",
        brief: "Original stale brief",
        plannedPublishAt: new Date("2026-11-12T10:00:00.000Z"),
        contentOwnerId: workspaceManagerA.id,
        createdBy: workspaceManagerA.id,
      })
      .returning({ id: schema.contentItems.id });
    if (!item) throw new Error("Failed to seed stale batch content item");
    const conversation = await assistant.createAssistantConversation(
      { id: workspaceManagerA.id },
      workspaceAId,
      "Improve stale draft",
    );
    const evidenceId = `content-item-${item.id}-revision-0`;
    const proposals = await Promise.all(
      (["title", "brief"] as const).map((field) =>
        assistant.createAssistantProposal(
          { id: workspaceManagerA.id },
          workspaceAId,
          conversation.id,
          {
            contentItemId: item.id,
            expectedRevision: 0,
            field,
            title: `Update ${field}`,
            beforeValue: field === "title" ? "Original stale title" : "Original stale brief",
            afterValue: field === "title" ? "AI title" : "AI brief",
            evidenceIds: [evidenceId],
          },
        ),
      ),
    );
    if (!proposals[0] || !proposals[1]) throw new Error("Failed to seed stale edit proposals");
    await db
      .update(schema.contentItems)
      .set({ title: "Human-edited title", revision: 1 })
      .where(sql`${schema.contentItems.id} = ${item.id}`);

    await expect(
      assistant.decideAssistantProposalBatch({ id: workspaceManagerA.id }, workspaceAId, [
        proposals[0].id,
        proposals[1].id,
      ]),
    ).resolves.toEqual({ status: "stale" });
    const [updated] = await db
      .select({ title: schema.contentItems.title, brief: schema.contentItems.brief })
      .from(schema.contentItems)
      .where(sql`${schema.contentItems.id} = ${item.id}`)
      .limit(1);
    expect(updated).toEqual({ title: "Human-edited title", brief: "Original stale brief" });
    const proposalsAfter = await assistant.listAssistantProposals(
      { id: workspaceManagerA.id },
      workspaceAId,
      conversation.id,
    );
    expect(proposalsAfter.map(({ status }) => status)).toEqual(["stale", "stale"]);
  });

  it("applies an explicitly selected batch across multiple drafts as one atomic operation", async () => {
    const items = await db
      .insert(schema.contentItems)
      .values([
        {
          workspaceId: workspaceAId,
          title: "First original title",
          format: "static_post",
          brief: "First brief",
          plannedPublishAt: new Date("2026-11-12T10:00:00.000Z"),
          contentOwnerId: workspaceManagerA.id,
          createdBy: workspaceManagerA.id,
        },
        {
          workspaceId: workspaceAId,
          title: "Second original title",
          format: "static_post",
          brief: "Second brief",
          plannedPublishAt: new Date("2026-11-13T10:00:00.000Z"),
          contentOwnerId: workspaceManagerA.id,
          createdBy: workspaceManagerA.id,
        },
      ])
      .returning({ id: schema.contentItems.id });
    expect(items).toHaveLength(2);
    const first = items[0];
    const second = items[1];
    if (!first || !second) throw new Error("Failed to seed multi-item proposal content items");
    const conversation = await assistant.createAssistantConversation(
      { id: workspaceManagerA.id },
      workspaceAId,
      "Improve selected drafts",
    );
    const firstProposal = await assistant.createAssistantProposal(
      { id: workspaceManagerA.id },
      workspaceAId,
      conversation.id,
      {
        contentItemId: first.id,
        expectedRevision: 0,
        field: "title",
        title: "Improve the first title",
        beforeValue: "First original title",
        afterValue: "A clearer first campaign title",
        evidenceIds: [`content-item-${first.id}-revision-0`],
      },
    );
    const secondProposal = await assistant.createAssistantProposal(
      { id: workspaceManagerA.id },
      workspaceAId,
      conversation.id,
      {
        contentItemId: second.id,
        expectedRevision: 0,
        field: "title",
        title: "Improve the second title",
        beforeValue: "Second original title",
        afterValue: "A clearer second campaign title",
        evidenceIds: [`content-item-${second.id}-revision-0`],
      },
    );
    if (!firstProposal || !secondProposal) throw new Error("Failed to seed multi-item proposals");

    await expect(
      assistant.decideAssistantProposalBatch({ id: workspaceManagerA.id }, workspaceAId, [
        firstProposal.id,
        secondProposal.id,
      ]),
    ).resolves.toMatchObject({
      status: "applied",
      contentItemIds: [first.id, second.id].sort(),
      proposalIds: [firstProposal.id, secondProposal.id],
    });

    const updated = await db
      .select({
        id: schema.contentItems.id,
        title: schema.contentItems.title,
        revision: schema.contentItems.revision,
      })
      .from(schema.contentItems)
      .where(sql`${schema.contentItems.id} IN (${first.id}, ${second.id})`)
      .orderBy(schema.contentItems.id);
    expect(updated).toEqual(
      [
        { id: first.id, title: "A clearer first campaign title", revision: 1 },
        { id: second.id, title: "A clearer second campaign title", revision: 1 },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
  });

  it("marks a preview stale when a human edit changes its expected revision", async () => {
    const [item] = await db
      .insert(schema.contentItems)
      .values({
        workspaceId: workspaceAId,
        title: "Original draft title",
        format: "static_post",
        plannedPublishAt: new Date("2026-11-12T10:00:00.000Z"),
        contentOwnerId: workspaceManagerA.id,
        createdBy: workspaceManagerA.id,
      })
      .returning({ id: schema.contentItems.id });
    if (!item) throw new Error("Failed to seed proposal content item");
    const conversation = await assistant.createAssistantConversation(
      { id: workspaceManagerA.id },
      workspaceAId,
      "Improve draft",
    );
    const proposal = await assistant.createAssistantProposal(
      { id: workspaceManagerA.id },
      workspaceAId,
      conversation.id,
      {
        contentItemId: item.id,
        expectedRevision: 0,
        field: "brief",
        title: "Clarify the brief",
        beforeValue: "",
        afterValue: "Explain the seasonal offer in one sentence.",
        evidenceIds: [`content-item-${item.id}-revision-0`],
      },
    );
    if (!proposal) throw new Error("Failed to create assistant proposal");
    await db
      .update(schema.contentItems)
      .set({ brief: "Human updated this brief", revision: 1 })
      .where(sql`${schema.contentItems.id} = ${item.id}`);

    await expect(
      assistant.decideAssistantProposal(
        { id: workspaceManagerA.id },
        workspaceAId,
        proposal.id,
        "apply",
      ),
    ).resolves.toEqual({ status: "stale" });
    const [updated] = await db
      .select({ brief: schema.contentItems.brief, revision: schema.contentItems.revision })
      .from(schema.contentItems)
      .where(sql`${schema.contentItems.id} = ${item.id}`)
      .limit(1);
    expect(updated).toEqual({ brief: "Human updated this brief", revision: 1 });
  });

  it("applies a confirmed schedule proposal while preserving the planned time", async () => {
    const before = new Date("2026-11-12T10:35:00.000Z");
    const [item] = await db
      .insert(schema.contentItems)
      .values({
        workspaceId: workspaceAId,
        title: "Scheduled draft",
        format: "static_post",
        plannedPublishAt: before,
        contentOwnerId: workspaceManagerA.id,
        createdBy: workspaceManagerA.id,
      })
      .returning({ id: schema.contentItems.id });
    if (!item) throw new Error("Failed to seed schedule proposal content item");
    const conversation = await assistant.createAssistantConversation(
      { id: workspaceManagerA.id },
      workspaceAId,
      "Improve publishing date",
    );
    const proposal = await assistant.createAssistantProposal(
      { id: workspaceManagerA.id },
      workspaceAId,
      conversation.id,
      {
        contentItemId: item.id,
        expectedRevision: 0,
        field: "plannedPublishAt",
        title: "Move the post to November 13",
        beforeValue: before.toISOString(),
        afterValue: "2026-11-13",
        evidenceIds: [`content-item-${item.id}-revision-0`],
      },
    );
    expect(proposal).toMatchObject({ status: "proposed" });

    await expect(
      assistant.decideAssistantProposal(
        { id: workspaceManagerA.id },
        workspaceAId,
        proposal!.id,
        "apply",
      ),
    ).resolves.toEqual({ status: "applied", contentItemId: item.id });

    const [updated] = await db
      .select({
        plannedPublishAt: schema.contentItems.plannedPublishAt,
        revision: schema.contentItems.revision,
      })
      .from(schema.contentItems)
      .where(sql`${schema.contentItems.id} = ${item.id}`)
      .limit(1);
    expect(updated).toEqual({
      plannedPublishAt: new Date("2026-11-13T10:35:00.000Z"),
      revision: 1,
    });
  });

  it("replays sanitized run activity, scopes it to the owner, and records cancellation", async () => {
    const conversation = await assistant.createAssistantConversation(
      { id: workspaceManagerA.id },
      workspaceAId,
      "Private run session",
    );
    const run = await assistant.createAssistantRun(
      { id: workspaceManagerA.id },
      workspaceAId,
      conversation.id,
    );
    await assistant.recordAssistantRunEvent(run.id, "skills_selected", {
      skillIds: ["content-plan-review"],
      userMessage: "Never store this transcript text",
    });
    await assistant.recordAssistantRunEvent(run.id, "plan_analyzed", {
      itemCount: 12,
      findingCount: 2,
    });

    const visibleToOwner = await assistant.getAssistantRunEvents(
      { id: workspaceManagerA.id },
      workspaceAId,
      run.id,
      0,
      100,
    );
    expect(visibleToOwner?.status).toBe("running");
    expect(visibleToOwner?.events.map((event) => event.type)).toEqual([
      "run_started",
      "skills_selected",
      "plan_analyzed",
    ]);
    expect(JSON.stringify(visibleToOwner?.events)).not.toContain(
      "Never store this transcript text",
    );
    await expect(
      assistant.getAssistantRunEvents({ id: plannerA.id }, workspaceAId, run.id, 0, 100),
    ).resolves.toBeNull();

    await expect(
      assistant.requestAssistantRunCancellation({ id: workspaceManagerA.id }, workspaceAId, run.id),
    ).resolves.toEqual({ status: "cancelling" });
    await expect(assistant.isAssistantRunCancellationRequested(run.id)).resolves.toBe(true);
    await assistant.finishAssistantRun(run.id, "cancelled");

    const terminal = await assistant.getAssistantRunEvents(
      { id: workspaceManagerA.id },
      workspaceAId,
      run.id,
      visibleToOwner?.nextSequence ?? 0,
      100,
    );
    expect(terminal).toMatchObject({ status: "cancelled" });
    expect(terminal?.events.map((event) => event.type)).toEqual(["run_cancelled"]);

    const abandonedRun = await assistant.createAssistantRun(
      { id: workspaceManagerA.id },
      workspaceAId,
      conversation.id,
    );
    await db
      .update(schema.workspaceAssistantRuns)
      .set({ updatedAt: new Date(Date.now() - 180_000) })
      .where(sql`${schema.workspaceAssistantRuns.id} = ${abandonedRun.id}`);
    const recovered = await assistant.getAssistantRunEvents(
      { id: workspaceManagerA.id },
      workspaceAId,
      abandonedRun.id,
      0,
      100,
    );
    expect(recovered).toMatchObject({ status: "failed" });
    expect(recovered?.events.map((event) => event.type)).toEqual(["run_started", "run_failed"]);
  });

  it("summarizes assignment workload only for an authorized workspace and month", async () => {
    const content = await import("@/features/content/server");
    const monthStart = new Date("2026-11-01T00:00:00.000Z");
    const monthEnd = new Date("2026-12-01T00:00:00.000Z");
    await content.quickCreateContentItem(
      { id: workspaceManagerA.id },
      {
        workspaceId: workspaceAId,
        title: "Assigned planner item",
        format: "static_post",
        brief: "The content owner and designer are both assigned.",
        plannedPublishAt: new Date("2026-11-05T10:00:00.000Z"),
        designerId: plannerA.id,
      },
    );
    await content.quickCreateContentItem(
      { id: workspaceManagerA.id },
      {
        workspaceId: workspaceAId,
        title: "Unassigned designer item",
        format: "carousel",
        brief: "Only the content owner is assigned.",
        plannedPublishAt: new Date("2026-11-15T10:00:00.000Z"),
      },
    );
    await content.quickCreateContentItem(
      { id: workspaceManagerA.id },
      {
        workspaceId: workspaceAId,
        title: "Outside selected month",
        format: "static_post",
        brief: "This date must be excluded from the November summary.",
        plannedPublishAt: new Date("2026-10-30T10:00:00.000Z"),
      },
    );
    await content.quickCreateContentItem(
      { id: workspaceManagerB.id },
      {
        workspaceId: workspaceBId,
        title: "Other workspace item",
        format: "static_post",
        brief: "This must remain outside the summary.",
        plannedPublishAt: new Date("2026-11-20T10:00:00.000Z"),
      },
    );

    const summary = await content.getWorkspaceWorkloadSummary({ id: plannerA.id }, workspaceAId, {
      monthStart,
      monthEnd,
    });
    expect(summary).toMatchObject({
      totalItems: 2,
      contentOwners: { members: [{ name: "Workspace Manager A", itemCount: 2 }] },
      designers: {
        members: [
          { name: "Content Planner A", itemCount: 1 },
          { name: "Unassigned", itemCount: 1 },
        ],
      },
    });
    expect(JSON.stringify(summary)).not.toContain(workspaceAId);
    await expect(
      content.getWorkspaceWorkloadSummary({ id: workspaceManagerB.id }, workspaceAId, {
        monthStart,
        monthEnd,
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it("requires agency-admin authoring and second-admin review, preserves the active version, and audits rollback", async () => {
    const skillDraft = {
      slug: "regional-campaign-review",
      category: "planning" as const,
      name: "Regional campaign review",
      description: "Check authorized regional requirements before improving a campaign plan.",
      tags: ["campaign", "regional"],
      triggers: ["regional campaign review"],
      examples: ["Review the regional campaign plan."],
      requiredInputs: ["market"],
      optionalInputs: ["campaign objective"],
      supportedFormats: ["campaign plan"],
      requiredKnowledgeSources: ["approved workspace knowledge"],
      instructions: "State missing regional facts. Never infer local laws or audience behavior.",
      workflow: ["Confirm region", "Check available evidence", "List open questions"],
      outputContract: ["Evidence-backed findings", "Open questions"],
      qualityChecklist: ["No invented regulations", "Every factual claim has evidence"],
      relatedSkills: ["monthly-plan-review"],
    };

    await expect(
      skillGovernance.createAgencyWorkspaceAssistantSkill(
        { id: workspaceManagerA.id },
        agencyId,
        skillDraft,
      ),
    ).rejects.toThrow("workspace_assistant_skill_forbidden");

    const skill = await skillGovernance.createAgencyWorkspaceAssistantSkill(
      { id: agencyAdmin.id },
      agencyId,
      skillDraft,
    );
    expect(skill).toMatchObject({ slug: skillDraft.slug });
    await expect(
      skillGovernance.submitAgencyWorkspaceAssistantSkillForReview(
        { id: agencyAdmin.id },
        agencyId,
        skill.id,
        1,
      ),
    ).resolves.toMatchObject({ revision: 1, status: "pending_review" });
    await expect(
      skillGovernance.reviewAgencyWorkspaceAssistantSkill(
        { id: agencyAdmin.id },
        agencyId,
        skill.id,
        1,
        "approve",
        "",
      ),
    ).rejects.toThrow("workspace_assistant_skill_self_review_denied");
    await expect(
      skillGovernance.reviewAgencyWorkspaceAssistantSkill(
        { id: secondAgencyAdmin.id },
        agencyId,
        skill.id,
        1,
        "approve",
        "Evidence handling reviewed.",
      ),
    ).resolves.toMatchObject({ status: "active", revision: 1 });

    const selectedForA = await skillGovernance.listActiveWorkspaceAssistantSkills(
      { id: workspaceManagerA.id },
      workspaceAId,
    );
    const selectedForB = await skillGovernance.listActiveWorkspaceAssistantSkills(
      { id: workspaceManagerB.id },
      workspaceBId,
    );
    expect(selectedForA).toMatchObject([{ id: `agency-${skill.id}`, version: "1" }]);
    expect(selectedForB.map((item) => item.id)).toContain(`agency-${skill.id}`);
    expect(selectedForA[0]?.authorizedTools).toEqual([]);

    const changedDraft = {
      ...skillDraft,
      instructions: "Ask for verified regional evidence before suggesting changes.",
    };
    await expect(
      skillGovernance.saveAgencyWorkspaceAssistantSkillDraft(
        { id: agencyAdmin.id },
        agencyId,
        skill.id,
        changedDraft,
      ),
    ).resolves.toMatchObject({ revision: 2 });
    expect(
      await skillGovernance.listActiveWorkspaceAssistantSkills(
        { id: workspaceManagerA.id },
        workspaceAId,
      ),
    ).toMatchObject([{ version: "1", instructions: skillDraft.instructions }]);
    await skillGovernance.submitAgencyWorkspaceAssistantSkillForReview(
      { id: agencyAdmin.id },
      agencyId,
      skill.id,
      2,
    );
    await skillGovernance.reviewAgencyWorkspaceAssistantSkill(
      { id: secondAgencyAdmin.id },
      agencyId,
      skill.id,
      2,
      "reject",
      "Needs a clearer source requirement.",
    );

    const rollback = await skillGovernance.requestAgencyWorkspaceAssistantSkillRollback(
      { id: secondAgencyAdmin.id },
      agencyId,
      skill.id,
      1,
    );
    expect(rollback).toMatchObject({ revision: 3, targetRevision: 1 });
    await skillGovernance.submitAgencyWorkspaceAssistantSkillForReview(
      { id: secondAgencyAdmin.id },
      agencyId,
      skill.id,
      3,
    );
    await skillGovernance.reviewAgencyWorkspaceAssistantSkill(
      { id: agencyAdmin.id },
      agencyId,
      skill.id,
      3,
      "approve",
      "Rollback accepted.",
    );
    const [rollbackRevision] = await db
      .select()
      .from(schema.workspaceAssistantSkillRevisions)
      .where(
        sql`${schema.workspaceAssistantSkillRevisions.skillId} = ${skill.id} AND ${schema.workspaceAssistantSkillRevisions.revision} = 3`,
      )
      .limit(1);
    expect(rollbackRevision).toMatchObject({
      state: "approved",
      rollbackOfRevision: 1,
      reviewedBy: agencyAdmin.id,
    });
    expect(
      await skillGovernance.listActiveWorkspaceAssistantSkills(
        { id: workspaceManagerA.id },
        workspaceAId,
      ),
    ).toMatchObject([{ version: "3", instructions: skillDraft.instructions }]);

    await skillGovernance.archiveAgencyWorkspaceAssistantSkill(
      { id: agencyAdmin.id },
      agencyId,
      skill.id,
    );
    expect(
      await skillGovernance.listActiveWorkspaceAssistantSkills(
        { id: workspaceManagerA.id },
        workspaceAId,
      ),
    ).toEqual([]);
  });
});

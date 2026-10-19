import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  agencyEntitlements,
  agencyMemberships,
  agencyModuleSettings,
  agencies,
  communityConversations,
  communityEvents,
  platformPlanTemplates,
  users,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaceSettings,
  workspaces,
} from "@/lib/db/schema";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");
process.env.DATABASE_URL = TEST_DB_URL;

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentActor: vi.fn(),
  getAccessibleWorkspaceAtPath: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/current-actor", () => ({ currentActor: mocks.currentActor }));
vi.mock("@/lib/workspaces/context", () => ({
  getAccessibleWorkspaceAtPath: mocks.getAccessibleWorkspaceAtPath,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

let assignCommunityConversationAction: typeof import("@/lib/community/assignment-actions").assignCommunityConversationAction;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  ({ assignCommunityConversationAction } = await import("@/lib/community/assignment-actions"));
});

afterAll(async () => {
  await pool.end();
});

async function seed() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const [plan] = await db
    .insert(platformPlanTemplates)
    .values({
      slug: `community-${stamp}`,
      name: "Community integration plan",
      defaultLimits: {
        workspaces: 5,
        users: 10,
        total_social_profiles: 10,
        social_profiles_per_platform: 5,
        storage_bytes: 1_000_000,
        monthly_ai_requests: 100,
        enabled_modules: ["community_inbox"],
      },
    })
    .returning();
  const [actor] = await db
    .insert(users)
    .values({ email: `manager-${stamp}@example.test`, displayName: "Workspace Manager" })
    .returning();
  const [assignee] = await db
    .insert(users)
    .values({ email: `assignee-${stamp}@example.test`, displayName: "Community Assignee" })
    .returning();
  const [outsider] = await db
    .insert(users)
    .values({ email: `outsider-${stamp}@example.test`, displayName: "Outsider" })
    .returning();
  const [agency] = await db
    .insert(agencies)
    .values({ name: "Community Test Agency", slug: `community-${stamp}` })
    .returning();
  if (!plan || !actor || !assignee || !outsider || !agency) {
    throw new Error("Community assignment fixture creation failed");
  }
  await db.insert(agencyEntitlements).values({ agencyId: agency.id, planTemplateId: plan.id });
  await db.insert(agencyMemberships).values([
    { agencyId: agency.id, userId: actor.id, status: "active", isAgencyAdmin: false },
    { agencyId: agency.id, userId: assignee.id, status: "active", isAgencyAdmin: false },
    { agencyId: agency.id, userId: outsider.id, status: "active", isAgencyAdmin: false },
  ]);
  const [workspace] = await db
    .insert(workspaces)
    .values({
      agencyId: agency.id,
      name: "Community Workspace",
      slug: `workspace-${stamp}`,
      createdBy: actor.id,
    })
    .returning();
  if (!workspace) throw new Error("Community workspace fixture creation failed");
  const [actorMembership] = await db
    .insert(workspaceMemberships)
    .values({ workspaceId: workspace.id, userId: actor.id, status: "active" })
    .returning();
  const [assigneeMembership] = await db
    .insert(workspaceMemberships)
    .values({ workspaceId: workspace.id, userId: assignee.id, status: "active" })
    .returning();
  if (!actorMembership || !assigneeMembership) {
    throw new Error("Community workspace membership fixture creation failed");
  }
  await db.insert(workspaceMembershipRoles).values({
    workspaceMembershipId: actorMembership.id,
    role: "workspace_manager",
  });
  await db.insert(agencyModuleSettings).values({
    agencyId: agency.id,
    module: "community_inbox",
    enabled: true,
    updatedBy: actor.id,
  });
  await db.insert(workspaceSettings).values({
    workspaceId: workspace.id,
    communityInboxEnabled: true,
  });
  const [conversation] = await db
    .insert(communityConversations)
    .values({
      workspaceId: workspace.id,
      channelType: "facebook_comment",
      externalConversationId: `external-${stamp}`,
      state: "open",
    })
    .returning();
  if (!conversation) throw new Error("Community conversation fixture creation failed");

  mocks.auth.mockResolvedValue({ user: { id: actor.id } });
  mocks.currentActor.mockResolvedValue({ id: actor.id });
  mocks.getAccessibleWorkspaceAtPath.mockResolvedValue({ id: workspace.id, agencyId: agency.id });

  return { actor, assignee, outsider, agency, workspace, conversation };
}

describe("Community conversation assignment (integration)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.execute(sql`
      TRUNCATE
        community_event, community_message, community_conversation,
        workspace_membership_role, workspace_membership, workspace_settings,
        agency_module_setting, agency_membership, agency_entitlement,
        platform_plan_template, bootstrap_lock, agency, "user"
      RESTART IDENTITY CASCADE
    `);
  });

  it("assigns to an active workspace member and commits the audit event", async () => {
    const { actor, assignee, workspace, conversation } = await seed();

    await expect(
      assignCommunityConversationAction(
        "test-agency",
        "test-workspace",
        conversation.id,
        assignee.id,
      ),
    ).resolves.toEqual({ ok: true });

    const [updated] = await db
      .select({
        assignedTo: communityConversations.assignedTo,
        state: communityConversations.state,
      })
      .from(communityConversations)
      .where(eq(communityConversations.id, conversation.id));
    const [event] = await db
      .select()
      .from(communityEvents)
      .where(eq(communityEvents.conversationId, conversation.id));
    expect(updated).toEqual({ assignedTo: assignee.id, state: "assigned" });
    expect(event).toMatchObject({
      workspaceId: workspace.id,
      actorId: actor.id,
      kind: "conversation_assigned",
      metadata: { assigneeId: assignee.id },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(4);
  });

  it("rejects an agency member who is not an active workspace member", async () => {
    const { outsider, conversation } = await seed();

    await expect(
      assignCommunityConversationAction(
        "test-agency",
        "test-workspace",
        conversation.id,
        outsider.id,
      ),
    ).resolves.toEqual({ ok: false, code: "invalid_assignee" });

    const [unchanged] = await db
      .select({ assignedTo: communityConversations.assignedTo })
      .from(communityConversations)
      .where(eq(communityConversations.id, conversation.id));
    const events = await db
      .select()
      .from(communityEvents)
      .where(eq(communityEvents.conversationId, conversation.id));
    expect(unchanged?.assignedTo).toBeNull();
    expect(events).toHaveLength(0);
  });

  it("rejects an actor without the routing role and does not write", async () => {
    const { assignee, workspace, conversation } = await seed();
    await db.delete(workspaceMembershipRoles);
    mocks.currentActor.mockResolvedValue({ id: assignee.id });
    mocks.auth.mockResolvedValue({ user: { id: assignee.id } });
    mocks.getAccessibleWorkspaceAtPath.mockResolvedValue({
      id: workspace.id,
      agencyId: workspace.agencyId,
    });

    await expect(
      assignCommunityConversationAction(
        "test-agency",
        "test-workspace",
        conversation.id,
        assignee.id,
      ),
    ).resolves.toEqual({ ok: false, code: "unauthorized" });

    const [unchanged] = await db
      .select({ assignedTo: communityConversations.assignedTo })
      .from(communityConversations)
      .where(eq(communityConversations.id, conversation.id));
    expect(unchanged?.assignedTo).toBeNull();
  });
});

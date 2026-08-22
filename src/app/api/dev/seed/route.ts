import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  agencies,
  agencyMemberships,
  bootstrapLocks,
  contentItemChannels,
  contentItems,
  platformAdministrators,
  socialChannels,
  users,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaces,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { serverEnv } from "@/lib/validation/env";

/**
 * POST /api/dev/seed
 *
 * Dev/test-only helper. Creates a deterministic, end-to-end usable
 * fixture so Playwright can run the full content flow without going
 * through the Google OAuth / Mailcow / Bootstrap token paths.
 *
 * Idempotent: repeated calls return the same IDs. Re-runs are safe and
 * cheap. Always uses slug `test-agency` and `acme` so subsequent
 * E2E suites can find the records.
 *
 * Body (all optional):
 *   {
 *     email: "test@laratik.local"   // who is the test user
 *     name: "Test User"
 *     agencyName: "Test Agency"
 *     workspaceName: "Acme"
 *     workspaceSlug: "acme"
 *   }
 *
 * Returns:
 *   {
 *     userId, agencyId, workspaceId, channelIds: string[],
 *     contentItemId: string
 *   }
 *
 * The returned IDs are stable across re-runs (deterministic slugs).
 * `contentItemId` resolves the canonical "Autumn Blend Reveal"
 * fixture for the workspace — used by the visual-regression spec
 * (Task 7) and the planning-detail captures.
 * Production builds return 404.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SeedBody = {
  email?: string;
  name?: string;
  agencyName?: string;
  agencySlug?: string;
  workspaceName?: string;
  workspaceSlug?: string;
  contentItemTitle?: string;
  agencyAdmin?: boolean;
  workspaceRoles?: (
    | "workspace_manager"
    | "content_planner"
    | "designer"
    | "internal_reviewer"
    | "client_reviewer"
    | "publisher"
    | "viewer"
  )[];
  /**
   * When true, the seeded user is granted a row in
   * `platform_administrator` (with `revoked_at` null). This is the
   * M1.8 hook for the platform-overview e2e: a non-platform-admin
   * user sees the Forbidden surface; a platform admin sees the
   * overview. Idempotent: re-running the seed keeps the grant.
   *
   * Always optional — the existing fixtures and tests must keep
   * working unchanged.
   */
  platformAdmin?: boolean;
};

const FIXTURES = {
  email: "test@laratik.local",
  name: "Test User",
  agencyName: "Test Agency",
  agencySlug: "test-agency",
  workspaceName: "Acme",
  workspaceSlug: "acme",
  // Title used to look up the deterministic content item. The
  // visual-regression spec (Task 7) and the planning detail captures
  // both resolve `{contentItemId}` from this row.
  contentItemTitle: "Autumn Blend Reveal",
  channels: [
    { platform: "instagram" as const, accountName: "Acme IG", handle: "@acme" },
    { platform: "linkedin" as const, accountName: "Acme LinkedIn", handle: "acme" },
    { platform: "tiktok" as const, accountName: "Acme TikTok", handle: "@acme_tt" },
  ],
};

export async function POST(req: NextRequest) {
  if (serverEnv.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as SeedBody;
  const f = {
    email: (body.email ?? FIXTURES.email).trim().toLowerCase(),
    name: (body.name ?? FIXTURES.name).trim(),
    agencyName: body.agencyName ?? FIXTURES.agencyName,
    agencySlug: body.agencySlug ?? FIXTURES.agencySlug,
    workspaceName: body.workspaceName ?? FIXTURES.workspaceName,
    workspaceSlug: body.workspaceSlug ?? FIXTURES.workspaceSlug,
    contentItemTitle: body.contentItemTitle ?? FIXTURES.contentItemTitle,
    agencyAdmin: body.agencyAdmin ?? true,
    workspaceRoles: body.workspaceRoles ?? [],
    platformAdmin: body.platformAdmin ?? false,
  };

  try {
    return await seedInternal(f);
  } catch (err) {
    console.error("[dev/seed] failed:", err);
    return NextResponse.json(
      { error: "Seed failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

async function seedInternal(f: {
  email: string;
  name: string;
  agencyName: string;
  agencySlug: string;
  workspaceName: string;
  workspaceSlug: string;
  contentItemTitle: string;
  agencyAdmin: boolean;
  workspaceRoles: (
    | "workspace_manager"
    | "content_planner"
    | "designer"
    | "internal_reviewer"
    | "client_reviewer"
    | "publisher"
    | "viewer"
  )[];
  platformAdmin: boolean;
}) {
  // ─── User ────────────────────────────────────────────────────────────────
  let userId: string;
  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${f.email}`)
    .limit(1);
  if (existingUser[0]) {
    userId = existingUser[0].id;
    await db
      .update(users)
      .set({ role: f.agencyAdmin ? "agency_admin" : "user" })
      .where(eq(users.id, userId));
  } else {
    const [created] = await db
      .insert(users)
      .values({
        email: f.email,
        name: f.name,
        displayName: f.name,
        role: f.agencyAdmin ? "agency_admin" : "user",
        emailVerified: new Date(),
      })
      .returning({ id: users.id });
    userId = created!.id;
  }

  // ─── Agency (singleton) ─────────────────────────────────────────────────
  let agencyId: string;
  const existingAgency = await db
    .select({ id: agencies.id })
    .from(agencies)
    .where(eq(agencies.singletonKey, true))
    .limit(1);
  if (existingAgency[0]) {
    agencyId = existingAgency[0].id;
  } else {
    const [created] = await db
      .insert(agencies)
      .values({
        name: f.agencyName,
        slug: f.agencySlug,
        singletonKey: true,
        bootstrapCompletedAt: new Date(),
      })
      .returning({ id: agencies.id });
    agencyId = created!.id;
  }

  // ─── Agency membership (admin) ──────────────────────────────────────────
  await db
    .insert(agencyMemberships)
    .values({
      agencyId,
      userId,
      status: "active",
      isAgencyAdmin: f.agencyAdmin,
    })
    .onConflictDoUpdate({
      target: [agencyMemberships.agencyId, agencyMemberships.userId],
      set: { isAgencyAdmin: f.agencyAdmin, status: "active" },
    });

  // ─── Platform admin grant (M1.8) ───────────────────────────────────────
  // The `platform_administrator` table holds global platform-level
  // authority (separate from agency-level authority). For E2E we
  // upsert a live grant (`revoked_at` null) when the fixture says so
  // and revoke any prior grant when it does not. The seed is the
  // only place tests can flip platform-admin state.
  if (f.platformAdmin) {
    await db
      .insert(platformAdministrators)
      .values({ userId, grantedBy: userId })
      .onConflictDoUpdate({
        target: platformAdministrators.userId,
        set: { revokedAt: null, grantedBy: userId },
      });
  } else {
    await db
      .update(platformAdministrators)
      .set({ revokedAt: new Date() })
      .where(eq(platformAdministrators.userId, userId));
  }

  // ─── Bootstrap lock ─────────────────────────────────────────────────────
  await db.insert(bootstrapLocks).values({ agencyId, completedBy: userId }).onConflictDoNothing();

  // ─── Workspace ──────────────────────────────────────────────────────────
  let workspaceId: string;
  const existingWorkspace = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.agencyId, agencyId), eq(workspaces.slug, f.workspaceSlug)))
    .limit(1);
  if (existingWorkspace[0]) {
    workspaceId = existingWorkspace[0].id;
  } else {
    const [created] = await db
      .insert(workspaces)
      .values({
        agencyId,
        name: f.workspaceName,
        slug: f.workspaceSlug,
        timezone: "UTC",
        createdBy: userId,
      })
      .returning({ id: workspaces.id });
    workspaceId = created!.id;
  }

  // ─── Workspace membership (manager) ─────────────────────────────────────
  let membershipId: string;
  const existingMembership = await db
    .select({ id: workspaceMemberships.id })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, userId),
      ),
    )
    .limit(1);
  if (existingMembership[0]) {
    membershipId = existingMembership[0].id;
  } else {
    const [created] = await db
      .insert(workspaceMemberships)
      .values({
        workspaceId,
        userId,
        status: "active",
      })
      .returning({ id: workspaceMemberships.id });
    membershipId = created!.id;
  }

  // Exact role fixture: tests must never rely on one identity holding every role.
  await db
    .delete(workspaceMembershipRoles)
    .where(eq(workspaceMembershipRoles.workspaceMembershipId, membershipId));
  const exactRoles = f.agencyAdmin
    ? []
    : f.workspaceRoles.length
      ? f.workspaceRoles
      : ["viewer" as const];
  for (const role of exactRoles) {
    await db
      .insert(workspaceMembershipRoles)
      .values({ workspaceMembershipId: membershipId, role })
      .onConflictDoNothing();
  }

  // ─── Channels (idempotent on platform+account_name) ────────────────────
  const channelIds: string[] = [];
  for (const c of FIXTURES.channels) {
    const existing = await db
      .select({ id: socialChannels.id })
      .from(socialChannels)
      .where(
        and(
          eq(socialChannels.workspaceId, workspaceId),
          eq(socialChannels.platform, c.platform),
          eq(socialChannels.accountName, c.accountName),
        ),
      )
      .limit(1);
    if (existing[0]) {
      channelIds.push(existing[0].id);
    } else {
      const [created] = await db
        .insert(socialChannels)
        .values({
          workspaceId,
          platform: c.platform,
          accountName: c.accountName,
          handle: c.handle,
          isActive: true,
        })
        .returning({ id: socialChannels.id });
      channelIds.push(created!.id);
    }
  }

  // ─── Deterministic content item (Task 6) ─────────────────────────────
  // The visual-regression spec (Task 7) and the planning-detail
  // captures need a stable `{contentItemId}` placeholder. We look up
  // by `workspace_id` + `title` (the first non-archived match wins)
  // and only insert if absent. The seeded item connects to every
  // channel created above, matching the production "select all
  // active channels by default" rule from §8.
  const existingContentItem = await db
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(
      and(eq(contentItems.workspaceId, workspaceId), eq(contentItems.title, f.contentItemTitle)),
    )
    .limit(1);

  let contentItemId: string;
  if (existingContentItem[0]) {
    contentItemId = existingContentItem[0].id;
  } else {
    const [created] = await db
      .insert(contentItems)
      .values({
        workspaceId,
        title: f.contentItemTitle,
        format: "static_post",
        brief: "Seeded fixture content item for visual regression captures.",
        // The plan requires a stable schedule; default to 7 days in
        // the future, which is well within the bounded test window
        // but does not collide with the explicit quick-create test.
        plannedPublishAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        contentOwnerId: userId,
        createdBy: userId,
      })
      .returning({ id: contentItems.id });
    contentItemId = created!.id;

    // Connect every channel the seed just created. We use
    // onConflictDoNothing because a previous interrupted run may
    // have inserted the row but failed to return.
    if (channelIds.length > 0) {
      await db
        .insert(contentItemChannels)
        .values(
          channelIds.map((socialChannelId) => ({
            contentItemId,
            socialChannelId,
          })),
        )
        .onConflictDoNothing();
    }
  }

  return NextResponse.json({
    ok: true,
    userId,
    agencyId,
    workspaceId,
    workspaceSlug: f.workspaceSlug,
    channelIds,
    contentItemId,
    platformAdmin: f.platformAdmin,
    fixtures: f,
  });
}

export async function GET() {
  if (serverEnv.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    info: "POST {} to seed an agency + workspace + user + channels + a canonical content item. Returns IDs.",
    fixtures: FIXTURES,
  });
}

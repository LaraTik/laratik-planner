import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  agencies,
  agencyMemberships,
  bootstrapLocks,
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
 *     userId, agencyId, workspaceId, channelIds: string[]
 *   }
 *
 * The returned IDs are stable across re-runs (deterministic slugs).
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
};

const FIXTURES = {
  email: "test@laratik.local",
  name: "Test User",
  agencyName: "Test Agency",
  agencySlug: "test-agency",
  workspaceName: "Acme",
  workspaceSlug: "acme",
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
    await db.update(users).set({ role: "agency_admin" }).where(eq(users.id, userId));
  } else {
    const [created] = await db
      .insert(users)
      .values({
        email: f.email,
        name: f.name,
        displayName: f.name,
        role: "agency_admin",
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
      isAgencyAdmin: true,
    })
    .onConflictDoUpdate({
      target: [agencyMemberships.agencyId, agencyMemberships.userId],
      set: { isAgencyAdmin: true, status: "active" },
    });

  // ─── Bootstrap lock ─────────────────────────────────────────────────────
  await db
    .insert(bootstrapLocks)
    .values({ agencyId, completedBy: userId })
    .onConflictDoNothing();

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

  // Grant all workspace roles so the admin can exercise every flow
  const allRoles = [
    "workspace_manager",
    "content_planner",
    "designer",
    "internal_reviewer",
    "client_reviewer",
    "publisher",
  ] as const;
  for (const role of allRoles) {
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

  return NextResponse.json({
    ok: true,
    userId,
    agencyId,
    workspaceId,
    workspaceSlug: f.workspaceSlug,
    channelIds,
    fixtures: f,
  });
}

export async function GET() {
  if (serverEnv.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    info: "POST {} to seed an agency + workspace + user + channels. Returns IDs.",
    fixtures: FIXTURES,
  });
}

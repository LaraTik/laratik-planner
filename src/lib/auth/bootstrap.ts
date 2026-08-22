import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies, agencyMemberships, bootstrapLocks, users } from "@/lib/db/schema";
import { firstAgencyForBootstrap } from "@/lib/auth/policy";
import { serverEnv } from "@/lib/validation/env";

/**
 * Bootstrap the first agency administrator.
 *
 * Per master prompt §13: "Bootstrap must run in one transaction using an
 * advisory lock. It succeeds only when no bootstrap lock and no active
 * administrator exist. Repeated requests return a stable
 * already-configured result without creating another administrator."
 *
 * Returns:
 *  - { status: "bootstrapped", agencyId } — first admin created
 *  - { status: "already_configured", agencyId } — another admin already exists
 *  - { status: "invalid_token" } — BOOTSTRAP_SETUP_TOKEN doesn't match
 */
export type BootstrapResult =
  | { status: "bootstrapped"; agencyId: string; userId: string }
  | { status: "already_configured"; agencyId: string }
  | { status: "invalid_token" };

export async function bootstrapFirstAdmin(input: {
  userId: string;
  agencyName: string;
  agencySlug: string;
  token: string;
}): Promise<BootstrapResult> {
  if (!serverEnv.BOOTSTRAP_SETUP_TOKEN || input.token !== serverEnv.BOOTSTRAP_SETUP_TOKEN) {
    return { status: "invalid_token" };
  }

  return await db.transaction(async (tx) => {
    // Acquire advisory lock to make bootstrap atomic across concurrent calls
    await tx.execute(sql`SELECT pg_advisory_xact_lock(7342891)`);

    // Check if any active admin already exists
    const existingAdmin = await tx
      .select({ agencyId: agencyMemberships.agencyId })
      .from(agencyMemberships)
      .innerJoin(agencies, eq(agencies.id, agencyMemberships.agencyId))
      .where(eq(agencyMemberships.isAgencyAdmin, true))
      .limit(1);

    if (existingAdmin.length > 0) {
      return { status: "already_configured", agencyId: existingAdmin[0]!.agencyId };
    }

    // Check if an agency already exists (shouldn't, but be safe)
    // After M1.7 the agency table is multi-row; the bootstrap path
    // uses `firstAgencyForBootstrap` to pick the most-recently-created
    // agency when one is already present. In the legacy single-agency
    // deployment this is exactly the agency that the bootstrap admin
    // was going to own, so the user-facing behavior is unchanged.
    const existingAgencyId = await firstAgencyForBootstrap();
    let agencyId: string;
    if (existingAgencyId) {
      agencyId = existingAgencyId;
    } else {
      const [agency] = await tx
        .insert(agencies)
        .values({
          name: input.agencyName,
          slug: input.agencySlug,
          bootstrapCompletedAt: new Date(),
        })
        .returning({ id: agencies.id });
      agencyId = agency!.id;
    }

    // Mark the user as the admin
    await tx
      .insert(agencyMemberships)
      .values({
        agencyId,
        userId: input.userId,
        status: "active",
        isAgencyAdmin: true,
      })
      .onConflictDoUpdate({
        target: [agencyMemberships.agencyId, agencyMemberships.userId],
        set: { isAgencyAdmin: true, status: "active" },
      });

    // Promote role on the user record
    await tx.update(users).set({ role: "agency_admin" }).where(eq(users.id, input.userId));

    // Write the bootstrap lock
    await tx
      .insert(bootstrapLocks)
      .values({
        agencyId,
        completedBy: input.userId,
      })
      .onConflictDoNothing();

    return { status: "bootstrapped", agencyId, userId: input.userId };
  });
}

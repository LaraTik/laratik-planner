import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// The bootstrap service checks BOOTSTRAP_SETUP_TOKEN at request time.
// Set it before importing bootstrap.ts so the module-level env parse
// picks it up. The integration test runner (scripts/run-integration-
// tests.ts) does not set this token by default.
process.env.BOOTSTRAP_SETUP_TOKEN ??= "integration-test-bootstrap-token";

/**
 * TEST-04 (GAP-FULL-REVIEW-2026-08-25) — §23 step 1-3 bootstrap race.
 *
 * `bootstrapFirstAdmin` is the only path that creates the first agency
 * administrator. The unit test suite (tests/unit/auth-bootstrap.test.ts)
 * exercises the happy path / invalid-token / already-configured
 * branches using a Drizzle mock, but no real-Postgres test asserts the
 * `pg_advisory_xact_lock(7342891)` invariant — that two browsers
 * simultaneously submitting the bootstrap form cannot both create an
 * admin. This file is the integration-tier companion to that unit
 * suite: it spawns N parallel transactions against a real Postgres
 * test database and asserts exactly one wins.
 *
 * Pattern mirrors tests/integration/invitation-concurrency.test.ts
 * (2 concurrent acceptInvitation calls, assert idempotency).
 */

describe("bootstrap concurrency", () => {
  let bootstrapFirstAdmin: typeof import("@/lib/auth/bootstrap").bootstrapFirstAdmin;
  let db: Awaited<typeof import("@/lib/db")>["db"];

  beforeAll(async () => {
    ({ bootstrapFirstAdmin } = await import("@/lib/auth/bootstrap"));
    ({ db } = await import("@/lib/db"));
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE agency, "user" CASCADE`);
  });

  it("exactly one of N concurrent bootstrap calls creates the admin; the rest see already_configured", async () => {
    const { users, agencyMemberships, bootstrapLocks } = await import("@/lib/db/schema");

    // Pre-create the user rows that will be promoted to agency_admin.
    // The bootstrap service expects a `userId` that already exists in
    // the users table; the race is on the admin-insertion, not on user
    // creation. We give each call a different user so the "exactly
    // one wins" assertion is unambiguous.
    const N = 5;
    const userIds: string[] = [];
    for (let i = 0; i < N; i += 1) {
      const [u] = await db
        .insert(users)
        .values({
          email: `racer-${i}@bootstrap.test`,
          displayName: `Racer ${i}`,
          emailVerified: new Date(),
        })
        .returning();
      userIds.push(u!.id);
    }

    const outcomes = await Promise.all(
      userIds.map((userId, i) =>
        bootstrapFirstAdmin({
          userId,
          agencyName: "Northstar Coffee",
          agencySlug: `northstar-${i}`,
          token: "integration-test-bootstrap-token",
        }),
      ),
    );

    // Exactly one outcome is "bootstrapped"; the rest are
    // "already_configured". The advisory lock serialises the
    // transactions so the post-lock check finds the admin that the
    // first transaction created.
    const bootstrapped = outcomes.filter((o) => o.status === "bootstrapped");
    const alreadyConfigured = outcomes.filter((o) => o.status === "already_configured");
    expect(bootstrapped).toHaveLength(1);
    expect(alreadyConfigured).toHaveLength(N - 1);

    // All "already_configured" outcomes point at the same agencyId as
    // the winner. (The advisory lock makes this deterministic; without
    // it, two concurrent inserts could each create a different agency
    // and the assertion would catch the bug.)
    const winner = bootstrapped[0]!;
    for (const o of alreadyConfigured) {
      if (o.status === "already_configured") {
        expect(o.agencyId).toBe(winner.agencyId);
      }
    }

    // Database invariants: exactly one agency_admin membership row,
    // exactly one bootstrap_lock row.
    const memberships = await db
      .select()
      .from(agencyMemberships)
      .where(eq(agencyMemberships.isAgencyAdmin, true));
    expect(memberships).toHaveLength(1);
    expect(memberships[0]!.userId).toBe(winner.userId);

    const locks = await db.select().from(bootstrapLocks);
    expect(locks).toHaveLength(1);
    expect(locks[0]!.completedBy).toBe(winner.userId);
  });

  it("a second bootstrap after the first returns already_configured (sequential)", async () => {
    // This is the single-thread version of the same contract — a
    // first call bootstraps; a follow-up call by a different user
    // cannot create a second admin.
    const { users } = await import("@/lib/db/schema");
    const [first] = await db
      .insert(users)
      .values({
        email: "first@bootstrap.test",
        displayName: "First",
        emailVerified: new Date(),
      })
      .returning();
    const [second] = await db
      .insert(users)
      .values({
        email: "second@bootstrap.test",
        displayName: "Second",
        emailVerified: new Date(),
      })
      .returning();

    const firstResult = await bootstrapFirstAdmin({
      userId: first!.id,
      agencyName: "Northstar",
      agencySlug: "northstar",
      token: "integration-test-bootstrap-token",
    });
    expect(firstResult.status).toBe("bootstrapped");

    const secondResult = await bootstrapFirstAdmin({
      userId: second!.id,
      agencyName: "Some Other Agency",
      agencySlug: "some-other",
      token: "integration-test-bootstrap-token",
    });
    expect(secondResult.status).toBe("already_configured");
    if (secondResult.status === "already_configured") {
      expect(secondResult.agencyId).toBe(
        firstResult.status === "bootstrapped" ? firstResult.agencyId : undefined,
      );
    }
  });

  it("an invalid token never wins — every call returns invalid_token and the database is untouched", async () => {
    const { users, agencyMemberships, bootstrapLocks, agencies } = await import("@/lib/db/schema");
    const [u] = await db
      .insert(users)
      .values({
        email: "wrong-token@bootstrap.test",
        displayName: "Wrong Token",
        emailVerified: new Date(),
      })
      .returning();

    const outcomes = await Promise.all(
      [0, 1, 2].map(() =>
        bootstrapFirstAdmin({
          userId: u!.id,
          agencyName: "Should Not Exist",
          agencySlug: "should-not-exist",
          token: "wrong-token",
        }),
      ),
    );
    for (const o of outcomes) {
      expect(o.status).toBe("invalid_token");
    }
    const allAgencies = await db.select().from(agencies);
    expect(allAgencies).toHaveLength(0);
    const allAdmins = await db
      .select()
      .from(agencyMemberships)
      .where(eq(agencyMemberships.isAgencyAdmin, true));
    expect(allAdmins).toHaveLength(0);
    const allLocks = await db.select().from(bootstrapLocks);
    expect(allLocks).toHaveLength(0);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import {
  platformAdministrators,
  securityAuditEvents,
  users,
} from "@/lib/db/schema";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const integrationDb = drizzle(pool);

const OWNER_A_ID = "00000000-0000-4000-8000-00000000b001";
const OWNER_B_ID = "00000000-0000-4000-8000-00000000b002";
const MEMBER_ID = "00000000-0000-4000-8000-00000000b003";

let service: typeof import("@/lib/platform/access");

beforeAll(async () => {
  await migrate(integrationDb, { migrationsFolder: "./src/lib/db/migrations" });
  service = await import("@/lib/platform/access");
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await integrationDb.execute(sql`
    DROP TRIGGER IF EXISTS platform_access_audit_failure ON security_audit_event;
    DROP FUNCTION IF EXISTS test_fail_platform_access_audit();
    TRUNCATE security_audit_event, platform_administrator, "user"
      RESTART IDENTITY CASCADE;
  `);
});

async function seedUsers() {
  await integrationDb.insert(users).values([
    { id: OWNER_A_ID, email: "owner-a@platform.test", displayName: "Owner A" },
    { id: OWNER_B_ID, email: "owner-b@platform.test", displayName: "Owner B" },
    { id: MEMBER_ID, email: "member@platform.test", displayName: "Member" },
  ]);
}

async function seedTwoOwners() {
  await seedUsers();
  await integrationDb.insert(platformAdministrators).values([
    {
      userId: OWNER_A_ID,
      role: "platform_owner",
      grantedBy: OWNER_A_ID,
      reason: "Integration owner A",
    },
    {
      userId: OWNER_B_ID,
      role: "platform_owner",
      grantedBy: OWNER_A_ID,
      reason: "Integration owner B",
    },
  ]);
}

describe("platform access database contract", () => {
  it("rejects a role outside the closed database constraint", async () => {
    await seedUsers();
    await expect(
      integrationDb.execute(sql`
        INSERT INTO platform_administrator (user_id, role, reason)
        VALUES (${MEMBER_ID}, 'super_admin', 'invalid integration role')
      `),
    ).rejects.toMatchObject({
      cause: { constraint: "platform_administrator_role_check" },
    });
  });

  it("commits a grant and its audit record together", async () => {
    await seedTwoOwners();

    await service.grantPlatformAccess(
      { id: OWNER_A_ID },
      {
        email: "member@platform.test",
        role: "support_operator",
        reason: "Support coverage",
      },
    );

    const [assignment] = await integrationDb
      .select({ role: platformAdministrators.role })
      .from(platformAdministrators)
      .where(eq(platformAdministrators.userId, MEMBER_ID));
    const [audit] = await integrationDb
      .select({ action: securityAuditEvents.action, metadata: securityAuditEvents.metadata })
      .from(securityAuditEvents)
      .where(eq(securityAuditEvents.targetId, MEMBER_ID));
    expect(assignment?.role).toBe("support_operator");
    expect(audit).toMatchObject({
      action: "platform_access.grant",
      metadata: { newRole: "support_operator", reason: "Support coverage" },
    });
  });

  it("rolls the assignment back when its audit insert fails", async () => {
    await seedTwoOwners();
    await integrationDb.execute(sql`
      CREATE FUNCTION test_fail_platform_access_audit()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.action = 'platform_access.role_change' THEN
          RAISE EXCEPTION 'intentional audit failure';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER platform_access_audit_failure
      BEFORE INSERT ON security_audit_event
      FOR EACH ROW EXECUTE FUNCTION test_fail_platform_access_audit();
    `);

    await expect(
      service.changePlatformRole(
        { id: OWNER_A_ID },
        {
          userId: OWNER_B_ID,
          role: "platform_auditor",
          reason: "Exercise rollback",
        },
      ),
    ).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/intentional audit failure/i) },
    });

    const [assignment] = await integrationDb
      .select({ role: platformAdministrators.role })
      .from(platformAdministrators)
      .where(eq(platformAdministrators.userId, OWNER_B_ID));
    const auditRows = await integrationDb
      .select({ id: securityAuditEvents.id })
      .from(securityAuditEvents)
      .where(eq(securityAuditEvents.action, "platform_access.role_change"));
    expect(assignment?.role).toBe("platform_owner");
    expect(auditRows).toHaveLength(0);
  });
});

describe("serialized last-Owner invariant", () => {
  it("allows exactly one of two concurrent Owner removals", async () => {
    await seedTwoOwners();
    const blocker = await pool.connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT pg_advisory_xact_lock($1)", [6_421_910_731]);

    const attemptsPromise = Promise.allSettled([
      service.revokePlatformAccess(
        { id: OWNER_A_ID },
        { userId: OWNER_A_ID, reason: "Concurrent revoke" },
      ),
      service.changePlatformRole(
        { id: OWNER_A_ID },
        {
          userId: OWNER_B_ID,
          role: "platform_auditor",
          reason: "Concurrent downgrade",
        },
      ),
    ]);

    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const waiting = await blocker.query<{ count: string }>(`
          SELECT count(*)::text AS count
          FROM pg_locks
          WHERE locktype = 'advisory'
            AND granted = false
        `);
        if (Number(waiting.rows[0]?.count ?? 0) >= 2) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (attempt === 99) throw new Error("Concurrent mutations did not reach the advisory lock");
      }
    } finally {
      await blocker.query("COMMIT");
      blocker.release();
    }

    const attempts = await attemptsPromise;

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const rejection = attempts.find((attempt) => attempt.status === "rejected");
    expect(rejection).toMatchObject({
      status: "rejected",
      reason: { code: service.PlatformAccessErrorCode.LastOwner },
    });

    const activeOwners = await integrationDb
      .select({ userId: platformAdministrators.userId })
      .from(platformAdministrators)
      .where(
        and(
          inArray(platformAdministrators.userId, [OWNER_A_ID, OWNER_B_ID]),
          eq(platformAdministrators.role, "platform_owner"),
          isNull(platformAdministrators.revokedAt),
        ),
      );
    expect(activeOwners).toHaveLength(1);
  });
});

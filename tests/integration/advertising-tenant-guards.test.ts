import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { expectPgConstraint } from "./_db-error";

import {
  agencies,
  advertisingAccounts,
  advertisingConnectionAccounts,
  advertisingConnections,
  advertisingFinancialAuthorities,
  advertisingSyncRuns,
  advertisingSyncStates,
  advertisingVisibilityGrants,
  users,
  workspaces,
} from "@/lib/db/schema";
import {
  claimAdvertisingSyncStates,
  createAdvertisingSyncRun,
} from "@/lib/advertising/sync-worker";
import { AdvertisingLeaseLostError } from "@/lib/advertising/ingestion-service";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

async function seed() {
  const [agencyA] = await db
    .insert(agencies)
    .values({ name: "Agency A", slug: "agency-a" })
    .returning();
  const [agencyB] = await db
    .insert(agencies)
    .values({ name: "Agency B", slug: "agency-b" })
    .returning();
  const [actor] = await db
    .insert(users)
    .values({ email: "advertising-guards@example.test", displayName: "Guard Tester" })
    .returning();
  if (!agencyA || !agencyB || !actor) throw new Error("failed to seed advertising guard fixtures");

  const [workspaceA] = await db
    .insert(workspaces)
    .values({ agencyId: agencyA.id, slug: "workspace-a", name: "Workspace A", createdBy: actor.id })
    .returning();
  const [workspaceB] = await db
    .insert(workspaces)
    .values({ agencyId: agencyB.id, slug: "workspace-b", name: "Workspace B", createdBy: actor.id })
    .returning();
  if (!workspaceA || !workspaceB) throw new Error("failed to seed advertising workspaces");

  const [connectionA] = await db
    .insert(advertisingConnections)
    .values({
      agencyId: agencyA.id,
      provider: "meta",
      displayName: "Connection A",
      credentialRef: "advertising:test:a",
      createdBy: actor.id,
    })
    .returning();
  const [connectionB] = await db
    .insert(advertisingConnections)
    .values({
      agencyId: agencyB.id,
      provider: "meta",
      displayName: "Connection B",
      credentialRef: "advertising:test:b",
      createdBy: actor.id,
    })
    .returning();
  const [accountA] = await db
    .insert(advertisingAccounts)
    .values({
      agencyId: agencyA.id,
      provider: "meta",
      externalAccountId: "act_guard_a",
      name: "Account A",
    })
    .returning();
  const [accountB] = await db
    .insert(advertisingAccounts)
    .values({
      agencyId: agencyB.id,
      provider: "meta",
      externalAccountId: "act_guard_b",
      name: "Account B",
    })
    .returning();
  if (!connectionA || !connectionB || !accountA || !accountB)
    throw new Error("failed to seed advertising resources");

  return {
    agencyA,
    agencyB,
    workspaceA,
    workspaceB,
    connectionA,
    connectionB,
    accountA,
    accountB,
    actor,
  };
}

describe("advertising tenant ownership guards", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  });

  beforeEach(async () => {
    await db.execute(sql`
      TRUNCATE
        advertising_spend_observation,
        advertising_spend_reconciliation,
        advertising_sync_run,
        advertising_sync_state,
        advertising_validation_result,
        advertising_social_identity,
        advertising_capability,
        advertising_connection_account,
        advertising_visibility_grant,
        advertising_financial_authority,
        advertising_grant_revision,
        advertising_credential_version,
        advertising_connection,
        advertising_account,
        workspace,
        agency,
        "user"
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("rejects a connection-to-account link across agencies", async () => {
    const { connectionA, accountB } = await seed();

    await expectPgConstraint(
      db.insert(advertisingConnectionAccounts).values({
        connectionId: connectionA.id,
        accountId: accountB.id,
      }),
      "advertising_tenant_ownership_guard",
    );
  });

  it("rejects grants that combine an account and workspace from different agencies", async () => {
    const { agencyA, workspaceB, accountA, actor } = await seed();

    await expectPgConstraint(
      db.insert(advertisingVisibilityGrants).values({
        agencyId: agencyA.id,
        workspaceId: workspaceB.id,
        accountId: accountA.id,
        capability: "read_reports",
        grantedBy: actor.id,
      }),
      "advertising_tenant_ownership_guard",
    );
    await expectPgConstraint(
      db.insert(advertisingFinancialAuthorities).values({
        agencyId: agencyA.id,
        workspaceId: workspaceB.id,
        accountId: accountA.id,
        grantedBy: actor.id,
      }),
      "advertising_tenant_ownership_guard",
    );
  });

  it("allows a same-agency link and sync state", async () => {
    const { connectionA, accountA } = await seed();

    const [link] = await db
      .insert(advertisingConnectionAccounts)
      .values({ connectionId: connectionA.id, accountId: accountA.id })
      .returning();
    expect(link).toBeDefined();

    const [state] = await db
      .insert(advertisingSyncStates)
      .values({ connectionId: connectionA.id, accountId: accountA.id })
      .returning();
    expect(state).toBeDefined();
  });

  it("allows only one concurrent claim and fences stale run-history creation", async () => {
    const { connectionA, accountA } = await seed();
    await db.update(advertisingConnections).set({ status: "active" });
    await db.insert(advertisingConnectionAccounts).values({
      connectionId: connectionA.id,
      accountId: accountA.id,
    });
    const [state] = await db
      .insert(advertisingSyncStates)
      .values({ status: "idle", connectionId: connectionA.id, accountId: accountA.id })
      .returning();
    if (!state) throw new Error("failed to seed sync state");

    const now = new Date();
    const [first, second] = await Promise.all([
      claimAdvertisingSyncStates(db, { owner: "worker-a", now, limit: 1 }),
      claimAdvertisingSyncStates(db, { owner: "worker-b", now, limit: 1 }),
    ]);
    expect(first.length + second.length).toBe(1);
    const claimed = first[0] ?? second[0];
    if (!claimed) throw new Error("no worker claimed the sync state");

    await db
      .update(advertisingSyncStates)
      .set({
        leaseToken: randomUUID(),
        leaseOwner: "replacement-worker",
        leaseExpiresAt: new Date(Date.now() + 60_000),
        status: "running",
      })
      .where(eq(advertisingSyncStates.id, state.id));

    await expect(createAdvertisingSyncRun(db, claimed)).rejects.toBeInstanceOf(
      AdvertisingLeaseLostError,
    );
    const [run] = await db
      .select({ id: advertisingSyncRuns.id })
      .from(advertisingSyncRuns)
      .where(eq(advertisingSyncRuns.syncStateId, state.id));
    expect(run).toBeUndefined();
  });
});

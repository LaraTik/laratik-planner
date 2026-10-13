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
  advertisingCanonicalSpendFacts,
  advertisingConnectionAccounts,
  advertisingConnections,
  advertisingFinancialAuthorities,
  advertisingSpendObservations,
  advertisingAudienceObservations,
  advertisingSpendReconciliations,
  advertisingProviderObjects,
  advertisingSyncRuns,
  advertisingSyncStates,
  advertisingVisibilityGrants,
  agencyMemberships,
  workspaceMemberships,
  users,
  workspaces,
} from "@/lib/db/schema";
import {
  grantAdvertisingVisibility,
  grantAdvertisingFinancialAuthority,
  revokeAdvertisingFinancialAuthority,
  revokeAdvertisingVisibility,
} from "@/lib/advertising/grant-service";
import {
  listAdvertisingReportAccounts,
  loadAdvertisingReport,
} from "@/lib/advertising/reporting-query";
import {
  claimAdvertisingSyncStates,
  createAdvertisingSyncRun,
  failAdvertisingSync,
  runAdvertisingSyncTick,
} from "@/lib/advertising/sync-worker";
import {
  AdvertisingLeaseLostError,
  ingestAdvertisingSpend,
} from "@/lib/advertising/ingestion-service";
import { setAdvertisingSyncState } from "@/lib/advertising/sync-service";
import {
  grantAdvertisingConnectionAgency,
  persistAdvertisingProviderObjects,
  persistDiscoveredAdvertisingAccount,
} from "@/lib/advertising/connection-service";
import type { MetaAdvertisingProvider } from "@/lib/advertising/providers/meta";

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
        advertising_audience_observation,
        advertising_provider_object,
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

  it("deduplicates the same provider fact observed through multiple credentials", async () => {
    const { agencyA, connectionA, accountA, actor } = await seed();
    const [connectionB] = await db
      .insert(advertisingConnections)
      .values({
        agencyId: agencyA.id,
        provider: "meta",
        displayName: "Connection A replacement",
        credentialRef: "advertising:test:a-replacement",
        createdBy: actor.id,
      })
      .returning();
    if (!connectionB) throw new Error("failed to seed replacement connection");

    await db
      .update(advertisingConnections)
      .set({ status: "active" })
      .where(eq(advertisingConnections.id, connectionA.id));
    await db
      .update(advertisingConnections)
      .set({ status: "active" })
      .where(eq(advertisingConnections.id, connectionB.id));
    await db.insert(advertisingConnectionAccounts).values([
      { connectionId: connectionA.id, accountId: accountA.id },
      { connectionId: connectionB.id, accountId: accountA.id },
    ]);

    const observation = {
      externalAdId: "ad_multi_credential",
      externalCampaignId: "campaign_multi_credential",
      externalAdSetId: "adset_multi_credential",
      reportDate: "2026-10-01",
      currency: "EUR",
      spend: "12.50",
      impressions: 100,
      clicks: 5,
      attributionWindow: "account",
      actionReportTime: "impression",
    } as const;
    await ingestAdvertisingSpend(db, {
      agencyId: agencyA.id,
      accountId: accountA.id,
      connectionId: connectionA.id,
      observations: [observation],
    });
    await ingestAdvertisingSpend(db, {
      agencyId: agencyA.id,
      accountId: accountA.id,
      connectionId: connectionB.id,
      observations: [observation],
    });

    const observations = await db
      .select({
        connectionId: advertisingSpendObservations.connectionId,
        spend: advertisingSpendObservations.spend,
      })
      .from(advertisingSpendObservations);
    expect(observations).toEqual([{ connectionId: connectionB.id, spend: "12.500000" }]);
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

  it("dead-letters after four failed attempts and resets on explicit re-enable", async () => {
    const { agencyA, connectionA, accountA, actor } = await seed();
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

    let lastStatus: string | undefined;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await db
        .update(advertisingSyncStates)
        .set({ status: attempt === 0 ? "idle" : "failed", nextRunAt: new Date() })
        .where(eq(advertisingSyncStates.id, state.id));
      const [claimed] = await claimAdvertisingSyncStates(db, {
        owner: `retry-worker-${attempt}`,
        now: new Date(),
        limit: 1,
      });
      if (!claimed) throw new Error(`attempt ${attempt + 1} was not claimed`);
      lastStatus = await failAdvertisingSync(db, claimed, new Date(), "meta_provider_unavailable");
    }
    expect(lastStatus).toBe("dead_letter");
    const [deadLettered] = await db
      .select({ status: advertisingSyncStates.status, attempt: advertisingSyncStates.attempt })
      .from(advertisingSyncStates)
      .where(eq(advertisingSyncStates.id, state.id));
    expect(deadLettered).toEqual({ status: "dead_letter", attempt: 4 });

    await setAdvertisingSyncState(db, {
      agencyId: agencyA.id,
      connectionId: connectionA.id,
      accountId: accountA.id,
      enabled: true,
      actorId: actor.id,
    });
    const [reopened] = await db
      .select({ status: advertisingSyncStates.status, attempt: advertisingSyncStates.attempt })
      .from(advertisingSyncStates)
      .where(eq(advertisingSyncStates.id, state.id));
    expect(reopened).toEqual({ status: "idle", attempt: 0 });
  });

  it("replays a post-ingestion failure without duplicating canonical spend", async () => {
    const { agencyA, workspaceA, connectionA, accountA, actor } = await seed();
    await db.update(advertisingConnections).set({ status: "active" });
    await db.insert(advertisingConnectionAccounts).values({
      connectionId: connectionA.id,
      accountId: accountA.id,
    });
    await grantAdvertisingVisibility(db, {
      agencyId: agencyA.id,
      workspaceId: workspaceA.id,
      accountId: accountA.id,
      capability: "read_reports",
      campaignIds: ["campaign_replay_1"],
      grantedBy: actor.id,
    });
    const [state] = await db
      .insert(advertisingSyncStates)
      .values({ status: "idle", connectionId: connectionA.id, accountId: accountA.id })
      .returning();
    if (!state) throw new Error("failed to seed sync state");

    let failFirstAccountRead = true;
    const provider: MetaAdvertisingProvider = {
      provider: "meta",
      validateConnection: async () => undefined,
      discoverAccounts: async () => [],
      readCampaigns: async () => ({ data: [] }),
      readAdSets: async () => ({ data: [] }),
      readAds: async () => ({ data: [] }),
      readCreatives: async () => ({ data: [] }),
      readBreakdowns: async () => ({ data: [] }),
      readPages: async () => ({ data: [] }),
      readInstagramAccounts: async () => ({ data: [] }),
      readDailyInsights: async (_connection, _account, context) => {
        if (context.grain === "account_day" && failFirstAccountRead) {
          failFirstAccountRead = false;
          throw Object.assign(new Error("provider temporarily unavailable"), { status: 503 });
        }
        if (context.grain === "account_day") {
          return {
            data: [
              {
                date_start: context.dateRange.since,
                spend: "27.50",
              },
            ],
          };
        }
        return {
          data: [
            {
              ad_id: "ad_replay_1",
              adset_id: "adset_replay_1",
              campaign_id: "campaign_replay_1",
              date_start: context.dateRange.since,
              spend: "12.50",
              impressions: "1000",
              clicks: "25",
            },
            {
              ad_id: "ad_replay_unassigned",
              adset_id: "adset_replay_unassigned",
              campaign_id: "campaign_replay_unassigned",
              date_start: context.dateRange.since,
              spend: "15.00",
              impressions: "500",
              clicks: "10",
            },
          ],
        };
      },
    };
    const now = new Date();
    const providerFactory = () => provider;

    const first = await runAdvertisingSyncTick(db, {
      now,
      owner: "replay-worker-a",
      limit: 1,
      providerFactory,
    });
    expect(first).toMatchObject({ claimed: 1, failed: 1, succeeded: 0, dead_letter: 0 });

    await db
      .update(advertisingSyncStates)
      .set({ status: "failed", nextRunAt: new Date() })
      .where(eq(advertisingSyncStates.id, state.id));
    const second = await runAdvertisingSyncTick(db, {
      now: new Date(),
      owner: "replay-worker-b",
      limit: 1,
      providerFactory,
    });
    expect(second).toMatchObject({ claimed: 1, succeeded: 1, failed: 0, dead_letter: 0 });

    const observations = await db
      .select({ id: advertisingSpendObservations.id })
      .from(advertisingSpendObservations);
    const reconciliations = await db
      .select({
        id: advertisingSpendReconciliations.id,
        workspaceAttributedSpend: advertisingSpendReconciliations.workspaceAttributedSpend,
        unallocatedSpend: advertisingSpendReconciliations.unallocatedSpend,
        discrepancy: advertisingSpendReconciliations.discrepancy,
      })
      .from(advertisingSpendReconciliations);
    const runs = await db
      .select({ status: advertisingSyncRuns.status })
      .from(advertisingSyncRuns)
      .where(eq(advertisingSyncRuns.syncStateId, state.id));
    expect(observations).toHaveLength(2);
    expect(reconciliations).toEqual([
      expect.objectContaining({
        workspaceAttributedSpend: "12.500000",
        unallocatedSpend: "15.000000",
        discrepancy: "0.000000",
      }),
    ]);
    expect(runs.map((run) => run.status).sort()).toEqual(["failed", "succeeded"]);
  });

  it("persists bounded provider object metadata and exact promoted post IDs", async () => {
    const { agencyA, accountA, connectionA } = await seed();
    await db.update(advertisingConnections).set({ status: "active" });
    await db.insert(advertisingConnectionAccounts).values({
      connectionId: connectionA.id,
      accountId: accountA.id,
    });

    const first = await persistAdvertisingProviderObjects(db, {
      agencyId: agencyA.id,
      accountId: accountA.id,
      connectionId: connectionA.id,
      objectType: "ad",
      rows: {
        data: [
          {
            id: "ad_promoted_1",
            name: "Launch ad",
            status: "ACTIVE",
            creative: { object_story_spec: { link_data: { post_id: "page_1_post_9" } } },
            access_token: "must-not-persist",
          },
        ],
      },
    });
    const second = await persistAdvertisingProviderObjects(db, {
      agencyId: agencyA.id,
      accountId: accountA.id,
      connectionId: connectionA.id,
      objectType: "ad",
      rows: { data: [{ id: "ad_promoted_1", name: "Launch ad refreshed", status: "PAUSED" }] },
    });
    expect(first.written).toBe(1);
    expect(second.written).toBe(1);

    const objects = await db
      .select({
        name: advertisingProviderObjects.name,
        status: advertisingProviderObjects.status,
        promotedPostId: advertisingProviderObjects.promotedPostId,
        postAssociationStatus: advertisingProviderObjects.postAssociationStatus,
        metadata: advertisingProviderObjects.metadata,
      })
      .from(advertisingProviderObjects);
    expect(objects).toHaveLength(1);
    expect(objects[0]).toMatchObject({
      name: "Launch ad refreshed",
      status: "PAUSED",
      promotedPostId: "page_1_post_9",
      postAssociationStatus: "linked",
    });
    expect(JSON.stringify(objects[0]?.metadata)).not.toContain("must-not-persist");
  });

  it("scopes one shared account across workspaces and revokes report access immediately", async () => {
    const { agencyA, workspaceA, accountA, connectionA, actor } = await seed();
    const [workspaceA2] = await db
      .insert(workspaces)
      .values({
        agencyId: agencyA.id,
        slug: "workspace-a2",
        name: "Workspace A2",
        createdBy: actor.id,
      })
      .returning();
    if (!workspaceA2) throw new Error("failed to seed second workspace");

    await db.insert(agencyMemberships).values({
      agencyId: agencyA.id,
      userId: actor.id,
      status: "active",
      isAgencyAdmin: false,
    });
    await db.insert(workspaceMemberships).values([
      { workspaceId: workspaceA.id, userId: actor.id, status: "active" },
      { workspaceId: workspaceA2.id, userId: actor.id, status: "active" },
    ]);
    await db
      .update(advertisingConnections)
      .set({ status: "active" })
      .where(eq(advertisingConnections.id, connectionA.id));
    await db.insert(advertisingConnectionAccounts).values({
      connectionId: connectionA.id,
      accountId: accountA.id,
    });
    await db.insert(advertisingSpendObservations).values([
      {
        agencyId: agencyA.id,
        accountId: accountA.id,
        connectionId: connectionA.id,
        externalAdId: "ad_workspace_a1",
        externalCampaignId: "campaign_workspace_a1",
        externalAdSetId: "adset_workspace_a1",
        reportDate: "2026-10-01",
        currency: "EUR",
        spend: "10.00",
        impressions: 100,
        clicks: 5,
        attributionWindow: "account",
        actionReportTime: "impression",
      },
      {
        agencyId: agencyA.id,
        accountId: accountA.id,
        connectionId: connectionA.id,
        externalAdId: "ad_workspace_a2",
        externalCampaignId: "campaign_workspace_a2",
        externalAdSetId: "adset_workspace_a2",
        reportDate: "2026-10-01",
        currency: "EUR",
        spend: "90.00",
        impressions: 900,
        clicks: 90,
        attributionWindow: "account",
        actionReportTime: "impression",
      },
      {
        agencyId: agencyA.id,
        accountId: accountA.id,
        connectionId: connectionA.id,
        externalAdId: "ad_workspace_unassigned",
        externalCampaignId: "campaign_workspace_unassigned",
        externalAdSetId: "adset_workspace_unassigned",
        reportDate: "2026-10-01",
        currency: "EUR",
        spend: "15.00",
        impressions: 150,
        clicks: 15,
        attributionWindow: "account",
        actionReportTime: "impression",
      },
    ]);

    const grantA1 = await grantAdvertisingVisibility(db, {
      agencyId: agencyA.id,
      workspaceId: workspaceA.id,
      accountId: accountA.id,
      capability: "read_reports",
      campaignIds: ["campaign_workspace_a1"],
      grantedBy: actor.id,
    });
    await grantAdvertisingVisibility(db, {
      agencyId: agencyA.id,
      workspaceId: workspaceA2.id,
      accountId: accountA.id,
      capability: "read_reports",
      campaignIds: ["campaign_workspace_a2"],
      grantedBy: actor.id,
    });

    const accountsA1 = await listAdvertisingReportAccounts(db, {
      actor: { id: actor.id },
      agencyId: agencyA.id,
      workspaceId: workspaceA.id,
    });
    const accountsA2 = await listAdvertisingReportAccounts(db, {
      actor: { id: actor.id },
      agencyId: agencyA.id,
      workspaceId: workspaceA2.id,
    });
    expect(accountsA1.map((account) => account.id)).toEqual([accountA.id]);
    expect(accountsA2.map((account) => account.id)).toEqual([accountA.id]);

    const reportA1 = await loadAdvertisingReport(db, {
      actor: { id: actor.id },
      agencyId: agencyA.id,
      workspaceId: workspaceA.id,
      accountId: accountA.id,
      since: "2026-10-01",
      until: "2026-10-01",
      surface: "workspace_dashboard",
    });
    const reportA2 = await loadAdvertisingReport(db, {
      actor: { id: actor.id },
      agencyId: agencyA.id,
      workspaceId: workspaceA2.id,
      accountId: accountA.id,
      since: "2026-10-01",
      until: "2026-10-01",
      surface: "workspace_dashboard",
    });
    expect(reportA1.kind).toBe("ok");
    expect(reportA2.kind).toBe("ok");
    if (reportA1.kind !== "ok" || reportA2.kind !== "ok") return;
    expect(reportA1.report.rows.map((row) => row.campaignId)).toEqual(["campaign_workspace_a1"]);
    expect(reportA2.report.rows.map((row) => row.campaignId)).toEqual(["campaign_workspace_a2"]);
    expect(reportA1.report.totals.spend).toBe(10);
    expect(reportA2.report.totals.spend).toBe(90);
    expect(reportA1.report.rows.some((row) => row.adId === "ad_workspace_unassigned")).toBe(false);
    expect(reportA2.report.rows.some((row) => row.adId === "ad_workspace_unassigned")).toBe(false);
    expect(reportA1.report.cacheKey).not.toBe(reportA2.report.cacheKey);

    await revokeAdvertisingVisibility(db, {
      agencyId: agencyA.id,
      grantId: grantA1.id,
      revokedBy: actor.id,
    });
    const revokedReport = await loadAdvertisingReport(db, {
      actor: { id: actor.id },
      agencyId: agencyA.id,
      workspaceId: workspaceA.id,
      accountId: accountA.id,
      since: "2026-10-01",
      until: "2026-10-01",
      surface: "workspace_dashboard",
    });
    expect(revokedReport).toEqual({ kind: "forbidden" });
    const revokedExport = await loadAdvertisingReport(db, {
      actor: { id: actor.id },
      agencyId: agencyA.id,
      workspaceId: workspaceA.id,
      accountId: accountA.id,
      since: "2026-10-01",
      until: "2026-10-01",
      surface: "csv_export",
    });
    expect(revokedExport).toEqual({ kind: "forbidden" });
    expect(
      await listAdvertisingReportAccounts(db, {
        actor: { id: actor.id },
        agencyId: agencyA.id,
        workspaceId: workspaceA.id,
      }),
    ).toEqual([]);
  });

  it("supports the same external Meta account in two agencies through isolated local links", async () => {
    const {
      agencyA,
      agencyB,
      workspaceA,
      workspaceB,
      accountA,
      accountB,
      connectionA,
      connectionB,
      actor,
    } = await seed();
    await db
      .update(advertisingAccounts)
      .set({ externalAccountId: accountA.externalAccountId })
      .where(eq(advertisingAccounts.id, accountB.id));
    await db.update(advertisingConnections).set({ status: "active" });
    await db.insert(advertisingConnectionAccounts).values([
      { connectionId: connectionA.id, accountId: accountA.id },
      { connectionId: connectionB.id, accountId: accountB.id },
    ]);
    await db.insert(agencyMemberships).values([
      { agencyId: agencyA.id, userId: actor.id, status: "active", isAgencyAdmin: false },
      { agencyId: agencyB.id, userId: actor.id, status: "active", isAgencyAdmin: false },
    ]);
    await db.insert(workspaceMemberships).values([
      { workspaceId: workspaceA.id, userId: actor.id, status: "active" },
      { workspaceId: workspaceB.id, userId: actor.id, status: "active" },
    ]);
    await grantAdvertisingVisibility(db, {
      agencyId: agencyA.id,
      workspaceId: workspaceA.id,
      accountId: accountA.id,
      capability: "read_reports",
      grantedBy: actor.id,
    });
    await grantAdvertisingVisibility(db, {
      agencyId: agencyB.id,
      workspaceId: workspaceB.id,
      accountId: accountB.id,
      capability: "read_reports",
      grantedBy: actor.id,
    });
    await db.insert(advertisingSpendObservations).values([
      {
        agencyId: agencyA.id,
        accountId: accountA.id,
        connectionId: connectionA.id,
        externalAdId: "shared-ad-a",
        externalCampaignId: "shared-campaign-a",
        reportDate: "2026-10-01",
        currency: "EUR",
        spend: "10.00",
        impressions: 100,
        clicks: 5,
        attributionWindow: "account",
        actionReportTime: "impression",
      },
      {
        agencyId: agencyB.id,
        accountId: accountB.id,
        connectionId: connectionB.id,
        externalAdId: "shared-ad-b",
        externalCampaignId: "shared-campaign-b",
        reportDate: "2026-10-01",
        currency: "EUR",
        spend: "90.00",
        impressions: 900,
        clicks: 90,
        attributionWindow: "account",
        actionReportTime: "impression",
      },
    ]);
    const [reportA, reportB] = await Promise.all([
      loadAdvertisingReport(db, {
        actor: { id: actor.id },
        agencyId: agencyA.id,
        workspaceId: workspaceA.id,
        accountId: accountA.id,
        since: "2026-10-01",
        until: "2026-10-01",
        surface: "workspace_dashboard",
      }),
      loadAdvertisingReport(db, {
        actor: { id: actor.id },
        agencyId: agencyB.id,
        workspaceId: workspaceB.id,
        accountId: accountB.id,
        since: "2026-10-01",
        until: "2026-10-01",
        surface: "workspace_dashboard",
      }),
    ]);
    expect(reportA.kind).toBe("ok");
    expect(reportB.kind).toBe("ok");
    if (reportA.kind !== "ok" || reportB.kind !== "ok") return;
    expect(reportA.report.totals.spend).toBe(10);
    expect(reportB.report.totals.spend).toBe(90);
    expect(reportA.report.rows[0]?.accountId).toBe(accountA.id);
    expect(reportB.report.rows[0]?.accountId).toBe(accountB.id);
  });

  it("shares one platform credential and one canonical provider identity across two agencies", async () => {
    const { agencyA, agencyB, connectionA } = await seed();
    await db
      .update(advertisingConnections)
      .set({ status: "active", ownerType: "platform" })
      .where(eq(advertisingConnections.id, connectionA.id));
    await grantAdvertisingConnectionAgency(db, {
      connectionId: connectionA.id,
      agencyId: agencyA.id,
    });
    await grantAdvertisingConnectionAgency(db, {
      connectionId: connectionA.id,
      agencyId: agencyB.id,
    });

    const accountA = await persistDiscoveredAdvertisingAccount(db, {
      agencyId: agencyA.id,
      connectionId: connectionA.id,
      externalAccountId: "act_shared_platform",
      name: "Shared Platform Account",
      currency: "EUR",
      timezone: "UTC",
    });
    const accountB = await persistDiscoveredAdvertisingAccount(db, {
      agencyId: agencyB.id,
      connectionId: connectionA.id,
      externalAccountId: "act_shared_platform",
      name: "Shared Platform Account",
      currency: "EUR",
      timezone: "UTC",
    });

    expect(accountA.id).not.toBe(accountB.id);
    expect(accountA.identityId).toBeTruthy();
    expect(accountB.identityId).toBe(accountA.identityId);

    const observation = {
      externalAdId: "ad_shared_platform",
      externalCampaignId: "campaign_shared_platform",
      externalAdSetId: "adset_shared_platform",
      reportDate: "2026-10-13",
      currency: "EUR",
      spend: "12.50",
      impressions: 100,
      clicks: 5,
      attributionWindow: "account",
      actionReportTime: "impression",
    } as const;
    await ingestAdvertisingSpend(db, {
      agencyId: agencyA.id,
      accountId: accountA.id,
      connectionId: connectionA.id,
      observations: [observation],
    });
    await ingestAdvertisingSpend(db, {
      agencyId: agencyB.id,
      accountId: accountB.id,
      connectionId: connectionA.id,
      observations: [observation],
    });
    const canonicalFacts = await db
      .select({ id: advertisingCanonicalSpendFacts.id })
      .from(advertisingCanonicalSpendFacts)
      .where(eq(advertisingCanonicalSpendFacts.identityId, accountA.identityId as string));
    expect(canonicalFacts).toHaveLength(1);
  });

  it("ingests inventory beyond the diagnostic ten-object traversal limit", async () => {
    const { accountA, connectionA } = await seed();
    await db.update(advertisingConnections).set({ status: "active" });
    await db.insert(advertisingConnectionAccounts).values({
      connectionId: connectionA.id,
      accountId: accountA.id,
    });
    const campaigns = Array.from({ length: 12 }, (_, index) => ({
      id: `campaign-large-${index + 1}`,
      name: `Campaign ${index + 1}`,
    }));
    const provider: MetaAdvertisingProvider = {
      provider: "meta",
      validateConnection: async () => undefined,
      discoverAccounts: async () => [],
      readCampaigns: async () => ({
        data: campaigns.slice(0, 3),
        paging: { next: { after: "more" } },
      }),
      readCampaignsComplete: async (_connection, _account, options) => {
        await options?.onPage?.({ path: "act/campaigns", params: { after: "more" } });
        await options?.onPage?.(null);
        return { data: campaigns, complete: true, pages: 2 };
      },
      readAdSets: async () => ({ data: [] }),
      readAdSetsComplete: async () => ({ data: [], complete: true, pages: 1 }),
      readAds: async () => ({ data: [] }),
      readAdsComplete: async () => ({ data: [], complete: true, pages: 1 }),
      readCreatives: async () => ({ data: [] }),
      readBreakdowns: async () => ({ data: [] }),
      readBreakdownsComplete: async () => ({ data: [], complete: true, pages: 1 }),
      readPages: async () => ({ data: [] }),
      readInstagramAccounts: async () => ({ data: [] }),
      readDailyInsights: async (_connection, _account, context) => ({
        data:
          context.grain === "ad_day"
            ? [
                {
                  ad_id: "large-ad",
                  campaign_id: campaigns[0]?.id,
                  date_start: context.dateRange.since,
                  spend: "1",
                  impressions: 1,
                  clicks: 0,
                },
              ]
            : [{ date_start: context.dateRange.since, spend: "1" }],
      }),
      readDailyInsightsComplete: async (_connection, _account, context) => ({
        data:
          context.grain === "ad_day"
            ? [
                {
                  ad_id: "large-ad",
                  campaign_id: campaigns[0]?.id,
                  date_start: context.dateRange.since,
                  spend: "1",
                  impressions: 1,
                  clicks: 0,
                },
              ]
            : [{ date_start: context.dateRange.since, spend: "1" }],
        complete: true,
        pages: 1,
      }),
    };
    await db.insert(advertisingSyncStates).values({
      status: "idle",
      connectionId: connectionA.id,
      accountId: accountA.id,
    });
    const result = await runAdvertisingSyncTick(db, {
      owner: "large-inventory-worker",
      limit: 1,
      providerFactory: () => provider,
    });
    expect(result).toMatchObject({ claimed: 1, succeeded: 1, partial: 0 });
    const objectRows = await db
      .select({ externalObjectId: advertisingProviderObjects.externalObjectId })
      .from(advertisingProviderObjects);
    expect(objectRows).toHaveLength(12);
  });

  it("does not expose account-level audience rows through a campaign-scoped grant", async () => {
    const { agencyA, workspaceA, accountA, connectionA, actor } = await seed();
    await db.update(advertisingConnections).set({ status: "active" });
    await db.insert(advertisingConnectionAccounts).values({
      connectionId: connectionA.id,
      accountId: accountA.id,
    });
    await db.insert(agencyMemberships).values({
      agencyId: agencyA.id,
      userId: actor.id,
      status: "active",
      isAgencyAdmin: false,
    });
    await db.insert(workspaceMemberships).values({
      workspaceId: workspaceA.id,
      userId: actor.id,
      status: "active",
    });
    await db.insert(advertisingSpendObservations).values({
      agencyId: agencyA.id,
      accountId: accountA.id,
      connectionId: connectionA.id,
      externalAdId: "audience-ad",
      externalCampaignId: "audience-campaign",
      externalAdSetId: "audience-adset",
      reportDate: "2026-10-01",
      currency: "EUR",
      spend: "10",
      impressions: 100,
      clicks: 5,
      attributionWindow: "account",
      actionReportTime: "impression",
    });
    await db.insert(advertisingAudienceObservations).values({
      agencyId: agencyA.id,
      accountId: accountA.id,
      connectionId: connectionA.id,
      reportDate: "2026-10-01",
      breakdown: "age",
      dimensionValue: "25-34",
      currency: "EUR",
      spend: "10",
      impressions: 100,
      clicks: 5,
      reach: 80,
      attributionWindow: "account",
      actionReportTime: "impression",
    });
    await grantAdvertisingVisibility(db, {
      agencyId: agencyA.id,
      workspaceId: workspaceA.id,
      accountId: accountA.id,
      capability: "read_reports",
      campaignIds: ["audience-campaign"],
      grantedBy: actor.id,
    });
    const campaignScoped = await loadAdvertisingReport(db, {
      actor: { id: actor.id },
      agencyId: agencyA.id,
      workspaceId: workspaceA.id,
      accountId: accountA.id,
      since: "2026-10-01",
      until: "2026-10-01",
      surface: "workspace_dashboard",
    });
    expect(campaignScoped.kind).toBe("ok");
    if (campaignScoped.kind !== "ok") return;
    expect(campaignScoped.audience).toEqual([]);

    await grantAdvertisingVisibility(db, {
      agencyId: agencyA.id,
      workspaceId: workspaceA.id,
      accountId: accountA.id,
      capability: "read_reports",
      grantedBy: actor.id,
    });
    const accountWide = await loadAdvertisingReport(db, {
      actor: { id: actor.id },
      agencyId: agencyA.id,
      workspaceId: workspaceA.id,
      accountId: accountA.id,
      since: "2026-10-01",
      until: "2026-10-01",
      surface: "workspace_dashboard",
    });
    expect(accountWide.kind).toBe("ok");
    if (accountWide.kind !== "ok") return;
    expect(accountWide.audience).toHaveLength(1);
  });

  it("revokes financial authority in place and records an audit event", async () => {
    const { agencyA, workspaceA, accountA, actor } = await seed();
    const authority = await grantAdvertisingFinancialAuthority(db, {
      agencyId: agencyA.id,
      workspaceId: workspaceA.id,
      accountId: accountA.id,
      grantedBy: actor.id,
    });

    const revoked = await revokeAdvertisingFinancialAuthority(db, {
      agencyId: agencyA.id,
      authorityId: authority.id,
      revokedBy: actor.id,
    });
    expect(revoked.revokedAt).toBeInstanceOf(Date);

    const auditResult = await db.execute<{ action: string; target_id: string }>(sql`
      SELECT action, target_id
      FROM security_audit_event
      WHERE action = 'advertising.financial_authority.revoked'
        AND target_id = ${authority.id}
      ORDER BY created_at DESC
      LIMIT 1
    `);
    expect(auditResult.rows[0]).toEqual({
      action: "advertising.financial_authority.revoked",
      target_id: authority.id,
    });
  });
});

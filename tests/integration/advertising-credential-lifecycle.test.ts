import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import {
  agencies,
  advertisingAccounts,
  advertisingConnectionAccounts,
  advertisingConnections,
  advertisingCredentialVersions,
  advertisingValidationResults,
  advertisingSyncStates,
  securityAuditEvents,
  users,
  workspaces,
} from "@/lib/db/schema";
import { enableAgencyDek } from "@/lib/social/key-management";
import {
  activateAdvertisingConnection,
  createAdvertisingConnection,
  persistDiscoveredAdvertisingAccount,
  updateAdvertisingGraphApiVersion,
} from "@/lib/advertising/connection-service";
import {
  AdvertisingConnectionNotFoundError,
  AdvertisingConnectionRevokedError,
  resolveAdvertisingCredential,
  revokeAdvertisingConnection,
  storeAdvertisingCredential,
} from "@/lib/advertising/credential-service";
import { MetaHttpError } from "@/lib/advertising/meta-http";
import { createMetaAdvertisingProvider } from "@/lib/advertising/providers/meta";
import { runMetaConfigurationWorkflow } from "@/lib/advertising/meta-workflow";
import type { AdvertisingConnection } from "@/lib/advertising/types";

process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DATABASE_URL });
const db = drizzle(pool);

async function seed() {
  const [agency] = await db
    .insert(agencies)
    .values({ name: "Advertising Lifecycle Agency", slug: "advertising-lifecycle-agency" })
    .returning();
  const [user] = await db
    .insert(users)
    .values({ email: "advertising-lifecycle@example.test", displayName: "Lifecycle Tester" })
    .returning();
  const [workspace] = await db
    .insert(workspaces)
    .values({
      agencyId: agency!.id,
      slug: "advertising-lifecycle-workspace",
      name: "Advertising Lifecycle Workspace",
      createdBy: user!.id,
    })
    .returning();
  if (!agency || !user || !workspace) throw new Error("failed to seed lifecycle fixtures");
  await enableAgencyDek(db, { agencyId: agency.id, actorId: user.id });
  const connection = await createAdvertisingConnection(db, {
    agencyId: agency.id,
    provider: "meta",
    displayName: "Lifecycle Meta Connection",
    actorId: user.id,
  });
  const [storedConnection] = await db
    .select({
      id: advertisingConnections.id,
      provider: advertisingConnections.provider,
      agencyId: advertisingConnections.agencyId,
      credentialRef: advertisingConnections.credentialRef,
      status: advertisingConnections.status,
      lastValidatedAt: advertisingConnections.lastValidatedAt,
    })
    .from(advertisingConnections)
    .where(eq(advertisingConnections.id, connection.id));
  if (!storedConnection) throw new Error("failed to reload lifecycle connection");
  const fullConnection: AdvertisingConnection = {
    ...storedConnection,
    provider: "meta",
    status: storedConnection.status as AdvertisingConnection["status"],
    lastValidatedAt: storedConnection.lastValidatedAt?.toISOString() ?? null,
  };
  return {
    agency,
    user,
    workspace,
    connection: fullConnection,
  };
}

describe("advertising credential lifecycle", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  });

  beforeEach(async () => {
    await db.execute(sql`
      TRUNCATE
        advertising_audience_observation,
        advertising_provider_object,
        advertising_sync_state,
        advertising_credential_version,
        advertising_connection,
        agency_social_dek,
        workspace,
        agency,
        "user"
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("rotates credentials, revokes the old version, and resolves only the current version", async () => {
    const { agency, user, connection } = await seed();
    const first = await storeAdvertisingCredential(db, {
      agencyId: agency.id,
      connectionId: connection.id,
      credentials: { accessToken: "meta-token-v1" },
      actorId: user.id,
    });
    expect(first.version).toBe(1);

    await activateAdvertisingConnection(db, {
      agencyId: agency.id,
      connectionId: connection.id,
    });
    await expect(
      resolveAdvertisingCredential(db, {
        agencyId: agency.id,
        connectionId: connection.id,
      }),
    ).resolves.toEqual({ accessToken: "meta-token-v1" });

    const second = await storeAdvertisingCredential(db, {
      agencyId: agency.id,
      connectionId: connection.id,
      credentials: { accessToken: "meta-token-v2", refreshToken: "refresh-v2" },
      actorId: user.id,
    });
    expect(second.version).toBe(2);

    const versions = await db
      .select({
        version: advertisingCredentialVersions.version,
        revokedAt: advertisingCredentialVersions.revokedAt,
      })
      .from(advertisingCredentialVersions)
      .where(eq(advertisingCredentialVersions.connectionId, connection.id));
    expect(versions).toHaveLength(2);
    expect(versions.find((row) => row.version === 1)?.revokedAt).not.toBeNull();
    expect(versions.find((row) => row.version === 2)?.revokedAt).toBeNull();

    await expect(
      resolveAdvertisingCredential(db, {
        agencyId: agency.id,
        connectionId: connection.id,
      }),
    ).rejects.toBeInstanceOf(AdvertisingConnectionNotFoundError);

    await activateAdvertisingConnection(db, {
      agencyId: agency.id,
      connectionId: connection.id,
    });
    await expect(
      resolveAdvertisingCredential(db, {
        agencyId: agency.id,
        connectionId: connection.id,
      }),
    ).resolves.toEqual({ accessToken: "meta-token-v2", refreshToken: "refresh-v2" });

    const [storedConnection] = await db
      .select({ currentCredentialVersion: advertisingConnections.currentCredentialVersion })
      .from(advertisingConnections)
      .where(eq(advertisingConnections.id, connection.id));
    expect(storedConnection?.currentCredentialVersion).toBe(2);
  });

  it("resolves a newly stored credential for validation before activation", async () => {
    const { agency, user, connection } = await seed();
    await storeAdvertisingCredential(db, {
      agencyId: agency.id,
      connectionId: connection.id,
      credentials: { accessToken: "meta-token-pending-validation" },
      actorId: user.id,
    });

    await expect(
      resolveAdvertisingCredential(db, {
        agencyId: agency.id,
        connectionId: connection.id,
      }),
    ).rejects.toBeInstanceOf(AdvertisingConnectionNotFoundError);
    await expect(
      resolveAdvertisingCredential(db, {
        agencyId: agency.id,
        connectionId: connection.id,
        allowPendingValidation: true,
      }),
    ).resolves.toEqual({ accessToken: "meta-token-pending-validation" });
  });

  it("records a sanitized diagnostic when the Meta identity probe is denied", async () => {
    const { agency, connection } = await seed();
    const provider = createMetaAdvertisingProvider(
      {
        resolve: async () => ({ accessToken: "synthetic-token" }),
      },
      () => ({
        get: async () => {
          throw new MetaHttpError(403, 190);
        },
      }),
    );

    const result = await runMetaConfigurationWorkflow(db, {
      agencyId: agency.id,
      connection,
      provider,
    });

    expect(result.status).toBe("failed");
    expect(result.diagnostics).toEqual([
      { operation: "diagnostics", state: "expired_or_revoked", retryable: false },
    ]);
    const rows = await db
      .select({
        operation: advertisingValidationResults.operation,
        sanitizedCode: advertisingValidationResults.sanitizedCode,
      })
      .from(advertisingValidationResults)
      .where(eq(advertisingValidationResults.connectionId, connection.id));
    expect(rows).toEqual([{ operation: "diagnostics", sanitizedCode: "meta_permission_denied" }]);
  });

  it("migrates the pinned Graph version while fencing active synchronization", async () => {
    const { agency, user, connection } = await seed();
    await storeAdvertisingCredential(db, {
      agencyId: agency.id,
      connectionId: connection.id,
      credentials: { accessToken: "meta-token-version-migration" },
      actorId: user.id,
    });
    await activateAdvertisingConnection(db, {
      agencyId: agency.id,
      connectionId: connection.id,
    });
    const account = await persistDiscoveredAdvertisingAccount(db, {
      agencyId: agency.id,
      connectionId: connection.id,
      externalAccountId: "act_version_migration",
      name: "Version Migration Account",
      currency: "EUR",
      timezone: "Europe/Berlin",
    });
    await db.insert(advertisingSyncStates).values({
      connectionId: connection.id,
      accountId: account.id,
      status: "running",
      nextRunAt: new Date(),
      leaseOwner: "worker",
      leaseToken: randomUUID(),
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });

    await updateAdvertisingGraphApiVersion(db, {
      agencyId: agency.id,
      connectionId: connection.id,
      graphApiVersion: "v26.0",
      actorId: user.id,
    });

    const [updatedConnection] = await db
      .select({
        graphApiVersion: advertisingConnections.graphApiVersion,
        status: advertisingConnections.status,
        lastValidatedAt: advertisingConnections.lastValidatedAt,
        lastValidationStatus: advertisingConnections.lastValidationStatus,
        lastValidationCode: advertisingConnections.lastValidationCode,
      })
      .from(advertisingConnections)
      .where(eq(advertisingConnections.id, connection.id));
    expect(updatedConnection).toEqual({
      graphApiVersion: "v26.0",
      status: "invalid",
      lastValidatedAt: null,
      lastValidationStatus: null,
      lastValidationCode: null,
    });

    const [syncState] = await db
      .select({
        status: advertisingSyncStates.status,
        nextRunAt: advertisingSyncStates.nextRunAt,
        leaseOwner: advertisingSyncStates.leaseOwner,
        leaseToken: advertisingSyncStates.leaseToken,
        leaseExpiresAt: advertisingSyncStates.leaseExpiresAt,
      })
      .from(advertisingSyncStates)
      .where(eq(advertisingSyncStates.connectionId, connection.id));
    expect(syncState).toEqual({
      status: "paused",
      nextRunAt: null,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
    });

    const [audit] = await db
      .select({ action: securityAuditEvents.action, outcome: securityAuditEvents.outcome })
      .from(securityAuditEvents)
      .where(eq(securityAuditEvents.targetId, connection.id))
      .orderBy(sql`created_at DESC`)
      .limit(1);
    expect(audit).toEqual({
      action: "advertising.connection.graph_version_updated",
      outcome: "success",
    });
  });

  it("revokes provider reads, active versions, linked sync state, and blocks reactivation", async () => {
    const { agency, user, connection } = await seed();
    await storeAdvertisingCredential(db, {
      agencyId: agency.id,
      connectionId: connection.id,
      credentials: { accessToken: "meta-token" },
      actorId: user.id,
    });
    await activateAdvertisingConnection(db, {
      agencyId: agency.id,
      connectionId: connection.id,
    });
    const [account] = await db
      .insert(advertisingAccounts)
      .values({
        agencyId: agency.id,
        provider: "meta",
        externalAccountId: "act_lifecycle",
        name: "Lifecycle Account",
      })
      .returning({ id: advertisingAccounts.id });
    expect(account).toBeDefined();
    const [syncState] = await db
      .insert(advertisingSyncStates)
      .values({ connectionId: connection.id, accountId: account!.id })
      .returning({ id: advertisingSyncStates.id });
    expect(syncState).toBeDefined();
    await db
      .update(advertisingSyncStates)
      .set({
        status: "running",
        nextRunAt: new Date(),
        leaseOwner: "lifecycle-worker",
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(Date.now() + 60_000),
      })
      .where(eq(advertisingSyncStates.id, syncState!.id));

    await revokeAdvertisingConnection(db, { agencyId: agency.id, connectionId: connection.id });

    const [storedConnection] = await db
      .select({
        status: advertisingConnections.status,
        currentCredentialVersion: advertisingConnections.currentCredentialVersion,
      })
      .from(advertisingConnections)
      .where(eq(advertisingConnections.id, connection.id));
    expect(storedConnection).toEqual({ status: "revoked", currentCredentialVersion: 0 });
    const [version] = await db
      .select({ revokedAt: advertisingCredentialVersions.revokedAt })
      .from(advertisingCredentialVersions)
      .where(eq(advertisingCredentialVersions.connectionId, connection.id));
    expect(version?.revokedAt).not.toBeNull();
    const [pausedState] = await db
      .select({
        status: advertisingSyncStates.status,
        nextRunAt: advertisingSyncStates.nextRunAt,
        leaseOwner: advertisingSyncStates.leaseOwner,
        leaseToken: advertisingSyncStates.leaseToken,
        leaseExpiresAt: advertisingSyncStates.leaseExpiresAt,
      })
      .from(advertisingSyncStates)
      .where(eq(advertisingSyncStates.id, syncState!.id));
    expect(pausedState).toEqual({
      status: "paused",
      nextRunAt: null,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
    });
    await expect(
      resolveAdvertisingCredential(db, {
        agencyId: agency.id,
        connectionId: connection.id,
      }),
    ).rejects.toBeInstanceOf(AdvertisingConnectionNotFoundError);
    await expect(
      activateAdvertisingConnection(db, {
        agencyId: agency.id,
        connectionId: connection.id,
      }),
    ).rejects.toThrow("advertising_connection_not_found");
    await expect(
      storeAdvertisingCredential(db, {
        agencyId: agency.id,
        connectionId: connection.id,
        credentials: { accessToken: "must-not-be-accepted" },
        actorId: user.id,
      }),
    ).rejects.toBeInstanceOf(AdvertisingConnectionRevokedError);
  });

  it("reuses one canonical provider account across multiple active connections", async () => {
    const { agency, user, connection } = await seed();
    await storeAdvertisingCredential(db, {
      agencyId: agency.id,
      connectionId: connection.id,
      credentials: { accessToken: "meta-token-primary" },
      actorId: user.id,
    });
    await activateAdvertisingConnection(db, {
      agencyId: agency.id,
      connectionId: connection.id,
    });

    const secondConnection = await createAdvertisingConnection(db, {
      agencyId: agency.id,
      provider: "meta",
      displayName: "Lifecycle Meta Connection (secondary)",
      actorId: user.id,
    });
    await storeAdvertisingCredential(db, {
      agencyId: agency.id,
      connectionId: secondConnection.id,
      credentials: { accessToken: "meta-token-secondary" },
      actorId: user.id,
    });
    await activateAdvertisingConnection(db, {
      agencyId: agency.id,
      connectionId: secondConnection.id,
    });

    const firstDiscovery = await persistDiscoveredAdvertisingAccount(db, {
      agencyId: agency.id,
      connectionId: connection.id,
      externalAccountId: "act_shared_lifecycle",
      name: "Shared Lifecycle Account",
      currency: "EUR",
      timezone: "Europe/Berlin",
      metadata: { source: "primary", access_token: "must-not-persist" },
    });
    const secondDiscovery = await persistDiscoveredAdvertisingAccount(db, {
      agencyId: agency.id,
      connectionId: secondConnection.id,
      externalAccountId: "act_shared_lifecycle",
      name: "Shared Lifecycle Account (refreshed)",
      currency: "EUR",
      timezone: "Europe/Berlin",
      metadata: { source: "secondary" },
    });

    expect(secondDiscovery.id).toBe(firstDiscovery.id);
    const accounts = await db
      .select({ id: advertisingAccounts.id, name: advertisingAccounts.name })
      .from(advertisingAccounts)
      .where(eq(advertisingAccounts.externalAccountId, "act_shared_lifecycle"));
    expect(accounts).toEqual([
      { id: firstDiscovery.id, name: "Shared Lifecycle Account (refreshed)" },
    ]);

    const links = await db
      .select({ connectionId: advertisingConnectionAccounts.connectionId })
      .from(advertisingConnectionAccounts)
      .where(eq(advertisingConnectionAccounts.accountId, firstDiscovery.id));
    expect(links.map((link) => link.connectionId).sort()).toEqual(
      [connection.id, secondConnection.id].sort(),
    );
  });
});

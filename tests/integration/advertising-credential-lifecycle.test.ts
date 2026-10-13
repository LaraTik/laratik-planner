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
  advertisingSyncStates,
  users,
  workspaces,
} from "@/lib/db/schema";
import { enableAgencyDek } from "@/lib/social/key-management";
import {
  activateAdvertisingConnection,
  createAdvertisingConnection,
  persistDiscoveredAdvertisingAccount,
} from "@/lib/advertising/connection-service";
import {
  AdvertisingConnectionNotFoundError,
  AdvertisingConnectionRevokedError,
  resolveAdvertisingCredential,
  revokeAdvertisingConnection,
  storeAdvertisingCredential,
} from "@/lib/advertising/credential-service";

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
  return { agency, user, workspace, connection };
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
      .set({ status: "idle", nextRunAt: new Date() })
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
      .select({ status: advertisingSyncStates.status, nextRunAt: advertisingSyncStates.nextRunAt })
      .from(advertisingSyncStates)
      .where(eq(advertisingSyncStates.id, syncState!.id));
    expect(pausedState).toEqual({ status: "paused", nextRunAt: null });
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

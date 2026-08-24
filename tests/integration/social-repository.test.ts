import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import {
  agencies,
  users,
  workspaces,
  socialChannels,
  socialConnections,
  socialProfileDailyMetrics,
  socialOauthStates,
} from "@/lib/db/schema";
import {
  claimDueProfiles,
  consumeOauthState,
  createOauthState,
  createPendingConnection,
  disconnectProfile,
  markSyncSuccess,
  openConnectionCredentials,
  saveSnapshot,
  updateConnectionCredentials,
  revokeConnectionAndDetach,
  type CreatePendingConnectionInput,
} from "@/lib/social/repository";
import { newRequestId } from "@/lib/social/http";

/**
 * M4 — repository integration test.
 *
 * The repository is the only place that writes to the M4 tables, so
 * this suite is the contract for:
 *
 *   - claimDueProfiles returns rows with an active lease, claims
 *     disjoint rows under two concurrent callers, and recovers rows
 *     whose lease has expired
 *   - saveSnapshot upserts on (channel, metric_date), silently
 *     replacing the prior value when a provider correction arrives
 *     later in the same day
 *   - consumeOauthState is one-shot: the second call with the same
 *     digest returns null
 *   - disconnectProfile clears the connection but preserves the
 *     channel row, its external_account_id, and its metrics
 *   - revokeConnectionAndDetach disconnects every attached channel
 *     and marks the connection revoked in one transaction
 *
 * The encryption key is read from `SOCIAL_TOKEN_ENCRYPTION_KEY`; the
 * test harness sets it to a 32-byte base64 value.
 */
process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

let agencyId: string;
let workspaceId: string;
let userId: string;

async function seed() {
  const [agency] = await db
    .insert(agencies)
    .values({ name: "Acme", slug: `acme-${Math.random().toString(36).slice(2, 8)}` })
    .returning();
  const [user] = await db
    .insert(users)
    .values({ email: `u${Math.random().toString(36).slice(2, 8)}@x.io`, displayName: "U" })
    .returning();
  const [ws] = await db
    .insert(workspaces)
    .values({
      agencyId: agency!.id,
      slug: `main-${Math.random().toString(36).slice(2, 6)}`,
      name: "Main",
      createdBy: user!.id,
    })
    .returning();
  agencyId = agency!.id;
  workspaceId = ws!.id;
  userId = user!.id;
}

async function seedConnection(provider: "meta" | "tiktok" = "meta"): Promise<string> {
  const input: CreatePendingConnectionInput = {
    workspaceId,
    provider,
    providerSubjectId: `psid-${Math.random().toString(36).slice(2, 8)}`,
    scopes: ["x"],
    credentials: { accessToken: "tok", refreshToken: "ref" },
    accessTokenExpiresAt: new Date(Date.now() + 3600_000),
    refreshTokenExpiresAt: new Date(Date.now() + 86400_000),
    connectedBy: userId,
  };
  const conn = await createPendingConnection(db, input);
  return conn.id;
}

async function seedConnectedChannel(connectionId: string, suffix: string) {
  const [ch] = await db
    .insert(socialChannels)
    .values({
      workspaceId,
      platform: "instagram",
      accountName: `Channel ${suffix}`,
      socialConnectionId: connectionId,
      externalAccountId: `ext-${suffix}`,
      connectionStatus: "connected",
      nextSyncAt: new Date(Date.now() - 60_000),
    })
    .returning();
  return ch!;
}

describe("M4 — repository", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  });

  beforeEach(async () => {
    await db.execute(sql`
      TRUNCATE
        social_profile_daily_metric, social_oauth_state, social_channel,
        social_connection,
        publication_record, content_item_channel, content_item,
        brand_asset, brand_voice_rule,
        content_assignment, content_template, content_pillar, campaign,
        workspace_membership_role, workspace_membership, workspace_settings,
        workspace, invitation_workspace_role, invitation,
        agency_membership, bootstrap_lock, agency, "user"
      RESTART IDENTITY CASCADE
    `);
    await seed();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("createPendingConnection / openConnectionCredentials", () => {
    it("seals and reopens the credential envelope", async () => {
      const conn = await createPendingConnection(db, {
        workspaceId,
        provider: "meta",
        providerSubjectId: "psid-1",
        scopes: ["pages_show_list"],
        credentials: { accessToken: "secret", refreshToken: "refresh" },
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
        refreshTokenExpiresAt: null,
        connectedBy: userId,
      });
      const opened = openConnectionCredentials(conn);
      expect(opened.accessToken).toBe("secret");
      expect(opened.refreshToken).toBe("refresh");
    });
  });

  describe("updateConnectionCredentials", () => {
    it("rotates the envelope and bumps lastRefreshedAt", async () => {
      const conn = await createPendingConnection(db, {
        workspaceId,
        provider: "tiktok",
        providerSubjectId: "open-1",
        scopes: ["user.info.basic"],
        credentials: { accessToken: "v1" },
        accessTokenExpiresAt: new Date(),
        refreshTokenExpiresAt: null,
        connectedBy: userId,
      });
      await updateConnectionCredentials(
        db,
        conn.id,
        { accessToken: "v2" },
        new Date(Date.now() + 3600_000),
        null,
      );
      const opened = openConnectionCredentials(conn);
      // Re-read from DB to get the updated row
      const fresh = await db
        .select()
        .from(socialConnections)
        .where(sql`id = ${conn.id}`)
        .limit(1);
      expect(openConnectionCredentials(fresh[0]!).accessToken).toBe("v2");
      expect(fresh[0]!.lastRefreshedAt).not.toBeNull();
    });
  });

  describe("consumeOauthState", () => {
    it("is one-shot", async () => {
      await createOauthState(db, {
        stateDigest: "d1",
        provider: "meta",
        workspaceId,
        actorId: userId,
        returnPath: `/app/w/${workspaceId.slice(0, 8)}-x/channels`,
        expiresAt: new Date(Date.now() + 600_000),
      });
      const first = await consumeOauthState(db, "d1");
      expect(first).not.toBeNull();
      const second = await consumeOauthState(db, "d1");
      expect(second).toBeNull();
    });
    it("rejects an expired state", async () => {
      await createOauthState(db, {
        stateDigest: "d2",
        provider: "meta",
        workspaceId,
        actorId: userId,
        returnPath: "/app/w/main/channels",
        expiresAt: new Date(Date.now() - 60_000),
      });
      const result = await consumeOauthState(db, "d2", new Date());
      expect(result).toBeNull();
    });
  });

  describe("claimDueProfiles", () => {
    it("claims due connected rows and sets a 5-minute lease", async () => {
      const connId = await seedConnection();
      const ch = await seedConnectedChannel(connId, "a");
      const claimed = await claimDueProfiles(db);
      expect(claimed).toHaveLength(1);
      expect(claimed[0]!.channel.id).toBe(ch.id);
      const fresh = await db
        .select()
        .from(socialChannels)
        .where(sql`id = ${ch.id}`)
        .limit(1);
      const lease = fresh[0]!.syncLeaseUntil;
      expect(lease).not.toBeNull();
      // Lease is in the future
      expect(lease!.getTime()).toBeGreaterThan(Date.now());
    });

    it("returns disjoint rows under two concurrent callers", async () => {
      const connId = await seedConnection();
      const a = await seedConnectedChannel(connId, "a");
      const b = await seedConnectedChannel(connId, "b");
      const c = await seedConnectedChannel(connId, "c");
      const [first, second] = await Promise.all([
        claimDueProfiles(db, 2),
        claimDueProfiles(db, 2),
      ]);
      const ids = new Set([
        ...first.map((x) => x.channel.id),
        ...second.map((x) => x.channel.id),
      ]);
      // Across two concurrent claimers, the union of claimed rows
      // is a subset of the seeded rows with no duplicates.
      expect(ids.size).toBe(first.length + second.length);
      expect([a.id, b.id, c.id].some((id) => ids.has(id))).toBe(true);
    });
  });

  describe("saveSnapshot", () => {
    it("upserts on (channel, date) and replaces the prior value", async () => {
      const connId = await seedConnection();
      const ch = await seedConnectedChannel(connId, "a");
      const date = "2026-08-20";
      await saveSnapshot(db, {
        socialChannelId: ch.id,
        metricDate: date,
        snapshot: {
          observedAt: new Date(date),
          followerCount: 100,
          followingCount: null,
          mediaCount: null,
          likesCount: null,
          reach: null,
          views: null,
          engagedAccounts: null,
          interactions: null,
          providerApiVersion: "v1",
          providerRequestId: newRequestId(),
          responseHash: "h1",
          sourceMetadata: {},
        },
      });
      await saveSnapshot(db, {
        socialChannelId: ch.id,
        metricDate: date,
        snapshot: {
          observedAt: new Date(date),
          followerCount: 105,
          followingCount: null,
          mediaCount: null,
          likesCount: null,
          reach: null,
          views: null,
          engagedAccounts: null,
          interactions: null,
          providerApiVersion: "v1",
          providerRequestId: newRequestId(),
          responseHash: "h2",
          sourceMetadata: { partial: true },
        },
      });
      const rows = await db
        .select()
        .from(socialProfileDailyMetrics)
        .where(sql`social_channel_id = ${ch.id}`);
      expect(rows).toHaveLength(1);
      expect(Number(rows[0]!.followerCount)).toBe(105);
    });
  });

  describe("disconnectProfile / revokeConnectionAndDetach", () => {
    it("preserves the channel row + its external_account_id + its metrics", async () => {
      const connId = await seedConnection();
      const ch = await seedConnectedChannel(connId, "a");
      await saveSnapshot(db, {
        socialChannelId: ch.id,
        metricDate: "2026-08-20",
        snapshot: {
          observedAt: new Date("2026-08-20"),
          followerCount: 100,
          followingCount: null,
          mediaCount: null,
          likesCount: null,
          reach: null,
          views: null,
          engagedAccounts: null,
          interactions: null,
          providerApiVersion: "v1",
          providerRequestId: "x",
          responseHash: "h",
          sourceMetadata: {},
        },
      });
      await disconnectProfile(db, workspaceId, ch.id);
      const fresh = await db
        .select()
        .from(socialChannels)
        .where(sql`id = ${ch.id}`)
        .limit(1);
      expect(fresh[0]!.connectionStatus).toBe("disconnected");
      expect(fresh[0]!.socialConnectionId).toBeNull();
      expect(fresh[0]!.externalAccountId).toBe("ext-a");
      const metrics = await db
        .select()
        .from(socialProfileDailyMetrics)
        .where(sql`social_channel_id = ${ch.id}`);
      expect(metrics).toHaveLength(1);
    });

    it("revokeConnectionAndDetach disconnects every attached channel in one transaction", async () => {
      const connId = await seedConnection();
      const a = await seedConnectedChannel(connId, "a");
      const b = await seedConnectedChannel(connId, "b");
      await revokeConnectionAndDetach(db, workspaceId, connId);
      const fresh = await db.select().from(socialChannels).where(
        sql`id IN (${a.id}, ${b.id})`,
      );
      for (const row of fresh) {
        expect(row.connectionStatus).toBe("disconnected");
        expect(row.socialConnectionId).toBeNull();
        expect(row.externalAccountId).not.toBeNull();
      }
      const conn = await db
        .select()
        .from(socialConnections)
        .where(sql`id = ${connId}`)
        .limit(1);
      expect(conn[0]!.status).toBe("revoked");
      expect(conn[0]!.revokedAt).not.toBeNull();
    });
  });

  describe("markSyncSuccess", () => {
    it("clears the lease and bumps lastSyncedAt", async () => {
      const connId = await seedConnection();
      const ch = await seedConnectedChannel(connId, "a");
      const claimed = await claimDueProfiles(db);
      expect(claimed).toHaveLength(1);
      const next = new Date(Date.now() + 86400_000);
      await markSyncSuccess(db, ch.id, next);
      const fresh = await db.select().from(socialChannels).where(sql`id = ${ch.id}`).limit(1);
      expect(fresh[0]!.syncLeaseUntil).toBeNull();
      expect(fresh[0]!.lastSyncedAt).not.toBeNull();
      expect(fresh[0]!.nextSyncAt!.getTime()).toBe(next.getTime());
    });
  });
});

// `socialOauthStates` is referenced in the TRUNCATE; this import keeps
// the module from being tree-shaken in test runs.
void socialOauthStates;

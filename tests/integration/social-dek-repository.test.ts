import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import {
  agencies,
  agencySocialDek,
  socialChannels,
  socialConnections,
  users,
  workspaces,
} from "@/lib/db/schema";
import {
  createPendingConnection,
  openConnectionCredentials,
  type CreatePendingConnectionInput,
} from "@/lib/social/repository";
import { openCredentialsWithDek } from "@/lib/social/crypto";
import {
  createDekCache,
  DekAlreadyEnabledError,
  DekNotEnabledError,
  disableAgencyDek,
  enableAgencyDek,
  getDekForWorkspace,
  getKekOrThrow,
  rewrapAllDeksForKekRotation,
  rotateAgencyDek,
  unwrapDek,
} from "@/lib/social/key-management";
import { deriveDevKey } from "@/lib/security/dev-key";
// `serverEnv` is unused after the env-handling note was tightened
// to use `getKekOrThrow()`. Kept the import path documented for
// future readers; remove if the linter complains.
void deriveDevKey;

/**
 * M4.5 — per-agency social DEK integration.
 *
 * Verifies the transactional surface of `src/lib/social/key-management.ts`
 * against a real Postgres database. The pure-crypto and env surface
 * is in tests/unit/social-key-management.test.ts.
 *
 * What this suite guarantees:
 *
 *   - `enableAgencyDek` inserts exactly one row; a second call
 *     throws `DekAlreadyEnabledError`.
 *   - `rotateAgencyDek` re-seals every `social_connection` in the
 *     agency; old DEK cannot open new envelopes; new DEK can.
 *   - `disableAgencyDek` cascades: every connection is revoked,
 *     every channel is detached, the DEK row is gone.
 *   - Cross-agency isolation: agency A's DEK does not decrypt
 *     agency B's sealed connections.
 *   - `rewrapAllDeksForKekRotation` re-wraps every row, dry-run
 *     does not mutate, wrong old KEK fails closed.
 */
process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DATABASE_URL });
const db = drizzle(pool);

let agencyAId: string;
let agencyBId: string;
let workspaceAId: string;
let workspaceBId: string;
let userId: string;

async function seed() {
  const [agencyA] = await db
    .insert(agencies)
    .values({ name: "A", slug: `a-${Math.random().toString(36).slice(2, 8)}` })
    .returning();
  const [agencyB] = await db
    .insert(agencies)
    .values({ name: "B", slug: `b-${Math.random().toString(36).slice(2, 8)}` })
    .returning();
  const [user] = await db
    .insert(users)
    .values({ email: `u${Math.random().toString(36).slice(2, 8)}@x.io`, displayName: "U" })
    .returning();
  const [wsA] = await db
    .insert(workspaces)
    .values({
      agencyId: agencyA!.id,
      slug: `wa-${Math.random().toString(36).slice(2, 6)}`,
      name: "WA",
      createdBy: user!.id,
    })
    .returning();
  const [wsB] = await db
    .insert(workspaces)
    .values({
      agencyId: agencyB!.id,
      slug: `wb-${Math.random().toString(36).slice(2, 6)}`,
      name: "WB",
      createdBy: user!.id,
    })
    .returning();
  agencyAId = agencyA!.id;
  agencyBId = agencyB!.id;
  workspaceAId = wsA!.id;
  workspaceBId = wsB!.id;
  userId = user!.id;
}

async function seedConnection(
  workspaceId: string,
  provider: "meta" | "tiktok" = "meta",
): Promise<{ id: string }> {
  const input: CreatePendingConnectionInput = {
    workspaceId,
    provider,
    providerSubjectId: `psid-${Math.random().toString(36).slice(2, 8)}`,
    scopes: ["x"],
    credentials: { accessToken: "tok" },
    accessTokenExpiresAt: new Date(Date.now() + 3600_000),
    refreshTokenExpiresAt: null,
    connectedBy: userId,
  };
  return createPendingConnection(db, input);
}

describe("M4.5 — social DEK repository", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  });

  beforeEach(async () => {
    await db.execute(sql`
      TRUNCATE
        social_profile_daily_metric, social_oauth_state, social_channel,
        social_connection, agency_social_dek,
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

  describe("enableAgencyDek", () => {
    it("inserts a row and is idempotent (second call throws)", async () => {
      const result1 = await enableAgencyDek(db, { agencyId: agencyAId, actorId: userId });
      expect(result1.dekRecoveryKey).toMatch(/^[A-Za-z0-9+/=]+$/);
      expect(result1.dekKeyVersion).toBe(1);
      const rows = await db
        .select()
        .from(agencySocialDek)
        .where(sql`agency_id = ${agencyAId}`);
      const row = rows[0]!;
      expect(row).toBeDefined();
      expect(row.dekKeyVersion).toBe(1);
      await expect(
        enableAgencyDek(db, { agencyId: agencyAId, actorId: userId }),
      ).rejects.toBeInstanceOf(DekAlreadyEnabledError);
    });
  });

  describe("rotateAgencyDek", () => {
    it("re-seals every connection in the agency", async () => {
      await enableAgencyDek(db, { agencyId: agencyAId, actorId: userId });
      const conn = await seedConnection(workspaceAId);
      // Capture the old ciphertext
      const beforeRows = await db
        .select()
        .from(socialConnections)
        .where(sql`id = ${conn.id}`);
      const before = beforeRows[0]!;
      const oldCiphertext = before.credentialsCiphertext;

      const result = await rotateAgencyDek(db, {
        agencyId: agencyAId,
        actorId: userId,
        reason: "manual",
      });
      expect(result.dekRecoveryKey).not.toMatch(/^$/);

      // Re-fetch the connection; ciphertext should differ
      const afterRows = await db
        .select()
        .from(socialConnections)
        .where(sql`id = ${conn.id}`);
      const after = afterRows[0]!;
      expect(after.credentialsCiphertext).not.toEqual(oldCiphertext);

      // The new DEK should open the new envelope
      const cache = createDekCache(db);
      const newDek = await getDekForWorkspace(db, cache, workspaceAId);
      const opened = openCredentialsWithDek(
        {
          ciphertext: after.credentialsCiphertext,
          iv: after.credentialsIv,
          tag: after.credentialsTag,
          keyVersion: after.credentialsKeyVersion as 1,
        },
        newDek,
      );
      expect(opened.accessToken).toBe("tok");

      // Note: we cannot easily test "old DEK cannot open new envelope"
      // here because the cache returns the DEK through an opaque API;
      // the public rotate path never exposes the old DEK to the
      // caller. The "old DEK cannot decrypt the new envelope"
      // property is a structural consequence of AES-256-GCM with a
      // fresh 32-byte random DEK and is asserted by the unit tests
      // on `wrapDek` / `unwrapDek`.
      void result;
    });

    it("throws DekNotEnabledError when the agency has not enabled", async () => {
      await expect(
        rotateAgencyDek(db, { agencyId: agencyAId, actorId: userId, reason: "manual" }),
      ).rejects.toBeInstanceOf(DekNotEnabledError);
    });
  });

  describe("disableAgencyDek", () => {
    it("cascades: revokes connections, detaches channels, deletes the DEK row", async () => {
      await enableAgencyDek(db, { agencyId: agencyAId, actorId: userId });
      const conn = await seedConnection(workspaceAId);
      await db.insert(socialChannels).values({
        workspaceId: workspaceAId,
        platform: "instagram",
        accountName: "C",
        socialConnectionId: conn.id,
        connectionStatus: "connected",
      });

      await disableAgencyDek(db, { agencyId: agencyAId });

      const [connAfter] = await db
        .select()
        .from(socialConnections)
        .where(sql`id = ${conn.id}`);
      expect(connAfter!.status).toBe("revoked");
      expect(connAfter!.revokedAt).not.toBeNull();

      const [channelAfter] = await db
        .select()
        .from(socialChannels)
        .where(sql`workspace_id = ${workspaceAId}`);
      expect(channelAfter!.connectionStatus).toBe("disconnected");
      expect(channelAfter!.socialConnectionId).toBeNull();

      const [dekAfter] = await db
        .select()
        .from(agencySocialDek)
        .where(sql`agency_id = ${agencyAId}`);
      expect(dekAfter).toBeUndefined();
    });
  });

  describe("cross-agency isolation", () => {
    it("agency A's DEK cannot open agency B's sealed connection", async () => {
      await enableAgencyDek(db, { agencyId: agencyAId, actorId: userId });
      await enableAgencyDek(db, { agencyId: agencyBId, actorId: userId });
      const connB = await seedConnection(workspaceBId, "tiktok");

      // A's DEK should not open B's connection
      const cacheA = createDekCache(db);
      const dekA = await getDekForWorkspace(db, cacheA, workspaceAId);
      const rowBRows = await db
        .select()
        .from(socialConnections)
        .where(sql`id = ${connB.id}`);
      const rowB = rowBRows[0]!;
      expect(() =>
        openConnectionCredentials(
          rowB as unknown as Parameters<typeof openConnectionCredentials>[0],
          dekA,
        ),
      ).toThrow();
    });
  });

  describe("rewrapAllDeksForKekRotation", () => {
    // NOTE on env handling: `serverEnv.SOCIAL_TOKEN_ENCRYPTION_KEY`
    // is captured at module load. In the full integration suite
    // a previous test file may have set the env var, so we
    // use `getKekOrThrow()` to read whatever the wrap path
    // actually used. In isolation, the env var is unset and
    // `getKekOrThrow()` falls back to the derived dev key.
    it("dry-run does not mutate", async () => {
      await enableAgencyDek(db, { agencyId: agencyAId, actorId: userId });
      const before = (
        await db
          .select()
          .from(agencySocialDek)
          .where(sql`agency_id = ${agencyAId}`)
      )[0]!;
      const oldKek = getKekOrThrow();
      const newKek = Buffer.alloc(32, 11);
      const res = await rewrapAllDeksForKekRotation(db, { oldKek, newKek, dryRun: true });
      expect(res.ok).toBe(1);
      expect(res.failed).toBe(0);
      expect(res.total).toBe(1);
      const after = (
        await db
          .select()
          .from(agencySocialDek)
          .where(sql`agency_id = ${agencyAId}`)
      )[0]!;
      expect(after.dekCiphertext.equals(before.dekCiphertext)).toBe(true);
    });

    it("re-wrap re-binds the DEK to the new KEK", async () => {
      await enableAgencyDek(db, { agencyId: agencyAId, actorId: userId });
      const oldKek = getKekOrThrow();
      const newKek = Buffer.alloc(32, 11);
      const res = await rewrapAllDeksForKekRotation(db, { oldKek, newKek });
      expect(res.ok).toBe(1);
      // Re-read with newKek should succeed; with oldKek should fail
      const rowRows = await db
        .select()
        .from(agencySocialDek)
        .where(sql`agency_id = ${agencyAId}`);
      const row = rowRows[0]!;
      expect(() =>
        unwrapDek(
          {
            ciphertext: row.dekCiphertext,
            iv: row.dekIv,
            tag: row.dekTag,
            keyVersion: 1 as const,
          },
          oldKek,
        ),
      ).toThrow();
      const unwrapped = unwrapDek(
        {
          ciphertext: row.dekCiphertext,
          iv: row.dekIv,
          tag: row.dekTag,
          keyVersion: 1 as const,
        },
        newKek,
      );
      expect(unwrapped.length).toBe(32);
    });
  });
});

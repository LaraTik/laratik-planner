import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { expectPgConstraint } from "./_db-error";
import {
  agencies,
  users,
  workspaces,
  socialChannels,
  socialConnections,
  socialOauthStates,
  socialProfileDailyMetrics,
} from "@/lib/db/schema";

/**
 * M4 — social profile analytics integration contract.
 *
 * Asserts the M4 schema invariants against a real Postgres:
 *
 *   - three new tables exist: social_connection, social_oauth_state,
 *     social_profile_daily_metric;
 *   - the unique (social_channel_id, metric_date) index is present;
 *   - the additive columns on social_channel are nullable;
 *   - the CHECK constraints on social_connection.provider and
 *     social_connection.status reject bad enum values;
 *   - the CHECK constraint on social_channel.connection_status
 *     rejects bad values;
 *   - the (workspace_id, provider, provider_subject_id) unique
 *     index allows re-insertion after a row is revoked.
 *
 * Run with: TEST_DATABASE_URL=postgresql://... pnpm test:integration
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

async function tableExists(name: string): Promise<boolean> {
  const result = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${name}
    ) AS exists
  `);
  return result.rows[0]?.exists === true;
}

async function indexExists(name: string): Promise<boolean> {
  const result = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = ${name}
    ) AS exists
  `);
  return result.rows[0]?.exists === true;
}

async function checkConstraintExists(name: string): Promise<boolean> {
  const result = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND constraint_type = 'CHECK'
        AND constraint_name = ${name}
    ) AS exists
  `);
  return result.rows[0]?.exists === true;
}

async function columnIsNullable(table: string, column: string): Promise<boolean> {
  const result = await db.execute<{ is_nullable: string }>(sql`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
  `);
  return result.rows[0]?.is_nullable === "YES";
}

describe("M4 — social profile analytics schema", () => {
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
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("table presence", () => {
    it("creates social_connection", async () => {
      expect(await tableExists("social_connection")).toBe(true);
    });
    it("creates social_oauth_state", async () => {
      expect(await tableExists("social_oauth_state")).toBe(true);
    });
    it("creates social_profile_daily_metric", async () => {
      expect(await tableExists("social_profile_daily_metric")).toBe(true);
    });
  });

  describe("additive social_channel columns are nullable", () => {
    it("social_connection_id is nullable", async () => {
      expect(await columnIsNullable("social_channel", "social_connection_id")).toBe(true);
    });
    it("external_account_id is nullable", async () => {
      expect(await columnIsNullable("social_channel", "external_account_id")).toBe(true);
    });
  });

  describe("check constraints", () => {
    it("social_connection_provider_valid exists", async () => {
      expect(await checkConstraintExists("social_connection_provider_valid")).toBe(true);
    });
    it("social_connection_status_valid exists", async () => {
      expect(await checkConstraintExists("social_connection_status_valid")).toBe(true);
    });
    it("social_channel_connection_status_valid exists", async () => {
      expect(await checkConstraintExists("social_channel_connection_status_valid")).toBe(true);
    });
  });

  describe("unique indexes", () => {
    it("social_profile_metric_channel_date_unique exists", async () => {
      expect(await indexExists("social_profile_metric_channel_date_unique")).toBe(true);
    });
    it("social_connection_active_subject_unique exists", async () => {
      expect(await indexExists("social_connection_active_subject_unique")).toBe(true);
    });
    it("social_channel_external_account_unique exists", async () => {
      expect(await indexExists("social_channel_external_account_unique")).toBe(true);
    });
  });

  describe("behavioural invariants", () => {
    let agencyId: string;
    let workspaceId: string;
    let userId: string;

    beforeEach(async () => {
      const [agency] = await db.insert(agencies).values({ name: "Acme", slug: "acme" }).returning();
      const [user] = await db
        .insert(users)
        .values({ email: "a@x.io", displayName: "A" })
        .returning();
      const [ws] = await db
        .insert(workspaces)
        .values({
          agencyId: agency!.id,
          slug: "main",
          name: "Main",
          createdBy: user!.id,
        })
        .returning();
      agencyId = agency!.id;
      workspaceId = ws!.id;
      userId = user!.id;
    });

    it("rejects an unknown social_connection.provider", async () => {
      await expectPgConstraint(
        db.insert(socialConnections).values({
          workspaceId,
          provider: "myspace",
          providerSubjectId: "x",
          credentialsCiphertext: "ct",
          credentialsIv: "iv",
          credentialsTag: "tag",
          connectedBy: userId,
        }),
        "social_connection_provider_valid",
      );
    });

    it("rejects an unknown social_connection.status", async () => {
      await expectPgConstraint(
        db.insert(socialConnections).values({
          workspaceId,
          provider: "meta",
          providerSubjectId: "x",
          status: "yolo",
          credentialsCiphertext: "ct",
          credentialsIv: "iv",
          credentialsTag: "tag",
          connectedBy: userId,
        }),
        "social_connection_status_valid",
      );
    });

    it("rejects an unknown social_channel.connection_status", async () => {
      await expectPgConstraint(
        db
          .insert(socialChannels)
          .values({
            workspaceId,
            platform: "instagram",
            accountName: "Test",
            connectionStatus: "yolo",
          }),
        "social_channel_connection_status_valid",
      );
    });

    it("rejects a duplicate active social_connection (workspace + provider + subject)", async () => {
      await db.insert(socialConnections).values({
        workspaceId,
        provider: "meta",
        providerSubjectId: "psid-1",
        credentialsCiphertext: "ct",
        credentialsIv: "iv",
        credentialsTag: "tag",
        connectedBy: userId,
      });
      await expectPgConstraint(
        db.insert(socialConnections).values({
          workspaceId,
          provider: "meta",
          providerSubjectId: "psid-1",
          credentialsCiphertext: "ct2",
          credentialsIv: "iv2",
          credentialsTag: "tag2",
          connectedBy: userId,
        }),
        "social_connection_active_subject_unique",
      );
    });

    it("allows re-inserting a revoked social_connection for the same subject", async () => {
      await db.insert(socialConnections).values({
        workspaceId,
        provider: "meta",
        providerSubjectId: "psid-1",
        credentialsCiphertext: "ct",
        credentialsIv: "iv",
        credentialsTag: "tag",
        connectedBy: userId,
        revokedAt: new Date(),
      });
      // Should not throw — the unique index is partial WHERE revoked_at IS NULL.
      await db.insert(socialConnections).values({
        workspaceId,
        provider: "meta",
        providerSubjectId: "psid-1",
        credentialsCiphertext: "ct2",
        credentialsIv: "iv2",
        credentialsTag: "tag2",
        connectedBy: userId,
      });
    });

    it("rejects a duplicate (social_channel_id, metric_date) row", async () => {
      const [channel] = await db
        .insert(socialChannels)
        .values({
          workspaceId,
          platform: "instagram",
          accountName: "Test",
        })
        .returning();
      const date = "2026-08-20";
      await db.insert(socialProfileDailyMetrics).values({
        socialChannelId: channel!.id,
        metricDate: date,
        observedAt: new Date(date),
        providerApiVersion: "v25.0",
        responseHash: "h1",
      });
      await expectPgConstraint(
        db.insert(socialProfileDailyMetrics).values({
          socialChannelId: channel!.id,
          metricDate: date,
          observedAt: new Date(date),
          providerApiVersion: "v25.0",
          responseHash: "h2",
        }),
        "social_profile_metric_channel_date_unique",
      );
    });

    it("rejects negative follower_count", async () => {
      const [channel] = await db
        .insert(socialChannels)
        .values({
          workspaceId,
          platform: "instagram",
          accountName: "Test",
        })
        .returning();
      await expectPgConstraint(
        db.insert(socialProfileDailyMetrics).values({
          socialChannelId: channel!.id,
          metricDate: "2026-08-20",
          observedAt: new Date("2026-08-20"),
          followerCount: -1,
          providerApiVersion: "v25.0",
          responseHash: "h",
        }),
        "social_profile_metric_counts_non_negative",
      );
    });
  });

  describe("OAuth state constraints", () => {
    it("rejects a return_path outside the channels route", async () => {
      const [agency] = await db.insert(agencies).values({ name: "Acme", slug: "acme" }).returning();
      const [user] = await db
        .insert(users)
        .values({ email: "a@x.io", displayName: "A" })
        .returning();
      const [ws] = await db
        .insert(workspaces)
        .values({
          agencyId: agency!.id,
          slug: "main",
          name: "Main",
          createdBy: user!.id,
        })
        .returning();
      await expectPgConstraint(
        db.insert(socialOauthStates).values({
          stateDigest: "abc",
          provider: "meta",
          workspaceId: ws!.id,
          actorId: user!.id,
          returnPath: "/app/w/main/evil",
          expiresAt: new Date(Date.now() + 600_000),
        }),
        "social_oauth_state_return_path_safe",
      );
    });
  });
});

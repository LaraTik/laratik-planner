import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./_helpers";
import { agencies, users } from "./identity";

/**
 * M4.6 — per-agency social provider config (hard cutover from env).
 *
 * Before M4.6 the platform read `META_APP_ID` / `META_APP_SECRET` /
 * `META_LOGIN_CONFIG_ID` / `SOCIAL_TOKEN_ENCRYPTION_KEY` from the
 * environment, which meant every agency shared the same Meta app
 * and the same encryption key. That was a multi-tenant bug:
 *
 *   - one platform-secret leak = every agency compromised
 *   - shared rate limits across tenants
 *   - tenants cannot bring their own Meta app (regulatory /
 *     brand / data-residency requirements)
 *   - one env typo takes down social for every agency at once
 *
 * This table moves the config into the database, scoped per agency
 * per provider. The app secret is sealed with the **same per-agency
 * DEK** the social-connection credentials use (M4.5), but with a
 * distinct AAD (`laratik-planner:social-app-config:v1`) so a
 * rotation of one envelope does not drag the other along.
 *
 * The `provider` column is the same vocabulary the adapters use
 * (`'meta' | 'tiktok'`), checked at the DB level so a typo at the
 * call site fails fast. The unique index on `(agency_id, provider)`
 * means the "set" path is an upsert and the "remove" path is a
 * delete — no soft-delete columns to keep in sync.
 *
 * `enabled` lets an agency disable a provider without losing the
 * config (operator can re-enable without re-pasting the secret).
 *
 * Rollback: `DROP TABLE agency_social_provider_config`. The
 * platform falls back to env reads only in pre-M4.6 code; this
 * hard cutover removes the env reads in the same milestone, so
 * rolling back the migration without also reverting the code
 * leaves the platform unable to talk to any provider.
 */

export const agencySocialProviderConfig = pgTable(
  "agency_social_provider_config",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    // Public client id (safe to surface in the UI for verification).
    appId: text("app_id").notNull(),
    // Sealed with the agency's DEK, AAD `laratik-planner:social-app-config:v1`.
    appSecretCiphertext: text("app_secret_ciphertext").notNull(),
    appSecretIv: text("app_secret_iv").notNull(),
    appSecretTag: text("app_secret_tag").notNull(),
    appSecretKeyVersion: smallint("app_secret_key_version").notNull().default(1),
    // Meta-only. TikTok has no equivalent embedded-signup concept;
    // the column is nullable and ignored by the TikTok adapter.
    loginConfigId: text("login_config_id"),
    // Meta-only. Pinned per agency so a tenant's app does not
    // silently get bumped to a new Graph version on platform
    // upgrades. Nullable → adapter falls back to its compile-time
    // default.
    graphApiVersion: text("graph_api_version"),
    enabled: boolean("enabled").notNull().default(true),
    configuredBy: uuid("configured_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true, mode: "date" }),
    lastTestedOk: boolean("last_tested_ok"),
    lastTestErrorCode: text("last_tested_error_code"),
    lastTestErrorAt: timestamp("last_tested_error_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [
    // The (agency, provider) pair is the natural key. The unique
    // index is the storage; the application treats it as a 1:1
    // upsert target via `ON CONFLICT (agency_id, provider)`.
    uniqueIndex("agency_social_provider_config_agency_provider_uniq").on(t.agencyId, t.provider),
    check("agency_social_provider_config_provider_valid", sql`${t.provider} IN ('meta', 'tiktok')`),
    check(
      "agency_social_provider_config_key_version_range",
      sql`${t.appSecretKeyVersion} BETWEEN 1 AND 32767`,
    ),
    index("agency_social_provider_config_agency_idx").on(t.agencyId),
  ],
);

export type AgencySocialProviderConfig = typeof agencySocialProviderConfig.$inferSelect;
export type NewAgencySocialProviderConfig = typeof agencySocialProviderConfig.$inferInsert;

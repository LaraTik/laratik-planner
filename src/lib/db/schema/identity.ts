import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { idColumn, jsonb, timestamps } from "./_helpers";
import { agencyMemberStatusEnum } from "./enums";

/**
 * STUDIOFLOW_MASTER_PROMPT.md §8 — Identity & tenancy.
 * Invariant: production contains exactly one active agency row. The
 * singleton_key unique index + check enforces that at the DB level; the
 * `bootstrap_locks` table records the one-time first-admin write.
 */

// ─── users ─────────────────────────────────────────────────────────────────
export const users = pgTable(
  "user",
  {
    id: idColumn(),
    email: text("email").notNull(),
    emailVerified: timestamp("email_verified", { withTimezone: true, mode: "date" }),
    name: text("name"),
    image: text("image"),
    // Profile extensions (master prompt §8)
    displayName: text("display_name").notNull(),
    avatarPath: text("avatar_path"),
    locale: text("locale").notNull().default("en"),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true, mode: "date" }),
    // Authorization
    role: text("role").notNull().default("user"), // app-level role
    // For self-hosted magic-link auth (NextAuth Email provider)
    passwordHash: text("password_hash"), // null for OAuth-only users
    // Timestamps
    ...timestamps,
  },
  (t) => [
    uniqueIndex("user_email_lower_unique").on(sql`lower(${t.email})`),
    check("user_email_format", sql`${t.email} ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'`),
  ],
);

// ─── agencies ──────────────────────────────────────────────────────────────
export const agencies = pgTable(
  "agency",
  {
    id: idColumn(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    // Master prompt: "production contains exactly one active agency row.
    // Do not hard-code its UUID." We enforce this with a unique index
    // on a constant true + a check that singleton_key is true.
    singletonKey: boolean("singleton_key").notNull().default(true),
    bootstrapCompletedAt: timestamp("bootstrap_completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    settings: jsonb("settings"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("agency_slug_unique").on(sql`lower(${t.slug})`),
    uniqueIndex("agency_singleton_unique").on(t.singletonKey),
    check("agency_singleton_true", sql`${t.singletonKey} = true`),
  ],
);

// ─── agency_memberships ────────────────────────────────────────────────────
export const agencyMemberships = pgTable(
  "agency_membership",
  {
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: agencyMemberStatusEnum("status").notNull(),
    isAgencyAdmin: boolean("is_agency_admin").notNull().default(false),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("agency_membership_pk").on(t.agencyId, t.userId),
    index("agency_membership_user_idx").on(t.userId),
  ],
);

// ─── bootstrap_locks ───────────────────────────────────────────────────────
// "Bootstrap must run in one transaction using an advisory lock. It succeeds
// only when no bootstrap lock and no active administrator exist. Repeated
// requests return a stable already-configured result without creating
// another administrator."
export const bootstrapLocks = pgTable("bootstrap_lock", {
  agencyId: uuid("agency_id")
    .primaryKey()
    .references(() => agencies.id, { onDelete: "cascade" }),
  completedBy: uuid("completed_by").references(() => users.id, { onDelete: "set null" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" })
    .notNull()
    .default(sql`now()`),
});

// ─── accounts / sessions / verificationTokens (NextAuth Drizzle adapter) ───
// Re-exported here for completeness; the actual shape comes from
// @auth/drizzle-adapter's default Postgres schema, but we customize the
// names + add agency_id for cross-tenant queries.

export const accounts = pgTable(
  "account",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [
    unique("account_provider_pk").on(t.provider, t.providerAccountId),
    index("account_user_idx").on(t.userId),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_token",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [unique("verification_token_pk").on(t.identifier, t.token)],
);

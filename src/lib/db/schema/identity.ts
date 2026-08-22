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
 *
 * Multi-agency (M1.7): the `agency` table no longer enforces a
 * singleton invariant. Multiple agencies can coexist, each with their
 * own workspaces, members, and invitations. The unique index on
 * `lower(slug)` still keeps slugs unique within a deployment; a
 * deployment is partitioned by agency row, not by a global singleton.
 * The `bootstrap_locks` table records the first-admin write per
 * agency (and is unused post-bootstrap; legacy rows from the
 * single-agency era are kept for audit).
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
    // `display_name` is NOT NULL but the NextAuth Drizzle adapter does
    // not supply it on INSERT (it only knows the OAuth/email fields).
    // A before-insert trigger (see migration 0003) fills the column
    // from `name` (or the email local-part when `name` is null), so
    // sign-in never fails on this constraint. The trigger is the
    // canonical Postgres pattern for "default derived from other
    // columns" — SET DEFAULT can't reference columns.
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
    check(
      "user_email_format",
      sql`${t.email} ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'`,
    ),
  ],
);

// ─── agencies ──────────────────────────────────────────────────────────────
export const agencies = pgTable(
  "agency",
  {
    id: idColumn(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    // `singleton_key` was the single-agency-era invariant column
    // (NOT NULL DEFAULT true + unique index + check). All three
    // constraints were dropped in migration 0008 (M1.7). The column
    // itself is removed from this schema; the Postgres column is
    // intentionally kept as a nullable back-compat read shim for
    // any legacy query that still names it. New code must not
    // reference `singleton_key`; a follow-up migration will drop
    // the column once reads have been audited and removed.
    bootstrapCompletedAt: timestamp("bootstrap_completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    settings: jsonb("settings"),
    ...timestamps,
  },
  (t) => [uniqueIndex("agency_slug_unique").on(sql`lower(${t.slug})`)],
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

// ─── platform_administrator ────────────────────────────────────────────────
// Milestone 1.1 (M1.1) — platform-level authority that is **separate from**
// agency-level authority. A platform admin can manage agencies (create,
// suspend, change plans) without being a member of any specific agency.
// Platform routes (M2) gate on this table; they must NOT acquire tenant
// content access automatically.
//
// `user_id` is the primary key: at most one live grant per user.
// `revoked_at` is the soft-revocation timestamp — kept forever for audit
// trail of "who was ever a platform admin". The `isPlatformAdmin` helper
// filters `revoked_at IS NULL` so revoked admins are not live admins.
// No `agency_id` column: platform authority is global, not per-agency
// (see plan §1.1; the absence is intentional).
export const platformAdministrators = pgTable(
  "platform_administrator",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
    grantedAt: timestamp("granted_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    reason: text("reason"),
  },
  (t) => [index("platform_administrator_granted_at_idx").on(t.grantedAt)],
);

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

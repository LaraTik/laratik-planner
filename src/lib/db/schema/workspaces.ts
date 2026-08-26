import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { archivedAt, citext, idColumn, jsonb, timestamps } from "./_helpers";
import {
  agencyMemberStatusEnum,
  invitationStatusEnum,
  workspaceRoleEnum,
  workspaceStatusEnum,
} from "./enums";
import { agencies, users } from "./identity";

/**
 * STUDIOFLOW_MASTER_PROMPT.md §8 — Workspaces, memberships, invitations.
 *
 * Agency administrators get effective full access via authorization helpers
 * (see src/lib/auth/policy.ts) — they do NOT need duplicate role rows in
 * every workspace. The `workspace_membership` table is for non-admin users.
 */

// ─── workspaces ────────────────────────────────────────────────────────────
export const workspaces = pgTable(
  "workspace",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    status: workspaceStatusEnum("status").notNull().default("active"),
    logoPath: text("logo_path"),
    archivedAt: archivedAt(),
    archivedBy: uuid("archived_by").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    // Per master prompt: "unique agency_id plus slug"
    uniqueIndex("workspace_agency_slug_unique").on(t.agencyId, sql`lower(${t.slug})`),
    index("workspace_agency_idx").on(t.agencyId),
    check("workspace_slug_format", sql`${t.slug} ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'`),
  ],
);

// ─── workspace_settings ────────────────────────────────────────────────────
export const workspaceSettings = pgTable("workspace_settings", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  defaultDesignerId: uuid("default_designer_id").references(() => users.id, {
    onDelete: "set null",
  }),
  defaultContentReviewerId: uuid("default_content_reviewer_id").references(() => users.id, {
    onDelete: "set null",
  }),
  defaultInternalCreativeReviewerId: uuid("default_internal_creative_reviewer_id").references(
    () => users.id,
    { onDelete: "set null" },
  ),
  defaultClientReviewerId: uuid("default_client_reviewer_id").references(() => users.id, {
    onDelete: "set null",
  }),
  approvalMode: text("approval_mode").notNull().default("simple"), // 'simple' | 'internal_then_client'
  contentApprovalLeadDays: smallint("content_approval_lead_days").notNull().default(10),
  designCompleteLeadDays: smallint("design_complete_lead_days").notNull().default(5),
  creativeApprovalLeadDays: smallint("creative_approval_lead_days").notNull().default(2),
  readyToPublishLeadDays: smallint("ready_to_publish_lead_days").notNull().default(1),
  monthlyTarget: integer("monthly_target"),
  channelTargets: jsonb("channel_targets"),
  formatTargets: jsonb("format_targets"),
  ...timestamps,
});

// ─── workspace_memberships ────────────────────────────────────────────────
//
// `updated_at` is REQUIRED on this table because the
// `touch_updated_at` trigger installed by migration 0004 is wired to
// `workspace_membership` (along with the other high-traffic membership
// tables). The trigger fires on every UPDATE and assigns
// `NEW.updated_at = now()` — without the column, every membership
// mutation raised `record "new" has no field "updated_at"` and aborted
// the surrounding transaction. That bug was the actual cause of the
// 2026-08-26 "user cannot be assigned to a workspace" failure (Sentry
// 347888499 et al.) — the previous test-only guard (62e643e) only
// papered over the symptom.
export const workspaceMemberships = pgTable(
  "workspace_membership",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: agencyMemberStatusEnum("status").notNull().default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    // Added by migration 0021 to satisfy the `touch_updated_at` trigger
    // installed in 0004. The trigger is the single source of truth for
    // this column — application code does not need to set it.
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    uniqueIndex("workspace_membership_pk").on(t.workspaceId, t.userId),
    index("workspace_membership_user_idx").on(t.userId),
  ],
);

// ─── workspace_membership_roles ───────────────────────────────────────────
// Multi-role: a user can hold several roles in a workspace. Primary key
// is (membership_id, role) so duplicates are impossible.
export const workspaceMembershipRoles = pgTable(
  "workspace_membership_role",
  {
    workspaceMembershipId: uuid("workspace_membership_id")
      .notNull()
      .references(() => workspaceMemberships.id, { onDelete: "cascade" }),
    role: workspaceRoleEnum("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceMembershipId, t.role] })],
);

// ─── invitations ───────────────────────────────────────────────────────────
// "Never store a raw invitation token. Default expiry is seven days.
// Resend invalidates the previous token and updates expiry. Accepting an
// invite is idempotent. Only an active Agency Admin may grant Agency Admin."
export const invitations = pgTable(
  "invitation",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    email: citext("email").notNull(),
    inviteeName: text("invitee_name"),
    tokenHash: text("token_hash").notNull(),
    status: invitationStatusEnum("status").notNull().default("pending"),
    grantsAgencyAdmin: boolean("grants_agency_admin").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("invitation_token_hash_unique").on(t.tokenHash),
    index("invitation_agency_email_idx").on(t.agencyId, t.email),
    // One pending invitation per email per agency at a time
    uniqueIndex("invitation_pending_unique")
      .on(t.agencyId, t.email)
      .where(sql`status = 'pending'`),
  ],
);

export const invitationWorkspaceRoles = pgTable(
  "invitation_workspace_role",
  {
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    role: workspaceRoleEnum("role").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.invitationId, t.workspaceId, t.role] }),
    unique("invitation_ws_role_unique").on(t.invitationId, t.workspaceId, t.role),
  ],
);

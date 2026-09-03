import { pgEnum } from "drizzle-orm/pg-core";

/**
 * 15 enums from STUDIOFLOW_MASTER_PROMPT.md §8. All enums live here so
 * they're easy to audit; tables reference these by name.
 *
 * Naming convention: the underlying Postgres enum is snake_case
 * (e.g. `agency_member_status`), the exported TypeScript identifier is
 * camelCase (e.g. `agencyMemberStatusEnum`).
 */

// ─── Identity & tenancy ─────────────────────────────────────────────────────
export const agencyMemberStatusEnum = pgEnum("agency_member_status", ["active", "deactivated"]);

export const workspaceStatusEnum = pgEnum("workspace_status", ["active", "archived"]);

// ─── Plans & entitlements (M2) ───────────────────────────────────────────────
/**
 * Per master prompt §4 / M2.1 — grace policy for agencies that exceed a
 * plan's hard-stop percentage. The two-value enum keeps the service
 * contract simple: `block` (enforce immediately) or `allow_grace` (let
 * the agency keep going but flag them on the platform console).
 *
 * `null` is permitted in the `agency_entitlement.grace_policy` column
 * to mean "inherit from the plan template" (or, for the `Custom` plan,
 * "must be overridden by the agency admin").
 */
export const agencyEntitlementGracePolicyEnum = pgEnum("agency_entitlement_grace_policy", [
  "block",
  "allow_grace",
]);

/**
 * M2.1 — threshold event severity emitted by the usage-tracking service
 * (M2.3). The three levels line up with the platform-console status
 * pill (healthy / warning / urgent / over_limit) and the threshold
 * boundaries in master prompt §4: 80% = warning, 90% = urgent,
 * 100%+ = over_limit. Uniqueness on (agency_id, resource, level) is
 * the dedupe mechanism — see schema/plans.ts.
 */
export const agencyUsageThresholdLevelEnum = pgEnum("agency_usage_threshold_level", [
  "warning",
  "urgent",
  "over_limit",
]);

export const workspaceRoleEnum = pgEnum("workspace_role", [
  "workspace_manager",
  "content_planner",
  "designer",
  "internal_reviewer",
  "client_reviewer",
  "publisher",
  "viewer",
]);

export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "expired",
  "revoked",
]);

// ─── Channel & content shape ───────────────────────────────────────────────
export const socialPlatformEnum = pgEnum("social_platform", [
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "youtube",
  "x",
  "threads",
  "pinterest",
  "snapchat",
  "other",
]);

export const contentFormatEnum = pgEnum("content_format", [
  "static_post",
  "carousel",
  "story",
  "short_form_video",
  "long_form_video",
  "live_content",
  "article",
  "other",
]);

export const contentStatusEnum = pgEnum("content_status", [
  "draft",
  "content_review",
  "approved_for_design",
  "in_design",
  "creative_review",
  "ready_to_publish",
  "partially_published",
  "published",
  "changes_requested",
  "blocked",
  "cancelled",
]);

export const reviewGateEnum = pgEnum("review_gate", [
  "content",
  "creative_internal",
  "creative_client",
]);

export const reviewStatusEnum = pgEnum("review_status", [
  "pending",
  "approved",
  "changes_requested",
  "cancelled",
]);

// ─── Discussion, delivery, publishing ───────────────────────────────────────
export const commentVisibilityEnum = pgEnum("comment_visibility", ["internal", "client"]);

export const commentLabelEnum = pgEnum("comment_label", [
  "question",
  "feedback",
  "decision",
  "general",
]);

export const deliveryProviderEnum = pgEnum("delivery_provider", [
  "google_drive",
  "dropbox",
  "onedrive",
  "frame_io",
  "figma",
  "canva",
  "other",
]);

export const publicationStatusEnum = pgEnum("publication_status", [
  "pending",
  "published",
  "failed",
  "skipped",
]);

// ─── Notifications, activity, AI ────────────────────────────────────────────
export const notificationKindEnum = pgEnum("notification_kind", [
  "assignment",
  "review_request",
  "approval",
  "changes_requested",
  "mention",
  "reply",
  "unresolved_question",
  "deadline",
  "delivery",
  "ready_to_publish",
  "system",
]);

export const activityKindEnum = pgEnum("activity_kind", [
  "create",
  "update",
  "schedule_change",
  "assignment",
  "status_transition",
  "comment",
  "review",
  "approval_reset",
  "delivery",
  "publication",
  "archive",
  "restore",
  "invitation",
  "ai_assistance",
  "delete",
  "bulk_delete",
  // P1 (2026-09-03, /ui-ux-pro-max): non-material caption /
  // hashtag / firstComment patch. Lives in the activity log
  // for audit but does NOT trigger the material-edit reset
  // (no revision bump, no approval invalidation).
  "content_copy_patched",
]);

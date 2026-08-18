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
export const agencyMemberStatusEnum = pgEnum("agency_member_status", [
  "active",
  "deactivated",
]);

export const workspaceStatusEnum = pgEnum("workspace_status", ["active", "archived"]);

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
]);

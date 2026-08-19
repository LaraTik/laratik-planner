/**
 * Status + format helpers for content items (master prompt §10 workflow
 * states + §2.4 content formats).
 *
 * Single source of truth for:
 *  - human-readable label (Title Case, underscores → spaces)
 *  - badge colour variant
 *  - in-flight / done / blocked grouping
 *
 * Used by:
 *  - src/app/(app)/app/page.tsx (My Work)
 *  - src/app/(app)/app/w/[slug]/planning/page.tsx (Planning list)
 *  - src/app/(app)/app/w/[slug]/planning/[id]/page.tsx (Detail header)
 *  - src/app/(app)/app/w/[slug]/planning/[id]/workflow-bar.tsx
 *  - any future calendar / board / KPI view
 *
 * Per master prompt §3: status always uses text + colour (never colour
 * alone), so the icon-less badge is fine as long as the human label is
 * always rendered.
 */

import type { BadgeProps } from "@/components/ui/badge";

export type ContentStatus =
  | "draft"
  | "content_review"
  | "approved_for_design"
  | "in_design"
  | "creative_review"
  | "ready_to_publish"
  | "partially_published"
  | "published"
  | "changes_requested"
  | "blocked"
  | "cancelled";

export type ContentFormat =
  | "static_post"
  | "carousel"
  | "story"
  | "short_form_video"
  | "long_form_video"
  | "live_content"
  | "article"
  | "other";

const ALL_STATUSES: readonly ContentStatus[] = [
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
] as const;

const ALL_FORMATS: readonly ContentFormat[] = [
  "static_post",
  "carousel",
  "story",
  "short_form_video",
  "long_form_video",
  "live_content",
  "article",
  "other",
] as const;

/**
 * Title-case + underscore-to-space for any enum-shaped string. Safe on
 * unknown values (defensive against stale DB rows / pre-migration data).
 */
export function humanize(s: string): string {
  if (!s) return s;
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "ready_to_publish" → "Ready To Publish" (alias of humanize for status). */
export function humanStatus(s: string): string {
  return humanize(s);
}

/** "short_form_video" → "Short Form Video" (alias of humanize for format). */
export function humanFormat(s: string): string {
  return humanize(s);
}

/** Map a content status → shadcn Badge variant. */
export function statusBadgeVariant(s: string): NonNullable<BadgeProps["variant"]> {
  if (s === "published" || s === "ready_to_publish") return "success";
  if (s === "blocked" || s === "cancelled") return "danger";
  if (s === "changes_requested") return "warning";
  if (s === "in_design" || s === "creative_review" || s === "content_review") return "info";
  if (s === "partially_published" || s === "approved_for_design") return "primary";
  return "default";
}

/**
 * Statuses that are "in flight" (i.e. not yet done) — used by filters
 * and the planning list defaults.
 */
export const OPEN_STATUSES: readonly ContentStatus[] = [
  "draft",
  "content_review",
  "approved_for_design",
  "in_design",
  "creative_review",
  "ready_to_publish",
  "partially_published",
  "changes_requested",
] as const;

export const DONE_STATUSES: readonly ContentStatus[] = ["published"] as const;

export const BLOCKED_STATUSES: readonly ContentStatus[] = ["blocked", "cancelled"] as const;

export function isOpen(s: string): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(s);
}
export function isDone(s: string): boolean {
  return (DONE_STATUSES as readonly string[]).includes(s);
}
export function isBlocked(s: string): boolean {
  return (BLOCKED_STATUSES as readonly string[]).includes(s);
}

export { ALL_STATUSES, ALL_FORMATS };

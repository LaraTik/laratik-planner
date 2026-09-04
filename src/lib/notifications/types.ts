/**
 * Client-safe notification preference types. Keep this module free of
 * database, cache, email, and `server-only` imports so account forms can
 * share the preference vocabulary without pulling the server service into
 * the client bundle.
 */

export const NOTIFICATION_KIND_VALUES = [
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
] as const;

export type NotificationKind = (typeof NOTIFICATION_KIND_VALUES)[number];
export type NotificationKindForPrefs = NotificationKind;

export type NotificationKindPrefs = {
  inAppEnabled: boolean;
  emailEnabled: boolean;
};

export type NotificationPreferencesSnapshot = Record<
  NotificationKindForPrefs,
  NotificationKindPrefs
> & {
  dailyDigest: boolean;
};

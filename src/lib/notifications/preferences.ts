import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { notificationPreferences } from "@/lib/db/schema";
import {
  NOTIFICATION_KIND_VALUES,
  type NotificationKind,
  type NotificationKindForPrefs,
  type NotificationPreferencesSnapshot,
} from "@/lib/notifications/types";

export const NotificationKindSchema = z.enum(NOTIFICATION_KIND_VALUES);
export const NotificationKindSchemaValues = NOTIFICATION_KIND_VALUES;

async function readPreferenceRow(userId: string, kind: NotificationKind) {
  const [row] = await db
    .select({
      inAppEnabled: notificationPreferences.inAppEnabled,
      emailEnabled: notificationPreferences.emailEnabled,
      digestEnabled: notificationPreferences.digestEnabled,
    })
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.kind, kind)))
    .limit(1);
  return row;
}

/** Email is opt-in for each notification kind. */
export async function shouldEmailUserFor(userId: string, kind: NotificationKind): Promise<boolean> {
  const row = await readPreferenceRow(userId, kind);
  return row?.emailEnabled ?? false;
}

/** Daily digest is a user-level preference stored on the system row. */
export async function shouldDigestUserFor(userId: string): Promise<boolean> {
  const row = await readPreferenceRow(userId, "system");
  return row?.digestEnabled ?? false;
}

/** Bell is on by default; email and daily digest are opt-in. */
export function defaultNotificationPreferences(): NotificationPreferencesSnapshot {
  const out = {} as NotificationPreferencesSnapshot;
  for (const kind of NotificationKindSchemaValues) {
    out[kind] = { inAppEnabled: true, emailEnabled: false };
  }
  out.dailyDigest = false;
  return out;
}

/** Returns saved preferences, filling missing kinds from safe defaults. */
export async function getNotificationPreferencesForUser(
  userId: string,
): Promise<NotificationPreferencesSnapshot> {
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
  const snapshot = defaultNotificationPreferences();
  for (const row of rows) {
    if (NotificationKindSchemaValues.includes(row.kind as NotificationKindForPrefs)) {
      snapshot[row.kind as NotificationKindForPrefs] = {
        inAppEnabled: row.inAppEnabled,
        emailEnabled: row.emailEnabled,
      };
    }
    if (row.kind === "system") snapshot.dailyDigest = row.digestEnabled;
  }
  return snapshot;
}

export const SetNotificationPreferencesSchema = z.object({
  prefs: z.record(
    NotificationKindSchema,
    z.object({
      inAppEnabled: z.boolean(),
      emailEnabled: z.boolean(),
    }),
  ),
  dailyDigest: z.boolean(),
});
export type SetNotificationPreferencesInput = z.infer<typeof SetNotificationPreferencesSchema>;

/**
 * Saves the complete preference matrix as one unit. System notifications stay
 * enabled in-app and never opt into email through this user preference path.
 */
export async function setNotificationPreferencesForUser(
  userId: string,
  input: SetNotificationPreferencesInput,
): Promise<void> {
  const parsed = SetNotificationPreferencesSchema.parse(input);
  await db.transaction(async (tx) => {
    for (const [kindRaw, prefs] of Object.entries(parsed.prefs)) {
      const kind = kindRaw as NotificationKindForPrefs;
      const inAppEnabled = kind === "system" ? true : prefs.inAppEnabled;
      const emailEnabled = kind === "system" ? false : prefs.emailEnabled;
      await tx
        .insert(notificationPreferences)
        .values({
          userId,
          kind,
          inAppEnabled,
          emailEnabled,
          digestEnabled: kind === "system" ? parsed.dailyDigest : false,
        })
        .onConflictDoUpdate({
          target: [notificationPreferences.userId, notificationPreferences.kind],
          set: {
            inAppEnabled,
            emailEnabled,
            ...(kind === "system" ? { digestEnabled: parsed.dailyDigest } : {}),
          },
        });
    }
  });
}

export type UpdateNotificationPreferencesInput = SetNotificationPreferencesInput;

/** §14 contract alias for the canonical preference writer. */
export async function updateNotificationPreferences(
  userId: string,
  input: UpdateNotificationPreferencesInput,
): Promise<void> {
  return setNotificationPreferencesForUser(userId, input);
}

import { z } from "zod";

export const advertisingSignalFeedbackStateSchema = z.enum([
  "open",
  "reviewed",
  "dismissed",
  "snoozed",
]);

export const advertisingSignalEntityTypeSchema = z.enum([
  "campaign",
  "budget",
  "creative",
  "audience",
]);

export const advertisingSignalFeedbackMutationSchema = z
  .object({
    signalKey: z.string().trim().min(1).max(160),
    entityType: advertisingSignalEntityTypeSchema,
    entityId: z.string().trim().min(1).max(255),
    state: advertisingSignalFeedbackStateSchema,
    reason: z.string().trim().max(240).optional(),
    snoozedUntil: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.state === "dismissed" && !value.reason?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "reason_required" });
    }
    if (value.state === "snoozed" && !value.snoozedUntil) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["snoozedUntil"],
        message: "snooze_date_required",
      });
    }
  });

export type AdvertisingSignalFeedbackState = z.infer<typeof advertisingSignalFeedbackStateSchema>;
export type AdvertisingSignalEntityType = z.infer<typeof advertisingSignalEntityTypeSchema>;
export type AdvertisingSignalFeedbackMutation = z.infer<
  typeof advertisingSignalFeedbackMutationSchema
>;

export type AdvertisingSignalFeedbackView = {
  id: string;
  signalKey: string;
  entityType: AdvertisingSignalEntityType;
  entityId: string;
  state: AdvertisingSignalFeedbackState;
  reason: string | null;
  snoozedUntil: string | null;
  generatedAt: string;
  updatedAt: string;
};

export function advertisingSignalFeedbackKey(
  entityType: AdvertisingSignalEntityType,
  entityId: string,
  signalKey: string,
): string {
  return `${entityType}:${entityId}:${signalKey}`;
}

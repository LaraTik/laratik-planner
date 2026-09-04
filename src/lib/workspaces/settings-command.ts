import { z } from "zod";

const nullableUserId = z.string().uuid().nullable();

export const workspaceSettingsCommandSchema = z.object({
  workspaceId: z.string().uuid(),
  timezone: z
    .string()
    .min(1)
    .max(100)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    }, "Unknown timezone"),
  approvalMode: z.enum(["simple", "internal_then_client"]),
  monthlyTarget: z.number().int().min(1).max(10_000).nullable(),
  contentApprovalLeadDays: z.number().int().min(0).max(90),
  designCompleteLeadDays: z.number().int().min(0).max(90),
  creativeApprovalLeadDays: z.number().int().min(0).max(90),
  readyToPublishLeadDays: z.number().int().min(0).max(90),
  defaultDesignerId: nullableUserId,
  defaultContentReviewerId: nullableUserId,
  defaultInternalCreativeReviewerId: nullableUserId,
  defaultClientReviewerId: nullableUserId,
  metaPublishingEnabled: z.boolean().optional(),
});

type ParsedWorkspaceSettingsCommand = z.infer<typeof workspaceSettingsCommandSchema>;

// Keep the command backward-compatible for callers that predate the Meta
// readiness gate. The parser supplies the conservative false default.
export type WorkspaceSettingsCommand = Omit<
  ParsedWorkspaceSettingsCommand,
  "metaPublishingEnabled"
> & {
  metaPublishingEnabled?: boolean | undefined;
};

export function nullableIdFromForm(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export function nullableNumberFromForm(value: FormDataEntryValue | null): number | null {
  const normalized = String(value ?? "").trim();
  return normalized ? Number(normalized) : null;
}

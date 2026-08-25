import { z } from "zod";

export const ChannelCommandSchema = z.object({
  platform: z.enum([
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
  ]),
  accountName: z.string().trim().min(2).max(120),
  handle: z.string().trim().max(120).optional(),
  url: z
    .string()
    .trim()
    .url()
    .refine((value) => value.startsWith("https://"), "Use an HTTPS URL")
    .optional(),
  accountType: z.string().trim().max(80).optional(),
});

/**
 * FEAT-07 (GAP-FULL-REVIEW-2026-08-25) — §14 `archiveChannel` /
 * `restoreChannel` Zod inputs. The existing `createChannel` /
 * `updateChannel` actions are in `src/app/(app)/app/w/[slug]/channels/actions.ts`;
 * these Zod schemas give the service layer a typed surface for the
 * archive / restore commands and let future callers validate at the
 * boundary.
 */
export const ArchiveChannelCommandSchema = z.object({
  channelId: z.string().uuid(),
});

export const RestoreChannelCommandSchema = z.object({
  channelId: z.string().uuid(),
});

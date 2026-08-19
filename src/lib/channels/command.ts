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

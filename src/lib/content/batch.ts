import { z } from "zod";

export const BatchItemSchema = z.object({
  title: z.string().trim().min(2).max(200),
  format: z.enum([
    "static_post",
    "carousel",
    "story",
    "short_form_video",
    "long_form_video",
    "live_content",
    "article",
    "other",
  ]),
  brief: z.string().max(2000).optional().default(""),
  plannedPublishAt: z.coerce.date(),
});

export const BatchCreateSchema = z.object({
  workspaceId: z.string().uuid(),
  items: z.array(BatchItemSchema).min(1).max(50),
});

export type BatchCreateInput = z.infer<typeof BatchCreateSchema>;

export function parseBatchRows(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, format = "static_post", date = "", brief = ""] = line
        .split("|")
        .map((part) => part.trim());
      return { title, format, plannedPublishAt: date, brief };
    });
}

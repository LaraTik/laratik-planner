import { z } from "zod";

/**
 * Per-row extended fields (caption, hashtags, location).
 * Optional — the v1 batch format only requires title/format/date/brief.
 * Rows that omit these stay compatible with the v1 parser; rows that
 * include them are written into `formatPayload` on insert.
 *
 * Declared first so the `BatchItemSchema.extensions` field
 * below can reference it (Zod schemas are evaluated top-down
 * by name; the forward reference is fine in TS but the
 * runtime reference needs the symbol in scope).
 */
const BatchRowExtensionsSchema = z.object({
  caption: z.string().trim().max(2_200).optional(),
  hashtags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  location: z
    .object({
      name: z.string().trim().min(1).max(120),
      externalId: z.string().trim().max(120).optional(),
    })
    .optional(),
});

export type BatchRowExtensions = z.infer<typeof BatchRowExtensionsSchema>;

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
  /**
   * Per-row structured fields. The action layer populates
   * this from the v2 batch format (the trailing `| caption
   * | #tags | location` fields); the service writes them
   * into `formatPayload` on insert. Optional — rows without
   * extensions stay compatible with the v1 batch shape.
   */
  extensions: BatchRowExtensionsSchema.optional(),
});

export const BatchCreateSchema = z.object({
  workspaceId: z.string().uuid(),
  items: z.array(BatchItemSchema).min(1).max(50),
});

export type BatchCreateInput = z.infer<typeof BatchCreateSchema>;

/**
 * Parse a single TSV row. The format is:
 *
 *   title | format | YYYY-MM-DDTHH:mm:ssZ | brief [| caption [| hashtags [| location ]]]
 *
 * - The first 4 fields are mandatory; everything after is optional.
 * - The 5th field (caption) is taken as a single-line string; multi-line
 *   captions should be entered in the More details editor after creation.
 * - The 6th field (hashtags) is a `#`-or-space-separated list.
 * - The 7th field (location) is `name` or `name|externalId`.
 *
 * The parser is permissive on missing trailing fields and on the v1
 * 4-field shape — older paste rows still parse. Malformed values
 * (over-length caption, unknown format, etc.) surface as a Zod issue
 * in the row.
 */
export function parseBatchRow(line: string): {
  title: string;
  format: string;
  plannedPublishAt: string;
  brief: string;
  extensions: BatchRowExtensions;
} {
  // The location cell can contain an internal `|`
  // (name|externalId). To allow that, we split only the
  // first 6 cells, then put the remainder of the line
  // (everything after parts[5]) into the location cell.
  const parts = line.split("|").map((p) => p.trim());
  const [title = "", format = "static_post", date = "", brief = ""] = parts;
  const ext: BatchRowExtensions = {};
  if (parts[4]) ext.caption = parts[4];
  if (parts[5]) {
    ext.hashtags = parts[5]
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  if (parts.length > 6) {
    // Take everything from parts[6] onward, joined with `|`,
    // as the location cell. The first `|` inside that cell
    // separates name from externalId. This means a user can
    // write `Spring drop | static_post | ... | Brief | Caption
    // | #tag1 #tag2 | Dubai Mall | fb-123` (8 cells, last
    // two joined) OR `... | Dubai Mall|fb-123` (7 cells, last
    // one carries the internal `|`).
    const locationCell = parts.slice(6).join("|");
    const [name, externalId] = locationCell.split("|").map((s) => s.trim());
    if (name) ext.location = { name, ...(externalId ? { externalId } : {}) };
  }
  // Validate the extension bundle — the rest of the row goes
  // through BatchItemSchema on the way to the action.
  BatchRowExtensionsSchema.parse(ext);
  return { title, format, plannedPublishAt: date, brief, extensions: ext };
}

/**
 * Parse the full multi-line batch text. Each line becomes a
 * row; the function never throws — malformed lines are
 * returned with a `parseError` field so the UI can show the
 * planner which row(s) need attention.
 */
export function parseBatchRows(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      try {
        const parsed = parseBatchRow(line);
        return { lineNumber: idx + 1, ...parsed };
      } catch (err) {
        return {
          lineNumber: idx + 1,
          title: line,
          format: "static_post",
          plannedPublishAt: "",
          brief: "",
          extensions: {},
          parseError: (err as Error).message,
        };
      }
    });
}

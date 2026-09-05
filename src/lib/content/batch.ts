import { fromZonedTime } from "date-fns-tz";
import { z } from "zod";
import { normalizeBatchFormat } from "@/lib/content/format-catalog";

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

export type BatchIssueSeverity = "error" | "warning";
export type BatchIssueCode =
  | "title_required"
  | "title_too_short"
  | "title_too_long"
  | "format_required"
  | "format_invalid"
  | "date_required"
  | "date_invalid"
  | "brief_too_long"
  | "caption_too_long"
  | "hashtags_invalid"
  | "location_invalid"
  | "brief_empty"
  | "duplicate_date"
  | "channel_unknown";

export interface BatchRowIssue {
  code: BatchIssueCode;
  field: "title" | "format" | "plannedPublishAt" | "brief" | "extensions" | "channels";
  severity: BatchIssueSeverity;
  params?: Record<string, string | number>;
}

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
  /** Omitted means all active channels; [] means intentionally none. */
  channelIds: z
    .array(z.string().uuid())
    .superRefine((ids, ctx) => {
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate channel" });
      }
    })
    .optional(),
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

export const BatchClientRowSchema = z.object({
  title: z.string(),
  format: z.string(),
  plannedPublishAt: z.string(),
  brief: z.string(),
  channelIds: z.array(z.string().uuid()),
  extensions: BatchRowExtensionsSchema.optional(),
});

export interface ParsedBatchRow {
  lineNumber: number;
  title: string;
  format: string;
  plannedPublishAt: string;
  brief: string;
  extensions: BatchRowExtensions;
  channelNames: string[];
  issues: BatchRowIssue[];
}

export interface BatchRowDraft {
  id: string;
  title: string;
  format: string;
  plannedPublishAt: string;
  brief: string;
  channelIds: string[];
  extensions?: BatchRowExtensions;
  sourceLine?: number;
  sourceIssues?: BatchRowIssue[];
}

/** Convert a workspace-local input or explicit ISO timestamp to an instant. */
export function parseBatchDateTime(value: string, timeZone: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const localMatch = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(trimmed);
  if (localMatch) {
    const [, year, month, day, hour = "00", minute = "00", second = "00"] = localMatch;
    const wallClock = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    const candidate = fromZonedTime(wallClock, timeZone);
    if (Number.isNaN(candidate.getTime())) return null;

    // Reject dates that the JavaScript date parser silently normalises,
    // such as February 30th or 25:80 rather than saving a different day.
    const roundTrip = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(candidate);
    const parts = Object.fromEntries(roundTrip.map((part) => [part.type, part.value]));
    if (
      parts.year !== year ||
      parts.month !== month ||
      parts.day !== day ||
      parts.hour !== hour ||
      parts.minute !== minute ||
      parts.second !== second
    )
      return null;
    return candidate;
  }

  const explicit = new Date(trimmed);
  return Number.isNaN(explicit.getTime()) ? null : explicit;
}

export function formatBatchDateTimeForInput(value: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(value)
      .map((part) => [part.type, part.value]),
  );
  if (!parts.year || !parts.month || !parts.day || !parts.hour || !parts.minute) return "";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function validateBatchRow(input: {
  title: string;
  format: string;
  plannedPublishAt: string;
  brief: string;
  extensions?: BatchRowExtensions;
  channelNames?: string[];
  timeZone?: string;
}): BatchRowIssue[] {
  const issues: BatchRowIssue[] = [];
  const title = input.title.trim();
  const format = normalizeBatchFormat(input.format);
  const brief = input.brief.trim();
  const extensions = input.extensions ?? {};

  if (!title) issues.push({ code: "title_required", field: "title", severity: "error" });
  else if (title.length < 2)
    issues.push({ code: "title_too_short", field: "title", severity: "error", params: { min: 2 } });
  else if (title.length > 200)
    issues.push({
      code: "title_too_long",
      field: "title",
      severity: "error",
      params: { max: 200 },
    });

  if (!input.format.trim())
    issues.push({ code: "format_required", field: "format", severity: "error" });
  else if (!format) issues.push({ code: "format_invalid", field: "format", severity: "error" });

  if (!input.plannedPublishAt.trim())
    issues.push({ code: "date_required", field: "plannedPublishAt", severity: "error" });
  else if (input.timeZone && !parseBatchDateTime(input.plannedPublishAt, input.timeZone))
    issues.push({ code: "date_invalid", field: "plannedPublishAt", severity: "error" });

  if (brief.length > 2_000)
    issues.push({
      code: "brief_too_long",
      field: "brief",
      severity: "error",
      params: { max: 2_000 },
    });
  else if (!brief) issues.push({ code: "brief_empty", field: "brief", severity: "warning" });

  if (extensions.caption && extensions.caption.length > 2_200)
    issues.push({
      code: "caption_too_long",
      field: "extensions",
      severity: "error",
      params: { max: 2_200 },
    });
  if (
    extensions.hashtags &&
    (extensions.hashtags.length > 30 || extensions.hashtags.some((tag) => tag.length > 60))
  )
    issues.push({ code: "hashtags_invalid", field: "extensions", severity: "error" });
  if (extensions.location && (!extensions.location.name || extensions.location.name.length > 120))
    issues.push({ code: "location_invalid", field: "extensions", severity: "error" });

  void input.channelNames;
  return issues;
}

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
export function parseBatchRow(line: string, lineNumber = 1): ParsedBatchRow {
  // The location cell can contain an internal `|`
  // (name|externalId). To allow that, we split only the
  // first 6 cells, then put the remainder of the line
  // (everything after parts[5]) into the location cell.
  const parts = line.split("|").map((p) => p.trim());
  const [title = "", rawFormat = "", date = "", brief = ""] = parts;
  const format = normalizeBatchFormat(rawFormat) ?? rawFormat;
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
  const extensionsResult = BatchRowExtensionsSchema.safeParse(ext);
  const issues = validateBatchRow({
    title,
    format,
    plannedPublishAt: date,
    brief,
    extensions: ext,
    timeZone: "UTC",
  });
  if (!extensionsResult.success) {
    issues.push({ code: "hashtags_invalid", field: "extensions", severity: "error" });
  }
  return {
    lineNumber,
    title,
    format,
    plannedPublishAt: date,
    brief,
    extensions: ext,
    channelNames: [],
    issues,
  };
}

/**
 * Parse the full multi-line batch text. Each line becomes a
 * row; the function never throws — malformed lines are
 * returned with a `parseError` field so the UI can show the
 * planner which row(s) need attention.
 */
export function parseBatchRows(raw: string) {
  return raw.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return [];
    return [parseBatchRow(line, index + 1)];
  });
}

/** Parse a tab-separated clipboard paste. A header row is optional. */
export function parseSpreadsheetRows(raw: string): ParsedBatchRow[] {
  const lines = raw.split(/\r?\n/);
  const nonEmpty = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trim().length > 0);
  if (nonEmpty.length === 0) return [];

  const firstCells = nonEmpty[0]!.line.split("\t").map((cell) => cell.trim().toLowerCase());
  const hasHeader = firstCells.some((cell) =>
    ["title", "format", "date", "date & time", "short brief", "channels"].includes(cell),
  );
  const data = hasHeader ? nonEmpty.slice(1) : nonEmpty;
  const headerIndex = new Map(firstCells.map((cell, index) => [cell, index]));
  const at = (cells: string[], names: string[], fallback: number) => {
    const index =
      names.map((name) => headerIndex.get(name)).find((value) => value !== undefined) ?? fallback;
    return cells[index ?? fallback]?.trim() ?? "";
  };

  return data.map(({ line, index }) => {
    const cells = line.split("\t");
    const parsed = parseBatchRow(
      [
        at(cells, ["title"], 0),
        at(cells, ["format"], 1),
        at(cells, ["date & time", "date"], 2),
        at(cells, ["short brief", "brief"], 3),
      ].join(" | "),
      index + 1,
    );
    const channels = at(cells, ["channels"], 4);
    return {
      ...parsed,
      channelNames: channels
        ? channels
            .split(/[,;]+/)
            .map((value) => value.trim())
            .filter(Boolean)
        : [],
    };
  });
}

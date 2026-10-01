import { z } from "zod";
import {
  FormatPayloadByFormat,
  parseFormatPayload,
  type ContentFormat,
} from "@/lib/format-payload/schemas";

export const ResearchTeardownSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("provider_media"),
    provider: z.enum(["instagram", "facebook", "tiktok", "youtube"]),
    mediaId: z.string().trim().min(1).max(200),
    transcript: z.string().trim().min(1).max(20_000),
  }),
  z.object({
    kind: z.literal("owned_asset"),
    assetId: z.string().uuid(),
    transcript: z.string().trim().min(1).max(20_000).optional(),
  }),
  z.object({
    kind: z.literal("planner_notes"),
    notes: z.string().trim().min(1).max(20_000),
  }),
]);

const TeardownBeatSchema = z.object({
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  startSecond: z.number().finite().nonnegative().optional(),
  endSecond: z.number().finite().nonnegative().optional(),
});

const TeardownEvidenceSchema = z.object({
  field: z.enum(["hook", "promise", "format", "beats", "pacing", "callToAction"]),
  observation: z.string().trim().min(1).max(500),
  source: z.string().trim().min(1).max(500),
});

export const ResearchTeardownSchema = z.object({
  schemaVersion: z.literal(1),
  hook: z.string().trim().min(1).max(1_000),
  promise: z.string().trim().min(1).max(1_000),
  format: z.string().trim().min(1).max(120),
  beats: z.array(TeardownBeatSchema).max(30),
  pacing: z.string().trim().min(1).max(1_000),
  callToAction: z.string().trim().min(1).max(1_000),
  evidence: z.array(TeardownEvidenceSchema).max(40),
  uncertainty: z.array(z.string().trim().min(1).max(500)).max(20),
});

export type ResearchTeardownSource = z.infer<typeof ResearchTeardownSourceSchema>;
export type ResearchTeardown = z.infer<typeof ResearchTeardownSchema>;

export function parseResearchTeardown(
  raw: string,
): { ok: true; data: ResearchTeardown } | { ok: false; error: "invalid_json" | "invalid_shape" } {
  const normalized = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(normalized);
  } catch {
    return { ok: false, error: "invalid_json" };
  }
  const parsed = ResearchTeardownSchema.safeParse(value);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: "invalid_shape" };
}

export function hasAuthorizedTeardownSource(source: unknown): boolean {
  return ResearchTeardownSourceSchema.safeParse(source).success;
}

/**
 * Fill only blank, supported creative fields from a reviewed teardown.
 * Existing planner values always win; the caller still owns the explicit
 * save action and the resulting JSON is revalidated by the content service.
 */
export function applyResearchTeardownToPayload(input: {
  format: ContentFormat;
  current: unknown;
  teardown: ResearchTeardown;
}): { payload: Record<string, unknown>; fields: string[] } {
  const current = parseFormatPayload(input.format, input.current) as Record<string, unknown>;
  const payload = { ...current };
  const fields: string[] = [];
  const allowed = new Set(Object.keys(FormatPayloadByFormat[input.format].shape));

  const isBlank = (value: unknown) =>
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim().length === 0) ||
    (Array.isArray(value) && value.length === 0);

  const fill = (key: string, value: unknown) => {
    if (!allowed.has(key) || !isBlank(payload[key])) return;
    payload[key] = value;
    fields.push(key);
  };

  fill("hook", input.teardown.hook);
  fill("mainMessage", input.teardown.promise);
  fill("callToAction", input.teardown.callToAction);

  if (input.teardown.beats.length > 0) {
    const scenes = input.teardown.beats.slice(0, 20).map((beat, index) => ({
      position: index + 1,
      summary: beat.description,
      ...(typeof beat.startSecond === "number" && typeof beat.endSecond === "number"
        ? {
            durationSeconds: Math.min(
              60,
              Math.max(1, Math.round(beat.endSecond - beat.startSecond)),
            ),
          }
        : {}),
    }));
    fill("scenes", scenes);
    fill(
      "slideOutline",
      input.teardown.beats.slice(0, 10).map((beat, index) => ({
        position: index + 1,
        summary: beat.description,
      })),
    );
  }

  const notes = [
    `Pacing: ${input.teardown.pacing}`,
    ...input.teardown.uncertainty.map((item) => `Uncertainty: ${item}`),
  ]
    .join("\n")
    .slice(0, 2_000);
  fill("additionalNotes", notes);

  return { payload, fields };
}

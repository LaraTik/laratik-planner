import { z } from "zod";

/**
 * Brand Kit command schemas (STUDIOFLOW_MASTER_PROMPT.md §11.x).
 *
 * `BrandAssetCommand` and `BrandVoiceRuleCommand` are discriminated unions
 * keyed on the row-level discriminator (`kind` for assets, `ruleType` for
 * voice rules). Server actions and the service layer parse raw `FormData`
 * payloads through these before touching Postgres.
 *
 * The shape mirrors `src/lib/db/schema/channels.ts:brand_assets` /
 * `brand_voice_rules` — every validated input here is a valid column
 * subset that can be `insert()`ed into Drizzle with no further coercion.
 *
 * Round 1 covers three asset variants (logo, color, font) and all three
 * voice rule variants (tone, do, dont). New variants (guideline,
 * reference, other) are added by extending the unions — they map to
 * existing jsonb storage so no migration is needed.
 */

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use #RRGGBB format");

const fontWeight = z.enum(["300", "400", "500", "600", "700", "800"]);
const fontRole = z.enum(["headline", "body", "accent", "mono"]);

const logoCommand = z.object({
  kind: z.literal("logo"),
  name: z.string().trim().min(1).max(120),
  externalUrl: z
    .string()
    .trim()
    .url()
    .refine((value) => value.startsWith("https://"), "Use HTTPS")
    .optional(),
});

const colorCommand = z.object({
  kind: z.literal("color"),
  name: z.string().trim().min(1).max(80),
  value: z.object({ hex: hexColor }),
});

const fontCommand = z.object({
  kind: z.literal("font"),
  name: z.string().trim().min(1).max(80),
  value: z.object({
    family: z.string().trim().min(1).max(120),
    weight: fontWeight,
    role: fontRole,
  }),
});

export const BrandAssetCommandSchema = z.discriminatedUnion("kind", [
  logoCommand,
  colorCommand,
  fontCommand,
]);

export type BrandAssetCommand = z.infer<typeof BrandAssetCommandSchema>;

const toneCommand = z.object({
  ruleType: z.literal("tone"),
  content: z.string().trim().min(1).max(60),
});

const doCommand = z.object({
  ruleType: z.literal("do"),
  content: z.string().trim().min(1).max(280),
});

const dontCommand = z.object({
  ruleType: z.literal("dont"),
  content: z.string().trim().min(1).max(280),
});

export const BrandVoiceRuleCommandSchema = z.discriminatedUnion("ruleType", [
  toneCommand,
  doCommand,
  dontCommand,
]);

export type BrandVoiceRuleCommand = z.infer<typeof BrandVoiceRuleCommandSchema>;

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

const fontRole = z.enum(["headline", "body", "accent", "mono"]);

// Font weight is a multiple of 100 between 100 and 900 inclusive
// (the standard CSS weight scale). We accept a number rather than
// a string union so the UI can use a number input, and validate
// the multiple-of-100 constraint at the schema level so the
// server can trust the value without re-checking.
const fontWeight = z
  .number()
  .int()
  .min(100)
  .max(900)
  .refine((w) => w % 100 === 0, "Weight must be a multiple of 100");

const logoCommand = z.object({
  kind: z.literal("logo"),
  name: z.string().trim().min(1).max(120),
  externalUrl: z
    .string()
    .trim()
    .url()
    .refine((value) => value.startsWith("https://"), "Use HTTPS")
    .optional(),
  storagePath: z.string().trim().min(1).max(255).optional(),
});

const colorCommand = z.object({
  kind: z.literal("color"),
  name: z.string().trim().min(1).max(80),
  /**
   * Phase 8 — color role. Drives the colors page grouping
   * (primary / secondary / accent / neutral) and the AI context
   * payload. The DB stores the same enum in `brand_asset.color_role`
   * with a CHECK constraint that mirrors this Zod enum; the schema
   * is the structural gate, the DB is the source of truth.
   */
  colorRole: z.enum(["primary", "secondary", "accent", "neutral"]).optional(),
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

export const BrandAssetCommandSchema = z
  .discriminatedUnion("kind", [logoCommand, colorCommand, fontCommand])
  .superRefine((value, ctx) => {
    // Logo variant: external URL and uploaded file are mutually
    // exclusive. We check at the union level because Zod's
    // `discriminatedUnion` doesn't allow `.refine()` on its
    // members, but `superRefine` on the union is the documented
    // escape hatch.
    if (value.kind === "logo" && value.externalUrl && value.storagePath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pick one: external URL or uploaded file.",
        path: ["externalUrl"],
      });
    }
  });

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

/**
 * Publishing-rule command (STUDIOFLOW_MASTER_PROMPT.md §11.x) — editorial
 * guardrails grouped by intent. The discriminator (`ruleType`) mirrors
 * the `brand_publishing_rule.rule_type` Postgres enum constraint, so a
 * value that passes this schema is guaranteed to satisfy the DB check
 * (`brand_publishing_rule_type_valid`).
 *
 * Soft-archive only — `brand_publishing_rule` has an `archived_at`
 * column, so `archiveBrandPublishingRule` flips it to a non-null
 * timestamp instead of deleting the row.
 */
export const BrandPublishingRuleCommandSchema = z.object({
  ruleType: z.enum(["alt_text", "hashtag", "compliance", "channel", "general"]),
  title: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(1000),
});

export type BrandPublishingRuleCommand = z.infer<typeof BrandPublishingRuleCommandSchema>;

/**
 * Linked-resource command — a URL pointing at an external design or
 * asset library the team uses to source on-brand material. The
 * `provider` discriminator maps to the
 * `brand_linked_resource_provider_valid` check constraint; the URL
 * must be HTTPS to match the social-channel invariant and to avoid
 * leaking credentials over cleartext.
 */
export const BrandLinkedResourceCommandSchema = z.object({
  provider: z.enum(["google_drive", "figma", "canva", "dropbox", "other"]),
  name: z.string().trim().min(1).max(120),
  url: z
    .string()
    .trim()
    .url()
    .refine((value) => value.startsWith("https://"), "Use HTTPS"),
  description: z.string().trim().max(280).optional(),
});

export type BrandLinkedResourceCommand = z.infer<typeof BrandLinkedResourceCommandSchema>;

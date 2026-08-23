/**
 * M2.2 — Entitlement service type contract.
 *
 * These types are the public surface that downstream milestones
 * (M2.4 transactional enforcement, M2.7 platform console Plan tab,
 * M2.8 AI tab, M2.9 read-only Plan/Usage screen) read. Keep them
 * stable; the merge function in `get-effective-entitlement.ts` is
 * the single source of truth.
 *
 * The shape mirrors the JSONB columns on `platform_plan_template`
 * (defaults) and `agency_entitlement` (overrides) as defined in
 * `src/lib/db/schema/plans.ts`. Per the M2.1 contract, the keys are
 *   workspaces, users, total_social_profiles, social_profiles_per_platform,
 *   storage_bytes, monthly_ai_requests, monthly_ai_input_tokens,
 *   monthly_ai_output_tokens, daily_ai_requests_per_user,
 *   max_output_tokens_per_request, enabled_capabilities.
 *
 * On the read side, the M2.2 spec splits `maxProfilesPerPlatform`
 * (per-platform keys) and `maxSocialProfiles` (total) into two
 * distinct fields. The JSONB shape uses
 *   - `total_social_profiles` for the agency-wide cap
 *   - `social_profiles_per_platform` for the per-platform cap
 * (the same value applied to every platform). The resolved
 * `EffectiveEntitlement` therefore exposes:
 *   - `maxSocialProfiles` (the agency-wide total)
 *   - `maxProfilesPerPlatform` (a per-platform record, defaulting
 *     every platform to the `social_profiles_per_platform` value
 *     when the override / plan default is present).
 */
import { z } from "zod";

/**
 * The 8 social platforms recognized by the planner. Mirrors the
 * `social_platform` Postgres enum minus `threads` and `snapchat`
 * (those exist on the enum but the master prompt's Plan & Usage
 * screen tracks the 8 listed here). The `other` bucket catches
 * anything the enum allows but the screen does not list.
 */
export type PlatformKey =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "linkedin"
  | "youtube"
  | "pinterest"
  | "x"
  | "threads"
  | "snapchat"
  | "other";

/**
 * The 6 AI capabilities defined in master prompt §15. The platform
 * console's AI tab (M2.8) displays this list; the allowlist is
 * computed as the intersection of plan defaults and agency overrides.
 */
export type AiCapability =
  | "campaign_ideas"
  | "brief_improvement"
  | "caption_drafts"
  | "platform_adaptation"
  | "related_format_ideas"
  | "completeness_check";

/**
 * The default 6-capability set. Used when neither the plan default
 * nor the agency override lists capabilities — an empty
 * intersection is not the same as "no capabilities configured"; the
 * agency has simply not been constrained.
 */
export const ALL_AI_CAPABILITIES: ReadonlyArray<AiCapability> = [
  "campaign_ideas",
  "brief_improvement",
  "caption_drafts",
  "platform_adaptation",
  "related_format_ideas",
  "completeness_check",
] as const;

/**
 * String-literal tuple used by the Zod schemas below. `z.enum()` takes
 * a `[string, ...string[]]` tuple; exporting the tuple as `as const`
 * preserves the literal types so `z.infer<>` narrows correctly.
 */
const AI_CAPABILITY_VALUES = [
  "campaign_ideas",
  "brief_improvement",
  "caption_drafts",
  "platform_adaptation",
  "related_format_ideas",
  "completeness_check",
] as const;

const GRACE_POLICY_VALUES = ["block", "allow_grace"] as const;

/**
 * The 8 platforms the effective-entitlement record always carries
 * a per-platform limit for. Iteration order is stable for UI rendering
 * and snapshot comparison tests.
 */
export const ALL_PLATFORM_KEYS: ReadonlyArray<PlatformKey> = [
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "youtube",
  "pinterest",
  "x",
  "threads",
  "snapchat",
  "other",
] as const;

/**
 * The resolved entitlement for one agency. This is the
 * post-merge shape (plan defaults + agency overrides) that the
 * service layer reads. The shape is the read-side companion to the
 * `overrides` JSONB column on `agency_entitlement` (which is the
 * write-side shape).
 *
 * `null` means "no limit" (unlimited). It is intentionally
 * distinct from `0` (which would mean "blocked at zero").
 */
export interface EffectiveEntitlement {
  maxWorkspaces: number | null;
  maxUsers: number | null;
  maxSocialProfiles: number | null;
  maxProfilesPerPlatform: Record<PlatformKey, number | null>;
  maxStorageBytes: number | null;
  maxMonthlyAiRequests: number | null;
  maxMonthlyAiInputTokens: number | null;
  maxMonthlyAiOutputTokens: number | null;
  maxDailyAiRequestsPerUser: number | null;
  maxOutputTokensPerRequest: number | null;
  /**
   * The intersection of plan-default capabilities and agency-override
   * capabilities. The platform's `/api/ai/generate` route is the
   * authoritative gate; this set is what M2.4 enforces and what the
   * UI hides buttons against.
   */
  enabledAiCapabilities: ReadonlySet<AiCapability>;
  /**
   * 0..100. The percent of any limit at which the M2.4 enforcement
   * layer starts rejecting new allocations. Defaults to 100
   * (enforce exactly at the limit).
   */
  hardStopPercent: number;
  /**
   * `hard` = reject allocations that cross the hardStopPercent;
   * `soft` = let the operation succeed but flag the agency for
   * review on the platform console. M2.4's implementation
   * reads this flag.
   *
   * Named `hard` / `soft` here for clarity at the read site; the
   * Drizzle enum uses `block` / `allow_grace` (those are the
   * authoritative wire names — see `agency_entitlement_grace_policy`
   * in `schema/enums.ts`). The mapping is done in the change-plan
   * service so the read-side name matches the M2.2 spec verbatim.
   */
  gracePolicy: "hard" | "soft";
}

/**
 * The Drizzle wire name for the grace policy. The service layer
 * maps this to the read-side name `hard` / `soft` so the
 * `EffectiveEntitlement` is in the M2.2 spec's vocabulary.
 */
export type GracePolicyWire = "block" | "allow_grace";

/**
 * The per-agency entitlement row as written to the DB. Mirrors the
 * Drizzle table shape so the merge function and the change-plan
 * service can share the type. Derived from the Zod schema so the
 * service-layer type and the wire contract cannot drift.
 */
export type AgencyEntitlementRow = z.infer<typeof AgencyEntitlementRowSchema>;

/**
 * The JSONB shape stored in `platform_plan_template.default_limits`
 * and `agency_entitlement.overrides`. The two share the same key
 * set; the merge rule is documented on `getEffectiveEntitlement`.
 *
 * The `| undefined` on the values is required by Zod's `.optional()`
 * output under `exactOptionalPropertyTypes: true`; the merge function
 * treats `undefined` the same as a missing key (fall through to the
 * plan default). The TypeScript type is intentionally permissive
 * here so the Zod-inferred shape and the interface stay aligned.
 */
export type OverrideShape = z.infer<typeof OverrideShapeSchema>;

/**
 * The plan template row as read by the service layer. Mirrors the
 * Drizzle table. `defaultLimits` is null for the "custom" sentinel
 * plan and the agency must override every limit at entitlement time.
 * Derived from the Zod schema so the service-layer type and the
 * wire contract cannot drift.
 */
export type PlatformPlanTemplateRow = z.infer<typeof PlatformPlanTemplateRowSchema>;

/**
 * The shape of `agency.settings.lifecycle` — the per-agency
 * soft-lifecycle state used by the M2.2 service to decide whether
 * a plan change should be rejected.
 *
 * NOTE: the agency table (M1) does not yet have dedicated
 * `suspended_at` / `archived_at` columns. Per
 * `docs/m2-multi-agency/PLAN.md`, those columns land with the M2.7
 * platform console's Suspend / Restore / Archive actions. Until
 * then, this service reads the lifecycle state from
 * `agency.settings` (the existing JSONB column on the agency
 * table). M2.7 will replace the JSONB read with a column read;
 * the merge function's contract is unchanged.
 */
export interface AgencyLifecycle {
  suspendedAt: string | null;
  archivedAt: string | null;
}

/**
 * Thrown by `getEffectiveEntitlement` when the agency has no
 * entitlement row. Distinct from "agency not found" — the agency
 * may exist, but the M2.5 add-agency flow has not yet provisioned
 * an entitlement for it. Callers handle the empty case explicitly.
 */
export class AgencyNotFoundError extends Error {
  constructor(public agencyId: string) {
    super(`Agency not found: ${agencyId}`);
    this.name = "AgencyNotFoundError";
  }
}

/**
 * Thrown by `changeAgencyPlan` when the agency is suspended or
 * archived. The service writes a `platform_audit_event` with
 * action `entitlement.change.rejected` before throwing, so the
 * rejection is visible in the platform audit timeline.
 */
export class AgencyNotActiveError extends Error {
  constructor(
    public agencyId: string,
    public reason: "suspended" | "archived",
  ) {
    super(`Agency ${agencyId} is ${reason} and cannot change plan`);
    this.name = "AgencyNotActiveError";
  }
}

/**
 * Placeholder for M2.4. The M2.2 spec asks the types file to
 * declare the error class so downstream code can `import` it
 * without a forward-reference. The full implementation lives in
 * the M2.4 service.
 */
export class LimitExceededError extends Error {
  constructor(
    public details: {
      resource: string;
      currentUsage: number;
      limit: number;
      requestedIncrease: number;
      userMessage: string;
    },
  ) {
    super(details.userMessage);
    this.name = "LimitExceededError";
  }
}

// ─── Zod schemas ────────────────────────────────────────────────────────
//
// M2.2 spec: "Use Zod for the override input shape and the entitlement row
// shape." The schemas are the wire contract — service-layer callers
// validate their payload against the schema before crossing the public
// API boundary. The TypeScript types above are derived from the schemas
// via `z.infer<>` so the two never drift.

// Re-imported at the top of the file. The `import { z } from "zod"`
// line is placed near the top of this module; the schemas below use
// it directly.

/**
 * The JSONB `overrides` shape. Every key is optional. `null` is a
 * meaningful value — "unlimited" / "no limit" for numeric fields, or
 * "no constraint" for `enabled_capabilities`. The schema accepts
 * `null` alongside the optional `undefined` to match the JSONB
 * storage model (Postgres JSONB distinguishes `null` from missing).
 */
const PerPlatformLimitsSchema = z
  .object({
    instagram: z.number().int().nonnegative().nullable().optional(),
    facebook: z.number().int().nonnegative().nullable().optional(),
    tiktok: z.number().int().nonnegative().nullable().optional(),
    linkedin: z.number().int().nonnegative().nullable().optional(),
    youtube: z.number().int().nonnegative().nullable().optional(),
    pinterest: z.number().int().nonnegative().nullable().optional(),
    x: z.number().int().nonnegative().nullable().optional(),
    threads: z.number().int().nonnegative().nullable().optional(),
    snapchat: z.number().int().nonnegative().nullable().optional(),
    other: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();

export const OverrideShapeSchema = z.object({
  workspaces: z.number().int().nonnegative().nullable().optional(),
  users: z.number().int().nonnegative().nullable().optional(),
  total_social_profiles: z.number().int().nonnegative().nullable().optional(),
  social_profiles_per_platform: z.number().int().nonnegative().nullable().optional(),
  social_profiles_by_platform: PerPlatformLimitsSchema.optional(),
  storage_bytes: z.number().int().nonnegative().nullable().optional(),
  monthly_ai_requests: z.number().int().nonnegative().nullable().optional(),
  monthly_ai_input_tokens: z.number().int().nonnegative().nullable().optional(),
  monthly_ai_output_tokens: z.number().int().nonnegative().nullable().optional(),
  daily_ai_requests_per_user: z.number().int().nonnegative().nullable().optional(),
  max_output_tokens_per_request: z.number().int().nonnegative().nullable().optional(),
  enabled_capabilities: z.array(z.enum(AI_CAPABILITY_VALUES)).nullable().optional(),
  grace_policy: z.enum(GRACE_POLICY_VALUES).nullable().optional(),
});

/**
 * The agency entitlement row as read from the DB. Drizzle's
 * numeric column comes back as a string, so the schema accepts
 * `string` for `hardStopPercent` and the merge function coerces to
 * a number. `gracePolicy` is the Drizzle wire name (`block` /
 * `allow_grace`) and may be `null` (inherit from the plan default).
 *
 * `.strict()` rejects unknown keys — the row shape is fixed, and
 * an unexpected column would indicate a schema drift between the
 * Drizzle model and the JSONB contract.
 */
export const AgencyEntitlementRowSchema = z
  .object({
    agencyId: z.string().uuid(),
    planTemplateId: z.string().uuid(),
    overrides: OverrideShapeSchema.nullable(),
    hardStopPercent: z.string().regex(/^\d+(\.\d+)?$/, "hardStopPercent must be a numeric string"),
    gracePolicy: z.enum(GRACE_POLICY_VALUES).nullable(),
  })
  .strict();

/**
 * The plan template row shape (DB read-side). `defaultLimits` is
 * null for the "Custom" sentinel plan; the merge function falls
 * through to the agency override for every limit in that case.
 */
export const PlatformPlanTemplateRowSchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string().min(1),
    name: z.string().min(1),
    defaultLimits: OverrideShapeSchema.nullable(),
  })
  .strict();

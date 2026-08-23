import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { agencyEntitlements, platformPlanTemplates } from "@/lib/db/schema";
import {
  AgencyNotFoundError,
  AgencyEntitlementRowSchema,
  type AgencyEntitlementRow,
  type AiCapability,
  type EffectiveEntitlement,
  type GracePolicyWire,
  type OverrideShape,
  type PlatformKey,
  type PlatformPlanTemplateRow,
  ALL_AI_CAPABILITIES,
  ALL_PLATFORM_KEYS,
} from "./types";

/**
 * M2.2 — Effective entitlement (the read-side merge).
 *
 * The merge is a pure transformation over the two input rows
 * (entitlement + plan template). No `Date.now()`, no `Math.random()`,
 * no DB calls — so the unit tests can pin every branch without any
 * clock or test-database infrastructure.
 *
 * Merge rules (per the M2.2 task spec):
 *
 *   1. For each of the 11 keys, the agency override wins if the
 *      key is present on the override object. A present key with
 *      a `null` value is a "no limit" override and is preserved
 *      (not coerced to 0).
 *   2. When the override is missing the key, the plan default wins.
 *   3. When both are missing, the limit is `null` (unlimited) for
 *      numeric fields. The exception is `enabledAiCapabilities`,
 *      which defaults to the full 6-capability set.
 *   4. `hardStopPercent` is clamped to [0, 100].
 *   5. `enabledAiCapabilities` is the intersection of plan defaults
 *      and agency overrides; if neither sets it, the full 6-capability
 *      set is used.
 *   6. `gracePolicy` translates the Drizzle wire name (`block` /
 *      `allow_grace`) to the read-side name (`hard` / `soft`).
 *
 * The merge is intentionally total over the input rows: every
 * output field is set on the returned object, never `undefined`.
 * Downstream code (M2.4 enforcement, M2.7 platform console) can
 * read every field without a null check.
 */

export interface MergeInput {
  entitlement: AgencyEntitlementRow;
  planTemplate: PlatformPlanTemplateRow;
}

/**
 * The lower-level pure merge. The M2.2 spec asks for this to be
 * split out (a) so the unit tests don't need any DB mocking and
 * (b) so the change-plan service can reuse the same code path
 * when computing the "after" snapshot of a plan change.
 */
export function mergeEntitlement(input: MergeInput): EffectiveEntitlement {
  const { entitlement, planTemplate } = input;
  const defaults = planTemplate.defaultLimits;
  const overrides = entitlement.overrides ?? {};

  return {
    maxWorkspaces: pickLimit(overrides.workspaces, defaults?.workspaces),
    maxUsers: pickLimit(overrides.users, defaults?.users),
    maxSocialProfiles: pickLimit(overrides.total_social_profiles, defaults?.total_social_profiles),
    maxProfilesPerPlatform: resolvePerPlatform(overrides, defaults),
    maxStorageBytes: pickLimit(overrides.storage_bytes, defaults?.storage_bytes),
    maxMonthlyAiRequests: pickLimit(overrides.monthly_ai_requests, defaults?.monthly_ai_requests),
    maxMonthlyAiInputTokens: pickLimit(
      overrides.monthly_ai_input_tokens,
      defaults?.monthly_ai_input_tokens,
    ),
    maxMonthlyAiOutputTokens: pickLimit(
      overrides.monthly_ai_output_tokens,
      defaults?.monthly_ai_output_tokens,
    ),
    maxDailyAiRequestsPerUser: pickLimit(
      overrides.daily_ai_requests_per_user,
      defaults?.daily_ai_requests_per_user,
    ),
    maxOutputTokensPerRequest: pickLimit(
      overrides.max_output_tokens_per_request,
      defaults?.max_output_tokens_per_request,
    ),
    enabledAiCapabilities: intersectCapabilities(
      overrides.enabled_capabilities,
      defaults?.enabled_capabilities,
    ),
    hardStopPercent: clampHardStop(coerceNumber(entitlement.hardStopPercent, 100)),
    gracePolicy: resolveGracePolicy(entitlement.gracePolicy, defaults?.grace_policy),
  };
}

/**
 * Pick a limit value: present override wins (including `null`),
 * otherwise the plan default, otherwise `null` (unlimited).
 *
 * `null` here is a sentinel for "the limit is intentionally
 * turned off". Coercing `null` to `0` would be a regression — the
 * caller can no longer distinguish "no limit set" from "zero
 * allocations allowed".
 */
function pickLimit(
  override: number | null | undefined,
  fallback: number | null | undefined,
): number | null {
  if (override === undefined) return fallback ?? null;
  // `null` and any number are both "present"; the override wins.
  return override;
}

/**
 * The per-platform record. The JSONB shape stores a single
 * `social_profiles_per_platform` value that applies to every
 * platform. The resolved record always has 8 keys (one per
 * PlatformKey). `null` means "no per-platform cap".
 */
function resolvePerPlatform(
  overrides: OverrideShape,
  defaults: OverrideShape | null | undefined,
): Record<PlatformKey, number | null> {
  const result = {} as Record<PlatformKey, number | null>;
  for (const key of ALL_PLATFORM_KEYS) {
    const agencySpecific = overrides.social_profiles_by_platform?.[key];
    const planSpecific = defaults?.social_profiles_by_platform?.[key];
    if (agencySpecific !== undefined) {
      result[key] = agencySpecific;
    } else if (overrides.social_profiles_per_platform !== undefined) {
      result[key] = overrides.social_profiles_per_platform;
    } else if (planSpecific !== undefined) {
      result[key] = planSpecific;
    } else {
      result[key] = defaults?.social_profiles_per_platform ?? null;
    }
  }
  return result;
}

/**
 * The capability intersection. The full 6-capability set is the
 * "no constraint" sentinel — a missing plan default and a missing
 * override both mean "no constraint", not "no capabilities".
 *
 *   override = ["a", "b"] and default = null → ["a", "b"]
 *     (no plan ceiling → the agency override is the result)
 *   override = null and default = ["a", "b"] → ["a", "b"]
 *     (no agency constraint → the plan ceiling is the result)
 *   override = ["a", "b"] and default = ["a", "b", "c"] → ["a", "b"]
 *     (intersection)
 *   override = [] and default = [..all 6..] → []
 *     (empty intersection = agency opted out of every capability)
 *   override = null and default = null → all 6 capabilities
 *     (the default set, no constraints)
 */
function intersectCapabilities(
  override: ReadonlyArray<AiCapability> | null | undefined,
  defaults: ReadonlyArray<AiCapability> | null | undefined,
): ReadonlySet<AiCapability> {
  // Coerce "no array" to "no constraint" so the null+null case
  // returns the full set, and the array+null case returns the
  // array (no plan ceiling to intersect against).
  const overrideSet = override === null || override === undefined ? null : new Set(override);
  const defaultSet = defaults === null || defaults === undefined ? null : new Set(defaults);

  // Both null → full 6-capability default.
  if (overrideSet === null && defaultSet === null) {
    return new Set(ALL_AI_CAPABILITIES);
  }
  // Override is null → just the plan default.
  if (overrideSet === null && defaultSet !== null) {
    return new Set(defaultSet);
  }
  // Default is null → just the override (no ceiling to intersect).
  if (overrideSet !== null && defaultSet === null) {
    return new Set(overrideSet);
  }
  // Both present → the intersection.
  if (overrideSet !== null && defaultSet !== null) {
    const result = new Set<AiCapability>();
    for (const cap of overrideSet) {
      if (defaultSet.has(cap)) result.add(cap);
    }
    return result;
  }
  // Unreachable; satisfies the type checker.
  return new Set(ALL_AI_CAPABILITIES);
}

/**
 * Clamp the hard-stop percent to [0, 100]. The column-level CHECK
 * constraint already enforces the range, but the merge function is
 * the place that needs to defend against an out-of-range value
 * (e.g. legacy rows from before the CHECK existed).
 */
function clampHardStop(value: number): number {
  if (Number.isNaN(value)) return 100;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

/**
 * Coerce a Drizzle numeric-column value (which comes back as a
 * string) to a number. Falls back to the supplied default when the
 * input is `null` / `undefined` / non-numeric.
 */
function coerceNumber(value: string | number | null | undefined, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Resolve the grace policy. The agency column takes precedence; if
 * it is `null` (the default), the plan's JSONB grace_policy
 * setting is the fallback. If both are null, the read-side default
 * is `hard` (the strictest behavior).
 *
 * The Drizzle wire name (`block` / `allow_grace`) maps to the
 * read-side name (`hard` / `soft`):
 *
 *   `block`        → "hard"   (enforce immediately)
 *   `allow_grace`  → "soft"   (let the operation succeed and flag)
 */
function resolveGracePolicy(
  agencyPolicy: GracePolicyWire | null,
  planPolicy: GracePolicyWire | null | undefined,
): "hard" | "soft" {
  const wire: GracePolicyWire = agencyPolicy ?? planPolicy ?? "block";
  return wire === "allow_grace" ? "soft" : "hard";
}

// ─── DB-bound variant ────────────────────────────────────────────────

/**
 * The Zod schema for the read-side input. `entitlement` is
 * optional — the service looks the row up by `agencyId` when the
 * caller has not pre-loaded it (e.g. when called from a request
 * handler). Tests can pass `entitlement: null` to exercise the
 * empty-row branch without touching the DB.
 */
export const EffectiveEntitlementInputSchema = z.object({
  agencyId: z.string().uuid(),
  entitlement: AgencyEntitlementRowSchema.nullable().optional(),
});

export type EffectiveEntitlementInput = z.infer<typeof EffectiveEntitlementInputSchema>;

/**
 * The DB-bound variant. Reads the agency entitlement + plan
 * template, then delegates to `mergeEntitlement` for the actual
 * merge. This is the function M2.4 / M2.7 / M2.9 call.
 *
 * Throws `AgencyNotFoundError` when the agency has no entitlement
 * row. The M2.5 add-agency flow is responsible for creating the
 * entitlement before any read can succeed.
 */
export async function getEffectiveEntitlement(
  input: EffectiveEntitlementInput,
): Promise<EffectiveEntitlement> {
  const parsed = EffectiveEntitlementInputSchema.parse(input);
  const { agencyId } = parsed;
  const entitlement =
    parsed.entitlement !== undefined ? parsed.entitlement : await loadEntitlement(agencyId);
  if (!entitlement) {
    throw new AgencyNotFoundError(agencyId);
  }
  const planTemplate = await loadPlanTemplate(entitlement.planTemplateId);
  return mergeEntitlement({ entitlement, planTemplate });
}

/**
 * Load the entitlement row by agencyId. Returns `null` when no
 * row exists (caller decides between throw + empty-case
 * handling). The select is intentionally narrow — the merge
 * function only needs the entitlement columns, not the audit
 * fields.
 */
async function loadEntitlement(agencyId: string): Promise<AgencyEntitlementRow | null> {
  const [row] = await db
    .select({
      agencyId: agencyEntitlements.agencyId,
      planTemplateId: agencyEntitlements.planTemplateId,
      overrides: agencyEntitlements.overrides,
      hardStopPercent: agencyEntitlements.hardStopPercent,
      gracePolicy: agencyEntitlements.gracePolicy,
    })
    .from(agencyEntitlements)
    .where(eq(agencyEntitlements.agencyId, agencyId))
    .limit(1);
  if (!row) return null;
  return {
    agencyId: row.agencyId,
    planTemplateId: row.planTemplateId,
    overrides: (row.overrides as OverrideShape | null) ?? null,
    hardStopPercent: row.hardStopPercent,
    gracePolicy: row.gracePolicy,
  };
}

/**
 * Load the plan template by id. The plan template is small (4
 * seeded rows + the operator-created ones) so a fresh query is
 * fine. A future optimization is to cache this in memory or in
 * a process-local LRU; not done here because the plan templates
 * are not on the hot path of every API call (they are read once
 * per agency lookup, not per request).
 */
async function loadPlanTemplate(planTemplateId: string): Promise<PlatformPlanTemplateRow> {
  const [row] = await db
    .select({
      id: platformPlanTemplates.id,
      slug: platformPlanTemplates.slug,
      name: platformPlanTemplates.name,
      defaultLimits: platformPlanTemplates.defaultLimits,
    })
    .from(platformPlanTemplates)
    .where(eq(platformPlanTemplates.id, planTemplateId))
    .limit(1);
  if (!row) {
    // The agency_entitlement FK is ON DELETE RESTRICT, so a missing
    // plan template would mean either a hand-rolled SQL operation or
    // a corrupted DB. Either way, we cannot compute the merge.
    throw new Error(`Plan template ${planTemplateId} not found`);
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    defaultLimits: (row.defaultLimits as OverrideShape | null) ?? null,
  };
}

// Export the loader so the change-plan service can reuse the read
// path inside a transaction.
export async function loadEntitlementForUpdate(
  agencyId: string,
  tx: Pick<typeof db, "select">,
): Promise<AgencyEntitlementRow | null> {
  const [row] = await tx
    .select({
      agencyId: agencyEntitlements.agencyId,
      planTemplateId: agencyEntitlements.planTemplateId,
      overrides: agencyEntitlements.overrides,
      hardStopPercent: agencyEntitlements.hardStopPercent,
      gracePolicy: agencyEntitlements.gracePolicy,
    })
    .from(agencyEntitlements)
    .where(and(eq(agencyEntitlements.agencyId, agencyId)))
    .limit(1)
    .for("update");
  if (!row) return null;
  return {
    agencyId: row.agencyId,
    planTemplateId: row.planTemplateId,
    overrides: (row.overrides as OverrideShape | null) ?? null,
    hardStopPercent: row.hardStopPercent,
    gracePolicy: row.gracePolicy,
  };
}

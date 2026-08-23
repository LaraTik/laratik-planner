import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { agencyEntitlements, platformPlanTemplates } from "@/lib/db/schema";
import { RESOURCE_TO_PLAN_KEY } from "./types";

/**
 * M2.3 — local helper to read the effective limit for a resource.
 *
 * TODO(M2.4): replace with getEffectiveEntitlement. M2.2 owns the
 * full entitlement-merge function (plan defaults + per-agency
 * overrides + plan-template inherit + grace-policy-aware
 * over-limit behavior). When M2.2 lands, this helper is replaced
 * by a single call to M2.2's merge function and the dependency
 * on the JSONB shape of `platform_plan_template.default_limits`
 * disappears from M2.3.
 *
 * For M2.3, the read is a direct join:
 *
 *   agency_entitlement + platform_plan_template
 *   → default_limits[plan_key] ?? overrides[plan_key]
 *
 * The `plan_key` is the documented JSONB shape key (e.g.
 * `total_social_profiles`), NOT the M2.3 service resource
 * name. The mapping is in `RESOURCE_TO_PLAN_KEY`.
 *
 * Returns `null` if the agency has no entitlement row, the
 * plan template has no `default_limits` JSONB (the
 * "custom" sentinel), the JSONB has no entry for the key,
 * or the entry is explicitly `null` (unlimited override).
 *
 * The function is intentionally tolerant of a missing
 * entitlement: a freshly-created agency that has not yet
 * had `recordUsage` called from the entitlement-write path
 * will read `null` and the service treats that as
 * "unlimited" (no level). M2.4's quota enforcement will
 * reject allocations for an agency with no entitlement
 * before `recordUsage` is ever called, so the "no
 * entitlement" branch is purely defensive.
 */

/**
 * A loose Zod schema for the JSONB shapes of
 * `platform_plan_template.default_limits` and
 * `agency_entitlement.overrides`. The plan-template seed
 * shapes the JSONB as `{ <plan_key>: number | null | string[] }`
 * (a `null` value means "unlimited", a `string[]` value is
 * `enabled_capabilities: string[]` which is a list, not a
 * numeric limit). The M2.3 service only needs the numeric
 * / null cases; other shapes are ignored.
 *
 * The schema is the runtime boundary; downstream code uses
 * `z.number()` / `null` narrowing to extract a limit and
 * never casts to `any`.
 */
const LimitOverrideValueSchema = z.union([z.number().finite(), z.null()]);

const LimitJsonSchema = z.record(z.string(), z.unknown()).transform((raw) => {
  // Project the raw JSONB into a narrower shape: only entries
  // whose value is a finite number or null are kept. Other
  // shapes (e.g. the `enabled_capabilities: string[]`
  // capability list) are silently dropped — they are not
  // numeric limits.
  const out: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(raw)) {
    const parsed = LimitOverrideValueSchema.safeParse(v);
    if (parsed.success) {
      out[k] = parsed.data;
    }
  }
  return out;
});

/**
 * Read the effective limit for a single resource key. The
 * M2.3 caller passes a service-vocabulary name (e.g.
 * `social_profiles:instagram`); the helper maps it to the
 * plan-vocabulary key (`social_profiles_per_platform`) and
 * applies the merge order:
 *
 *   1. per-agency `overrides[plan_key]` (if present and
 *      numeric or null) wins
 *   2. `default_limits[plan_key]` (if present and numeric
 *      or null) is the fallback
 *   3. anything else → `null` (unlimited)
 *
 * Returns `null` for "no entitlement row" as well — a
 * missing entitlement is treated as unlimited because the
 * M2.4 quota-enforcement layer is the gate that should
 * prevent an agency without an entitlement from ever
 * incrementing a counter.
 */
export async function getLimitForResource(
  db: NodePgDatabase,
  agencyId: string,
  resource: string,
): Promise<number | null> {
  const planKey = resource.startsWith("daily_ai_requests:")
    ? "daily_ai_requests_per_user"
    : ((RESOURCE_TO_PLAN_KEY as Record<string, string | null>)[resource] ?? null);
  if (planKey === null) {
    // The resource is not in the M2.1 plan-default shape.
    // Per-user resources (daily_ai_requests:<user_id>) are
    // not part of the M2.3 plan-default lookup; M2.4 will
    // resolve those via the user's own entitlement row.
    return null;
  }

  const [row] = await db
    .select({
      defaultLimits: platformPlanTemplates.defaultLimits,
      overrides: agencyEntitlements.overrides,
    })
    .from(agencyEntitlements)
    .innerJoin(
      platformPlanTemplates,
      eq(platformPlanTemplates.id, agencyEntitlements.planTemplateId),
    )
    .where(eq(agencyEntitlements.agencyId, agencyId));

  if (!row) {
    return null;
  }

  const platform = resource.startsWith("social_profiles:")
    ? resource.slice("social_profiles:".length)
    : null;
  if (platform) {
    const overrideObject = z.record(z.string(), z.unknown()).parse(row.overrides ?? {});
    const defaultObject = z.record(z.string(), z.unknown()).parse(row.defaultLimits ?? {});
    const overrideMap = z
      .record(z.string(), LimitOverrideValueSchema)
      .safeParse(overrideObject["social_profiles_by_platform"]);
    if (overrideMap.success && Object.prototype.hasOwnProperty.call(overrideMap.data, platform)) {
      return overrideMap.data[platform] ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(overrideObject, "social_profiles_per_platform")) {
      return LimitOverrideValueSchema.parse(overrideObject["social_profiles_per_platform"]);
    }
    const defaultMap = z
      .record(z.string(), LimitOverrideValueSchema)
      .safeParse(defaultObject["social_profiles_by_platform"]);
    if (defaultMap.success && Object.prototype.hasOwnProperty.call(defaultMap.data, platform)) {
      return defaultMap.data[platform] ?? null;
    }
  }

  // Per-agency override wins. The override is a JSONB
  // object; a key with a finite `number` value is the
  // effective limit, a key with `null` is "unlimited",
  // and an absent key means "fall through to the plan
  // default".
  const overrides = LimitJsonSchema.parse(row.overrides ?? {});
  if (Object.prototype.hasOwnProperty.call(overrides, planKey)) {
    return overrides[planKey] ?? null;
  }

  const defaults = LimitJsonSchema.parse(row.defaultLimits ?? {});
  if (!Object.prototype.hasOwnProperty.call(defaults, planKey)) {
    return null;
  }
  return defaults[planKey] ?? null;
}

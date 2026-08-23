/**
 * M2.3 — usage-tracking shared types, Zod schemas, and resource catalog.
 *
 * This module is the single source of truth for:
 *   - the controlled vocabulary of resource names the service accepts,
 *   - the typed shapes returned by `recordUsage` and `getUsage`,
 *   - the structured error class `InvalidUsageDeltaError`.
 *
 * It MUST NOT import from `record-usage.ts` / `get-usage.ts` to keep
 * the type-only surface importable from tests that want to assert
 * shapes without pulling in the Drizzle client.
 */

import { z } from "zod";

/**
 * The full set of resource names the usage-tracking service knows
 * about. This is the closed vocabulary `recordUsage` and `getUsage`
 * iterate over; callers that pass a `resource` not in this list
 * still get serviceable behavior (the row is created / read), but
 * the `getUsage` snapshot will only contain entries for the
 * resources in this set.
 *
 * The naming convention is documented in
 * `src/lib/db/schema/usage.ts`:
 *
 *   - aggregate: `workspaces`, `users`, `storage_bytes`,
 *     `ai_requests_month`, `ai_input_tokens_month`,
 *     `ai_output_tokens_month`
 *   - per-platform: `social_profiles:instagram`, etc.
 *
 * Note on the spec vs. M2.1 plan defaults: the M2.1 plan template
 * stores the *total* social-profiles limit under the key
 * `total_social_profiles` and the *per-platform* limit under
 * `social_profiles_per_platform`. The M2.3 service exposes the
 * same data under different keys (the resource name passed to
 * `recordUsage` is the service vocabulary, not the plan-vocabulary).
 * The bridge is `RESOURCE_TO_PLAN_KEY` below.
 *
 * The `as const` keeps the type narrow (each element is a literal
 * type) so the `KNOWN_RESOURCES` constant can be used as a
 * type-level source of truth for `getUsage`'s return shape.
 */
export const KNOWN_RESOURCES = [
  "workspaces",
  "users",
  "social_profiles:instagram",
  "social_profiles:facebook",
  "social_profiles:tiktok",
  "social_profiles:linkedin",
  "social_profiles:youtube",
  "social_profiles:pinterest",
  "social_profiles:x",
  "social_profiles:other",
  "storage_bytes",
  "ai_requests_month",
  "ai_input_tokens_month",
  "ai_output_tokens_month",
] as const;

export type KnownResource = (typeof KNOWN_RESOURCES)[number];

/**
 * The service contract: `recordUsage(agencyId, resource, delta)`
 * and `getUsage(agencyId)` accept a `resource` string. The string
 * can be any of the `KNOWN_RESOURCES` literals or any other string
 * the caller chooses to record. The Zod schema below is the
 * runtime validator used at the API boundary (e.g. an
 * /api/usage/record route handler) — the service layer trusts the
 * caller for in-process calls.
 */
export const ResourceKeySchema = z.string().min(1).max(128);
export type ResourceKey = z.infer<typeof ResourceKeySchema>;

/**
 * The four levels a counter can be classified at. The string
 * literals are the same ones the M2.1 `agency_usage_threshold_level`
 * Postgres enum uses for the database column, plus `healthy` for
 * the "no event has been emitted" case that the M2.1 enum does
 * not represent (the enum is `warning | urgent | over_limit`
 * because it is the *event* log, not the *current* state).
 */
export type UsageLevel = "healthy" | "warning" | "urgent" | "over_limit";

/**
 * The shape of a single resource entry in the `getUsage` snapshot.
 *
 *   - `level` is the most severe level the counter has recorded.
 *     If no event exists yet, the level is derived from the current
 *     percent (see `computeLevel`).
 *   - `percent` is the most recent observed percent for the most
 *     severe recorded event, or `null` if no event has been emitted
 *     AND the resource has no limit configured (unlimited
 *     resources are always healthy; the percent has no meaning).
 *   - `limit` is the effective limit for the resource, or `null`
 *     if the resource is unlimited.
 */
export type UsageThresholdSnapshot = {
  level: UsageLevel;
  percent: number | null;
  limit: number | null;
};

/**
 * The full `getUsage` snapshot. The maps are keyed by the resource
 * name the caller used to record it. `getUsage` iterates over
 * `KNOWN_RESOURCES` and reports a row for each (defaulting to
 * `value: 0`, `level: "healthy"`, `limit: null` for resources the
 * agency has never touched).
 */
export type UsageSnapshot = {
  counters: Record<string, number>;
  thresholds: Record<string, UsageThresholdSnapshot>;
  limits: Record<string, number | null>;
};

/**
 * The Zod schema for the `getUsage` snapshot. Used at the API
 * boundary to validate the shape that the service returns before
 * it leaves the server (e.g. as part of a Next.js route handler
 * response). The Zod schema is the single source of truth for the
 * shape; the TypeScript type is derived from it.
 */
export const UsageThresholdSnapshotSchema: z.ZodType<UsageThresholdSnapshot> = z.object({
  level: z.enum(["healthy", "warning", "urgent", "over_limit"]),
  percent: z.number().nullable(),
  limit: z.number().int().nullable(),
});

export const UsageSnapshotSchema: z.ZodType<UsageSnapshot> = z.object({
  counters: z.record(z.string(), z.number().int().nonnegative()),
  thresholds: z.record(z.string(), UsageThresholdSnapshotSchema),
  limits: z.record(z.string(), z.number().int().nullable()),
});

/**
 * Thrown by `recordUsage` when a delta would take the counter
 * below zero. The error is the *first* line of defense; the DB
 * `CHECK (current_value >= 0)` is the second. A delta that throws
 * here is an application bug: the caller is trying to free more
 * capacity than was consumed (e.g. decrementing a workspace
 * counter when no workspace was created).
 *
 * The error carries the resource name, the current value, and
 * the attempted delta so a `toThrow` / `.rejects.toThrow` can
 * include them in the message and the support tooling can
 * surface a meaningful alert.
 */
export class InvalidUsageDeltaError extends Error {
  readonly resource: string;
  readonly currentValue: number;
  readonly delta: number;

  constructor(resource: string, currentValue: number, delta: number) {
    super(
      `InvalidUsageDeltaError: resource=${resource} current=${currentValue} delta=${delta} ` +
        `would land at ${currentValue + delta}, which is below the floor of 0`,
    );
    this.name = "InvalidUsageDeltaError";
    this.resource = resource;
    this.currentValue = currentValue;
    this.delta = delta;
    // Preserve the prototype chain when transpiled to ES5.
    Object.setPrototypeOf(this, InvalidUsageDeltaError.prototype);
  }
}

/**
 * Maps a M2.3 service resource name to the key used in
 * `platform_plan_template.default_limits` JSONB (the M2.1 seed
 * shape). The two vocabularies differ:
 *
 *   - the M2.3 service uses per-platform keys like
 *     `social_profiles:instagram`, but the M2.1 plan defaults
 *     store the per-platform limit once as
 *     `social_profiles_per_platform`.
 *   - the M2.3 service uses `ai_requests_month`,
 *     `ai_input_tokens_month`, `ai_output_tokens_month`; the
 *     M2.1 plan defaults use the same names (no remap needed).
 *
 * This map is the explicit bridge; the service applies it before
 * looking up the effective limit. M2.4's quota-enforcement layer
 * will re-use the same map.
 */
export const RESOURCE_TO_PLAN_KEY: Readonly<Record<KnownResource, string | null>> = {
  workspaces: "workspaces",
  users: "users",
  "social_profiles:instagram": "social_profiles_per_platform",
  "social_profiles:facebook": "social_profiles_per_platform",
  "social_profiles:tiktok": "social_profiles_per_platform",
  "social_profiles:linkedin": "social_profiles_per_platform",
  "social_profiles:youtube": "social_profiles_per_platform",
  "social_profiles:pinterest": "social_profiles_per_platform",
  "social_profiles:x": "social_profiles_per_platform",
  "social_profiles:other": "social_profiles_per_platform",
  storage_bytes: "storage_bytes",
  ai_requests_month: "monthly_ai_requests",
  ai_input_tokens_month: "monthly_ai_input_tokens",
  ai_output_tokens_month: "monthly_ai_output_tokens",
};

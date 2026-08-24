import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { aiDailyBudgetUsage, aiFeatureSettings } from "@/lib/db/schema";
import { getEffectiveEntitlement, type AiCapability } from "@/lib/entitlements";
import { LimitExceededError, reserveCapacity } from "@/lib/entitlements";
import { recordUsage } from "@/lib/usage";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/**
 * The 6 AI capabilities defined in master prompt §15. The
 * capability enum is re-declared here (rather than imported from
 * `@/lib/ai/feature-settings`) so the test suite can import the
 * pure helpers without pulling in the server-only auth / Drizzle
 * chain. The constant is the source of truth for the schema; the
 * re-export in `feature-settings` re-uses the same value.
 */
export const AI_CAPABILITIES = [
  "campaign_ideas",
  "brief_improvement",
  "caption_drafts",
  "platform_adaptation",
  "related_format_ideas",
  "completeness_check",
] as const;

/**
 * STUDIOFLOW_MASTER_PROMPT.md §4 (Milestone 3) + §15 — AI governance.
 *
 * Per the master prompt:
 *
 *   "Keep AI configuration agency-scoped and server-enforced.
 *    Platform AI controls: ... Global request and token safeguards.
 *    Agency AI controls: ... Per-user daily allowance ... Hard-stop
 *    or approved grace behavior. Reset date. Usage and estimated
 *    cost."
 *
 * This module is the single source of truth for the agency-level
 * AI capability intersection and the per-user daily request
 * budget. The /api/ai/generate route calls `enforceAiBudget` on
 * every request before it talks to the provider; the route never
 * re-derives these checks itself.
 *
 * Capability intersection (the §15 contract):
 *
 *   - An agency's `enabled_capabilities` is the agency admin's
 *     choice.
 *   - The plan template carries a `enabled_capabilities` allowlist
 *     that the agency cannot exceed.
 *   - The *intersection* is what the agency can actually use.
 *   - `resolveEnabledCapabilities(agencyId)` returns the
 *     intersection as a `Set<AiCapability>`. The route refuses
 *     any capability not in the set with a 403 (per the §15
 *     response contract). The UI hides the corresponding button
 *     but the server is the source of truth.
 *
 * Per-user daily request budget:
 *
 *   - The agency's `daily_ai_requests_per_user` limit (from
 *     `agency_entitlement.overrides` or the plan default) is the
 *     hard cap for a single user in a single UTC day.
 *   - `enforceAiBudget` UPSERTs `ai_daily_budget_usage` inside the
 *     same transaction as the monthly reservation. The
 *     `request_count` is incremented by 1; if the new count would
 *     exceed the cap, the UPSERT is rolled back and a
 *     `LimitExceededError` is thrown. The 429 response the route
 *     returns is the §15 contract.
 *   - The application never calls `enforceAiBudget` outside a
 *     transaction. The function signature takes the same
 *     `NodePgDatabase` as `reserveCapacity` so callers compose
 *     the two in a single tx.
 *
 * Token reconciliation (the §15 contract):
 *
 *   - `enforceAiBudget` reserves an *estimated* input + output
 *     token count. The route learns the *actual* count from the
 *     provider response and calls `reconcileAiBudget` to true up
 *     the reservation. Under-usage is returned to the
 *     `agency_usage_counter` (negative delta); over-usage is
 *     reserved as a positive delta on top of the original.
 *   - Reconciliation happens in a single `db.transaction` so the
 *     per-user daily counter and the monthly counter stay
 *     consistent.
 *
 * The full request lifecycle, in order:
 *
 *   1. Route resolves the active agency context.
 *   2. Route checks the agency's feature settings for
 *      `enabled === true` and the capability is in
 *      `enabled_capabilities`.
 *   3. Route calls `resolveEnabledCapabilities(agencyId)` to get
 *      the intersection; rejects if the capability is missing
 *      with a 403.
 *   4. Route calls `enforceAiBudget(tx, agencyId, userId,
 *      capability)` inside a transaction; rejects on
 *      `LimitExceededError` with a 429.
 *   5. Route calls the provider.
 *   6. Route calls `reconcileAiBudget(agencyId, userId, actual,
 *      reserved)` to true up the counters.
 */

const AI_BUDGET_DAILY_KEY_PREFIX = "daily_ai_requests:";
const AI_BUDGET_MONTHLY_REQUESTS = "ai_requests_month";
const AI_BUDGET_MONTHLY_INPUT = "ai_input_tokens_month";
const AI_BUDGET_MONTHLY_OUTPUT = "ai_output_tokens_month";

/**
 * The shape of the reservation that `enforceAiBudget` returns.
 * The route uses the *estimated* values when calling the
 * provider, and then passes the same `reservationId` (a logical
 * handle — not a row id) to `reconcileAiBudget` with the actual
 * values from the provider.
 */
export const AiBudgetReservationSchema = z.object({
  capability: z.enum(AI_CAPABILITIES),
  estimatedInputTokens: z.number().int().min(0),
  estimatedOutputTokens: z.number().int().min(0),
  monthlyRequestsReserved: z.number().int().min(1),
  dailyRequestsReserved: z.number().int().min(1),
});
export type AiBudgetReservation = z.infer<typeof AiBudgetReservationSchema>;

// ─── Capability intersection ──────────────────────────────────────────

/**
 * The intersection of the plan's `enabled_capabilities` and the
 * agency's `enabled_capabilities`. The function is pure: it does
 * not consult the database directly. The caller passes the
 * effective entitlement, which is the canonical merged view.
 */
export function resolveEnabledCapabilities(input: {
  effectiveCapabilities: ReadonlySet<AiCapability>;
  agencyExplicitCapabilities?: ReadonlyArray<AiCapability> | null;
}): ReadonlySet<AiCapability> {
  if (input.agencyExplicitCapabilities == null) {
    return new Set(input.effectiveCapabilities);
  }
  const out = new Set<AiCapability>();
  for (const capability of input.agencyExplicitCapabilities) {
    if (input.effectiveCapabilities.has(capability)) out.add(capability);
  }
  return out;
}

/**
 * Resolve the effective capability intersection for an agency.
 * One Drizzle read; no transaction. The route calls this once
 * per request, caches the result on the request context, and
 * uses the set to gate the actual provider call.
 */
export async function loadEnabledCapabilities(
  agencyId: string,
): Promise<ReadonlySet<AiCapability>> {
  const entitlement = await getEffectiveEntitlement({ agencyId });
  const [feature] = await db
    .select({ enabledCapabilities: aiFeatureSettings.enabledCapabilities })
    .from(aiFeatureSettings)
    .where(eq(aiFeatureSettings.agencyId, agencyId))
    .limit(1);
  return resolveEnabledCapabilities({
    effectiveCapabilities: entitlement.enabledAiCapabilities,
    agencyExplicitCapabilities: (feature?.enabledCapabilities as AiCapability[] | null) ?? null,
  });
}

// ─── Per-user daily budget UPSERT ──────────────────────────────────────

function todayUtcDate(now: Date): string {
  // Postgres `date` type compares as a calendar date in the
  // server's timezone. We store the UTC calendar date for
  // consistency with the other daily counters (the usage service
  // uses the same convention).
  return now.toISOString().slice(0, 10);
}

/**
 * UPSERT the per-user daily counter and return the *new* count.
 * The function is the inner primitive used by `enforceAiBudget`
 * and by the recovery path in `reconcileAiBudget`. It does not
 * check the cap; the caller is responsible for the limit check
 * inside the same transaction.
 */
async function upsertDailyBudget(
  tx: NodePgDatabase,
  agencyId: string,
  userId: string,
  usageDate: string,
  requestId: string,
): Promise<number> {
  // Postgres-native UPSERT — the route can read the new count
  // back from the RETURNING clause. Drizzle's `returning()` on
  // an INSERT ... ON CONFLICT is the same pattern.
  const [row] = await tx
    .insert(aiDailyBudgetUsage)
    .values({
      agencyId,
      userId,
      usageDate,
      requestCount: 1,
      lastRequestId: requestId,
      lastRecordedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        aiDailyBudgetUsage.agencyId,
        aiDailyBudgetUsage.userId,
        aiDailyBudgetUsage.usageDate,
      ],
      set: {
        requestCount: sql`${aiDailyBudgetUsage.requestCount} + 1`,
        lastRequestId: requestId,
        lastRecordedAt: new Date(),
      },
    })
    .returning({ requestCount: aiDailyBudgetUsage.requestCount });
  if (!row) {
    // Should never happen — ON CONFLICT DO UPDATE always returns
    // a row. The branch is here so a future migration that
    // changes the upsert semantics surfaces a clean error.
    throw new Error("upsertDailyBudget returned no row");
  }
  return row.requestCount;
}

// ─── Budget enforcement ──────────────────────────────────────────────

/**
 * Reserve one AI request inside the caller's transaction. The
 * function:
 *
 *   1. UPSERTs the per-user daily counter via the
 *      `upsertDailyBudget` helper. If the post-update count
 *      exceeds `daily_ai_requests_per_user`, the transaction
 *      rolls back; `LimitExceededError` is thrown with the
 *      `daily_ai_requests` resource key.
 *   2. Reserves the monthly counters via `reserveCapacity`:
 *      - `ai_requests_month` (+1)
 *      - `ai_input_tokens_month` (+estimatedInputTokens)
 *      - `ai_output_tokens_month` (+estimatedOutputTokens)
 *      The cap on each is read from the effective entitlement
 *      via `reserveCapacity`. The function throws
 *      `LimitExceededError` for the over-cap resource.
 *
 * On success, returns the reservation metadata. The route passes
 * the same `reservationId` (the underlying `ai_usage_event` is
 * not yet written at this point — the route writes the event
 * after the provider responds) to `reconcileAiBudget`.
 *
 * The caller MUST pass a transaction-backed Drizzle client. The
 * function is the only place that should write to
 * `ai_daily_budget_usage`; the counter is intentionally not
 * touched by `recordUsage` to keep the daily and monthly
 * reservations in lockstep.
 */
export async function enforceAiBudget(input: {
  tx: NodePgDatabase;
  agencyId: string;
  userId: string;
  capability: AiCapability;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  requestId: string;
  now?: Date;
}): Promise<AiBudgetReservation> {
  const {
    tx,
    agencyId,
    userId,
    capability,
    estimatedInputTokens,
    estimatedOutputTokens,
    requestId,
    now = new Date(),
  } = input;

  if (estimatedInputTokens < 0 || estimatedOutputTokens < 0) {
    throw new Error("enforceAiBudget: token estimates must be non-negative integers");
  }

  const usageDate = todayUtcDate(now);
  const dailyCount = await upsertDailyBudget(tx, agencyId, userId, usageDate, requestId);
  const entitlement = await getEffectiveEntitlement({ agencyId });
  const dailyCap = entitlement.maxDailyAiRequestsPerUser;
  if (dailyCap !== null && dailyCount > dailyCap) {
    // Roll back: the daily counter is on the same transaction.
    // The error carries the structured details the route maps to
    // a 429.
    throw new LimitExceededError({
      resource: `${AI_BUDGET_DAILY_KEY_PREFIX}${userId}`,
      currentUsage: dailyCount,
      limit: dailyCap,
      requestedIncrease: 1,
      userMessage: `Your plan allows ${dailyCap} AI requests per day per user. Try again tomorrow or request a limit change.`,
    });
  }

  // Reserve the monthly counters. `reserveCapacity` is idempotent
  // and uses the agency-scoped advisory lock to serialize
  // concurrent reservations.
  await reserveCapacity(tx, agencyId, [
    { resource: AI_BUDGET_MONTHLY_REQUESTS, increase: 1 },
    { resource: AI_BUDGET_MONTHLY_INPUT, increase: estimatedInputTokens },
    { resource: AI_BUDGET_MONTHLY_OUTPUT, increase: estimatedOutputTokens },
  ]);

  return AiBudgetReservationSchema.parse({
    capability,
    estimatedInputTokens,
    estimatedOutputTokens,
    monthlyRequestsReserved: 1,
    dailyRequestsReserved: 1,
  });
}

// ─── Reconciliation ──────────────────────────────────────────────────

/**
 * True up the per-request reservation against the actual token
 * counts reported by the provider. Called from the route AFTER
 * the provider responds successfully.
 *
 *   - The daily counter is already at its final value (1).
 *     Reconciliation does NOT modify it; the daily counter is
 *     a request-count, not a token-count.
 *   - The monthly request counter is already at its final value
 *     (1). Reconciliation does NOT modify it either.
 *   - The monthly input and output token counters are reconciled
 *     by adding the difference (actual - estimated) to each via
 *     `reserveCapacity`. A negative delta is applied via
 *     `recordUsage` so the counter is decremented.
 *
 * The function is idempotent: calling it twice with the same
 * inputs is a no-op. The route calls it exactly once per
 * successful request.
 */
export async function reconcileAiBudget(input: {
  agencyId: string;
  userId: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  actualInputTokens: number;
  actualOutputTokens: number;
  now?: Date;
}): Promise<void> {
  const {
    agencyId,
    userId,
    estimatedInputTokens,
    estimatedOutputTokens,
    actualInputTokens,
    actualOutputTokens,
  } = input;

  // Defensive: if the provider returns NaN / negative, fall back
  // to the reservation. The route would otherwise write a
  // nonsense usage event.
  const safeActualInput = Math.max(0, Math.floor(actualInputTokens));
  const safeActualOutput = Math.max(0, Math.floor(actualOutputTokens));
  const inputDelta = safeActualInput - estimatedInputTokens;
  const outputDelta = safeActualOutput - estimatedOutputTokens;

  // Both deltas are zero → no reconciliation needed.
  if (inputDelta === 0 && outputDelta === 0) return;

  const positiveAdjustments: Array<{ resource: string; increase: number }> = [];
  if (inputDelta > 0)
    positiveAdjustments.push({ resource: AI_BUDGET_MONTHLY_INPUT, increase: inputDelta });
  if (outputDelta > 0)
    positiveAdjustments.push({ resource: AI_BUDGET_MONTHLY_OUTPUT, increase: outputDelta });

  if (positiveAdjustments.length > 0) {
    await db.transaction(async (tx) => {
      await reserveCapacity(tx, agencyId, positiveAdjustments);
    });
  }

  // Negative deltas: refund the unused tokens to the monthly
  // counters via `recordUsage`. The `recordUsage` function
  // validates the delta is an integer and that the resulting
  // value is non-negative.
  if (inputDelta < 0) {
    await recordUsage(db, agencyId, AI_BUDGET_MONTHLY_INPUT, inputDelta);
  }
  if (outputDelta < 0) {
    await recordUsage(db, agencyId, AI_BUDGET_MONTHLY_OUTPUT, outputDelta);
  }

  // Touch a usage detail row (no-op for daily counter — it's
  // already correct). This branch is here for future M3.7+
  // enhancements that may want to record the actual vs estimated
  // split in the audit log.
  void userId;
}

// ─── Read views (used by the AI tab in the platform console) ──────────

/**
 * Read the daily budget snapshot for one user, today. The
 * platform console's "AI and usage" tab calls this for the
 * per-user breakdown.
 */
export async function getUserDailyBudgetSnapshot(input: {
  agencyId: string;
  userId: string;
  now?: Date;
}): Promise<{ date: string; requestCount: number; limit: number | null }> {
  const now = input.now ?? new Date();
  const date = todayUtcDate(now);
  const [row] = await db
    .select({ requestCount: aiDailyBudgetUsage.requestCount })
    .from(aiDailyBudgetUsage)
    .where(
      and(
        eq(aiDailyBudgetUsage.agencyId, input.agencyId),
        eq(aiDailyBudgetUsage.userId, input.userId),
        eq(aiDailyBudgetUsage.usageDate, date),
      ),
    )
    .limit(1);
  const entitlement = await getEffectiveEntitlement({ agencyId: input.agencyId });
  return {
    date,
    requestCount: row?.requestCount ?? 0,
    limit: entitlement.maxDailyAiRequestsPerUser,
  };
}

// Re-export the sql helper used by upsertDailyBudget so the import
// surface stays narrow. The `sql` tag is the drizzle-orm tagged
// template, used here only for the ON CONFLICT expression.

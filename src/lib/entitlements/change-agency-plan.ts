import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  agencies,
  agencyEntitlements,
  agencyEntitlementChanges,
  platformAuditEvents,
  platformPlanTemplates,
} from "@/lib/db/schema";
import {
  AgencyNotActiveError,
  AgencyNotFoundError,
  OverrideShapeSchema,
  type AgencyEntitlementRow,
  type EffectiveEntitlement,
  type OverrideShape,
  type PlatformPlanTemplateRow,
} from "./types";
import { loadEntitlementForUpdate } from "./get-effective-entitlement";

/**
 * M2.2 — changeAgencyPlan service.
 *
 * One DB transaction. Three rows, written in order:
 *
 *   1. Lock the agency_entitlement row (SELECT ... FOR UPDATE).
 *   2. Read the agency to check the lifecycle state. If the
 *      agency is suspended or archived, throw `AgencyNotActiveError`
 *      and let the transaction roll back. No entitlement change,
 *      no change row, and no audit row are written.
 *   3. Verify the new plan template exists (the FK on the
 *      entitlement column would catch this anyway, but a clean
 *      error message is friendlier than a generic FK violation).
 *   4. Compute the replacement override set and the "after"
 *      entitlement row. A lower limit never deletes or hides
 *      existing tenant data; quota checks block only new growth.
 *   5. UPDATE the entitlement row to the new plan + merged
 *      overrides. The `effective_since` column is reset to NOW().
 *   6. INSERT a `agency_entitlement_change` row with full
 *      before / after JSONB snapshots, the actor, and the reason.
 *   7. INSERT a `platform_audit_event` row with action
 *      `entitlement.change`, target `{ type: 'agency', id: agencyId }`,
 *      and the same before / after.
 *
 * If anything between step 5 and step 7 throws, the drizzle
 * transaction rolls back. The append-only triggers do not interfere
 * with the INSERTs (they only fire on UPDATE / DELETE).
 *
 * Returns the new entitlement row + the change row + the audit
 * event row so the caller can render the success state without
 * re-reading.
 *
 * Lifecycle state is stored in typed agency columns and checked
 * inside the same transaction as the entitlement mutation.
 *
 * `currentUsage` remains accepted for compatibility with the first
 * M2.2 draft. It is deliberately not used to reject a plan change:
 * null means unlimited, and lowering a finite limit below current
 * usage creates an over-limit state while preserving existing data.
 */

/**
 * The "complete removal" detection table. The M2.2 spec defines a
 * hard error (vs an over-limit state) when a numeric limit changes
 * from non-null to null. Each entry maps the resource name (the
 * M2.3 `agency_usage_threshold_event.resource` vocabulary) to the
 * field accessor on `EffectiveEntitlement`.
 *
 * The 8-platform per-platform record is intentionally NOT in this
 * table: removing a per-platform cap (e.g. from 3 to null) is a
 * loosening, not a tightening. The M2.2 spec only requires the
 * error for "completely remove" which means a previously-bounded
 * limit becomes unbounded — the opposite of a removal.
 */

export const ChangeAgencyPlanInputSchema = z.object({
  agencyId: z.string().uuid(),
  planTemplateId: z.string().uuid(),
  overrides: OverrideShapeSchema.optional(),
  reason: z.string().min(1).max(500),
  actorUserId: z.string().uuid(),
  /**
   * Optional current-usage map keyed by resource name (the same
   * vocabulary `agency_usage_threshold_event.resource` uses).
   * M2.3 will populate this; until then, omit it.
   */
  currentUsage: z.record(z.string(), z.number().int().nonnegative()).optional(),
});

export type ChangeAgencyPlanInput = z.infer<typeof ChangeAgencyPlanInputSchema>;

export interface ChangeAgencyPlanResult {
  entitlement: AgencyEntitlementRow;
  change: {
    id: string;
    agencyId: string;
    actorUserId: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    reason: string;
    createdAt: Date;
  };
  audit: {
    id: string;
    actorUserId: string;
    action: string;
    target: { type: string; id: string };
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    createdAt: Date;
  };
}

export async function changeAgencyPlan(
  input: ChangeAgencyPlanInput,
): Promise<ChangeAgencyPlanResult> {
  // Validate the input shape at the public API boundary. The
  // throw-on-failure path lets the caller's `try / catch` handle
  // bad input the same as domain errors.
  const parsed = ChangeAgencyPlanInputSchema.parse(input);

  return db.transaction(async (tx) => {
    // 1. Lock the agency entitlement row.
    const existing = await loadEntitlementForUpdate(parsed.agencyId, tx);
    if (!existing) {
      // No entitlement row → no agency to change. The agency
      // either doesn't exist or hasn't been provisioned yet. The
      // add-agency flow (M2.5) creates the row in the same
      // transaction as the agency; if M2.5 hasn't run, we throw.
      throw new AgencyNotFoundError(parsed.agencyId);
    }

    // 2. Read the agency to check lifecycle state. The transaction
    //    rolls back if the agency is suspended / archived; the
    //    throw is the only "side effect" (the caller sees the
    //    error). No audit row is written for a rejected change —
    //    the M2.2 spec does not require it and the platform
    //    console (M2.7) can surface rejections via its own log.
    const lifecycle = await readAgencyLifecycle(tx, parsed.agencyId);
    if (lifecycle.suspendedAt) {
      throw new AgencyNotActiveError(parsed.agencyId, "suspended");
    }
    if (lifecycle.archivedAt) {
      throw new AgencyNotActiveError(parsed.agencyId, "archived");
    }

    // 3. Verify the plan template exists and load the CURRENT
    //    plan template too (the entitlement row points at it
    //    before the change). The FK on the entitlement column
    //    would catch a missing new template anyway, but we want
    //    a clean "plan not found" error rather than a generic FK
    //    violation.
    const [planTemplate] = await tx
      .select({
        id: platformPlanTemplates.id,
        slug: platformPlanTemplates.slug,
        name: platformPlanTemplates.name,
        defaultLimits: platformPlanTemplates.defaultLimits,
      })
      .from(platformPlanTemplates)
      .where(eq(platformPlanTemplates.id, parsed.planTemplateId))
      .limit(1);
    if (!planTemplate) {
      throw new Error(`Plan template ${parsed.planTemplateId} not found`);
    }
    const newPlanTemplateRow: PlatformPlanTemplateRow = {
      id: planTemplate.id,
      slug: planTemplate.slug,
      name: planTemplate.name,
      defaultLimits: (planTemplate.defaultLimits as OverrideShape | null) ?? null,
    };

    // Load the CURRENT plan template so the "before" snapshot is
    // computed against the same plan the agency is actually on
    // right now. This is what the read-side would have seen
    // before the change.
    const [currentPlanTemplate] = await tx
      .select({
        id: platformPlanTemplates.id,
        slug: platformPlanTemplates.slug,
        name: platformPlanTemplates.name,
        defaultLimits: platformPlanTemplates.defaultLimits,
      })
      .from(platformPlanTemplates)
      .where(eq(platformPlanTemplates.id, existing.planTemplateId))
      .limit(1);
    if (!currentPlanTemplate) {
      // The FK on agency_entitlement.planTemplateId is ON DELETE
      // RESTRICT, so a missing template would mean a corrupted
      // DB. Surface as a generic error so the transaction rolls
      // back.
      throw new Error(`Current plan template ${existing.planTemplateId} not found`);
    }
    const currentPlanTemplateRow: PlatformPlanTemplateRow = {
      id: currentPlanTemplate.id,
      slug: currentPlanTemplate.slug,
      name: currentPlanTemplate.name,
      defaultLimits: (currentPlanTemplate.defaultLimits as OverrideShape | null) ?? null,
    };

    // 4. Treat the submitted overrides as a full replacement.
    //    Carrying old overrides into a different plan would make
    //    the selected plan's defaults unexpectedly ineffective.
    const nextOverrides = mergeOverrides(existing.overrides, parsed.overrides);

    // 5. Build the post-change entitlement row.
    const afterRow: AgencyEntitlementRow = {
      ...existing,
      planTemplateId: newPlanTemplateRow.id,
      overrides: nextOverrides,
    };

    // 6. Compute the before / after snapshots for the change +
    //    audit rows. The snapshot is the raw entitlement row +
    //    plan template — not the merged shape — because the
    //    change row is meant to be replayable: the audit reader
    //    applies the merge themselves with the plan template.
    const before = snapshotOf(existing, currentPlanTemplateRow);
    const after = snapshotOf(afterRow, newPlanTemplateRow);

    // 8. UPDATE the entitlement row. `overrides` is typed as
    //    `OverrideShape | null` at the service layer; the column
    //    accepts the wider `Record<string, unknown> | null`
    //    shape. We cast at the DB boundary rather than loosening
    //    the service type so the rest of the code keeps the
    //    narrow contract.
    const [updated] = await tx
      .update(agencyEntitlements)
      .set({
        planTemplateId: newPlanTemplateRow.id,
        overrides: nextOverrides as Record<string, unknown> | null,
        effectiveSince: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agencyEntitlements.agencyId, parsed.agencyId))
      .returning({
        agencyId: agencyEntitlements.agencyId,
        planTemplateId: agencyEntitlements.planTemplateId,
        overrides: agencyEntitlements.overrides,
        hardStopPercent: agencyEntitlements.hardStopPercent,
        gracePolicy: agencyEntitlements.gracePolicy,
      });
    if (!updated) {
      // Should not happen — we locked the row above. Treat as a
      // generic failure so the transaction rolls back.
      throw new Error(`Entitlement ${parsed.agencyId} disappeared mid-transaction`);
    }
    const updatedRow: AgencyEntitlementRow = {
      agencyId: updated.agencyId,
      planTemplateId: updated.planTemplateId,
      overrides: (updated.overrides as OverrideShape | null) ?? null,
      hardStopPercent: updated.hardStopPercent,
      gracePolicy: updated.gracePolicy,
    };

    // 9. INSERT the change row. The before/after are full JSONB
    //    snapshots — the audit reader can replay the change
    //    without the original Postgres row.
    const [change] = await tx
      .insert(agencyEntitlementChanges)
      .values({
        agencyId: parsed.agencyId,
        actorUserId: parsed.actorUserId,
        before,
        after,
        reason: parsed.reason,
      })
      .returning();
    if (!change) {
      throw new Error("Failed to insert agency_entitlement_change");
    }

    // 10. INSERT the platform audit event. The target is a
    //     controlled-vocabulary shape (`type: 'agency'`).
    const [audit] = await tx
      .insert(platformAuditEvents)
      .values({
        actorUserId: parsed.actorUserId,
        action: "entitlement.change",
        target: { type: "agency", id: parsed.agencyId },
        before,
        after: { ...after, reason: parsed.reason },
      })
      .returning();
    if (!audit) {
      throw new Error("Failed to insert platform_audit_event");
    }

    return {
      entitlement: updatedRow,
      change: {
        id: change.id,
        agencyId: change.agencyId,
        actorUserId: change.actorUserId!,
        before: change.before as Record<string, unknown>,
        after: change.after as Record<string, unknown>,
        reason: change.reason,
        createdAt: change.createdAt,
      },
      audit: {
        id: audit.id,
        actorUserId: audit.actorUserId!,
        action: audit.action,
        target: audit.target as { type: string; id: string },
        before: (audit.before as Record<string, unknown> | null) ?? null,
        after: (audit.after as Record<string, unknown> | null) ?? null,
        createdAt: audit.createdAt,
      },
    };
  });
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Read the agency's typed lifecycle columns.
 */
async function readAgencyLifecycle(
  tx: Pick<typeof db, "select">,
  agencyId: string,
): Promise<{ suspendedAt: string | null; archivedAt: string | null }> {
  const [row] = await tx
    .select({ suspendedAt: agencies.suspendedAt, archivedAt: agencies.archivedAt })
    .from(agencies)
    .where(eq(agencies.id, agencyId))
    .limit(1);
  return {
    suspendedAt: row?.suspendedAt?.toISOString() ?? null,
    archivedAt: row?.archivedAt?.toISOString() ?? null,
  };
}

/**
 * Resolve the submitted override payload.
 *
 *   - new payload is `{}` → result is `null` (the canonical
 *     "use plan defaults" state)
 *   - new payload is missing entirely → result is the existing
 *     (a no-op call)
 */
function mergeOverrides(
  existing: OverrideShape | null,
  next: OverrideShape | undefined,
): OverrideShape | null {
  if (!next) return existing;
  if (Object.keys(next).length === 0) return null;
  return next;
}

/**
 * The "complete removal" detection table. The M2.2 spec defines a
 * hard error (vs an over-limit state) when a numeric limit changes
 * from non-null to null. Each entry maps the resource name (the
 * M2.3 `agency_usage_threshold_event.resource` vocabulary) to the
 * field accessor on `EffectiveEntitlement`.
 */
const NUMERIC_LIMIT_FIELDS = [
  { resource: "workspaces", get: (m: EffectiveEntitlement) => m.maxWorkspaces },
  { resource: "users", get: (m: EffectiveEntitlement) => m.maxUsers },
  {
    resource: "total_social_profiles",
    get: (m: EffectiveEntitlement) => m.maxSocialProfiles,
  },
  {
    resource: "storage_bytes",
    get: (m: EffectiveEntitlement) => m.maxStorageBytes,
  },
  {
    resource: "monthly_ai_requests",
    get: (m: EffectiveEntitlement) => m.maxMonthlyAiRequests,
  },
  {
    resource: "monthly_ai_input_tokens",
    get: (m: EffectiveEntitlement) => m.maxMonthlyAiInputTokens,
  },
  {
    resource: "monthly_ai_output_tokens",
    get: (m: EffectiveEntitlement) => m.maxMonthlyAiOutputTokens,
  },
  {
    resource: "daily_ai_requests_per_user",
    get: (m: EffectiveEntitlement) => m.maxDailyAiRequestsPerUser,
  },
  {
    resource: "max_output_tokens_per_request",
    get: (m: EffectiveEntitlement) => m.maxOutputTokensPerRequest,
  },
] as const;

/**
 * Find every resource whose limit goes from a non-null number
 * (the "before" entitlement) to `null` (the "after" entitlement).
 * A pure function so the unit tests can pin every branch without
 * any DB or clock infrastructure.
 *
 * Returns the list of resources that would be a "complete removal"
 * for the caller to check usage against. The per-platform record
 * is intentionally NOT included — a per-platform cap going from
 * a number to null is a loosening, not a removal.
 */
export function findRemovedLimits(
  before: EffectiveEntitlement,
  after: EffectiveEntitlement,
): ReadonlyArray<string> {
  const removed: string[] = [];
  for (const { resource, get } of NUMERIC_LIMIT_FIELDS) {
    const beforeLimit = get(before);
    const afterLimit = get(after);
    if (beforeLimit !== null && afterLimit === null) {
      removed.push(resource);
    }
  }
  return removed;
}

/**
 * Build the JSONB snapshot of an entitlement row + its plan
 * template. The shape mirrors the merge function's input so an
 * audit-log reader can replay the merge without the original
 * Postgres rows.
 *
 * The snapshot is intentionally redundant with the entitlement
 * columns — `plan_template_id` and `overrides` are the canonical
 * state, the rest is denormalized for the audit reader's
 * convenience. The keys are snake_case to match the JSONB shape
 * contract documented in `src/lib/db/schema/plans.ts` (the
 * `default_limits` JSONB uses snake_case for every key).
 */
function snapshotOf(
  row: AgencyEntitlementRow,
  planTemplate: PlatformPlanTemplateRow,
): Record<string, unknown> {
  return {
    agency_id: row.agencyId,
    plan_template_id: row.planTemplateId,
    plan_template_slug: planTemplate.slug,
    plan_template_name: planTemplate.name,
    overrides: row.overrides,
    hard_stop_percent: row.hardStopPercent,
    grace_policy: row.gracePolicy,
  };
}

/**
 * M2.2 — Entitlement service barrel.
 *
 * Re-exports the public surface of the entitlement service so
 * downstream milestones can `import { ... } from
 * "@/lib/entitlements"`. The barrel is the contract — adding
 * exports here is a deliberate API decision.
 *
 * The two functions are:
 *
 *   - `getEffectiveEntitlement(agencyId)` reads the resolved
 *     limits for an agency. Used by M2.4 (transactional
 *     enforcement), M2.7 (platform console Plan tab), M2.8
 *     (AI tab), M2.9 (read-only Plan/Usage screen).
 *
 *   - `changeAgencyPlan({...})` writes a new plan + overrides in
 *     one transaction. Used by M2.5 (add-agency flow), M2.7
 *     (plan-change modal).
 *
 * Errors are exported as classes so callers can `instanceof`
 * them without a string match.
 */

export {
  // The DB-bound read.
  getEffectiveEntitlement,
  // The pure merge — exported for the change-plan service's
  // internal use; not part of the public API.
  mergeEntitlement,
} from "./get-effective-entitlement";
export type { MergeInput } from "./get-effective-entitlement";

export {
  changeAgencyPlan,
  findRemovedLimits,
  ChangeAgencyPlanInputSchema,
} from "./change-agency-plan";
export type { ChangeAgencyPlanInput, ChangeAgencyPlanResult } from "./change-agency-plan";

export {
  // Types
  ALL_AI_CAPABILITIES,
  ALL_PLATFORM_KEYS,
  AgencyNotFoundError,
  AgencyNotActiveError,
  LimitExceededError,
  // Zod schemas
  OverrideShapeSchema,
  AgencyEntitlementRowSchema,
  PlatformPlanTemplateRowSchema,
} from "./types";
export type {
  EffectiveEntitlement,
  AgencyEntitlementRow,
  PlatformPlanTemplateRow,
  PlatformKey,
  AiCapability,
  GracePolicyWire,
  OverrideShape,
  AgencyLifecycle,
} from "./types";

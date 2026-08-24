/**
 * M3.3 — AI governance barrel.
 *
 * Public surface for the AI budget + capability intersection
 * enforcement. The /api/ai/generate route and the platform
 * console's "AI and usage" tab both import from this barrel.
 */

export {
  // Capability intersection
  resolveEnabledCapabilities,
  loadEnabledCapabilities,
  // Per-user daily budget
  enforceAiBudget,
  reconcileAiBudget,
  getUserDailyBudgetSnapshot,
  // Schemas / types
  AiBudgetReservationSchema,
} from "./governance";
export type { AiBudgetReservation } from "./governance";

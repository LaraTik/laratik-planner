/**
 * M3 — Support access workflow barrel.
 *
 * The platform console (security/audit area), the agency admin
 * surface (request/approval notifications), and every tenant
 * view that a platform admin might hit all import from this
 * barrel. Keep it narrow; the implementation lives in
 * `./access.ts`.
 */

export {
  // Constants
  SUPPORT_ACCESS_AUTOMATIC_EXPIRY_PENDING_DAYS,
  SUPPORT_ACCESS_DEFAULT_DURATION_HOURS,
  SUPPORT_ACCESS_REQUEST_DURATION_LIMIT_HOURS,
  // Schemas
  CreateSupportAccessRequestSchema,
  SupportAccessDecisionSchema,
  SupportAccessRequestRow,
  SupportAccessGrantRow,
  // Errors
  SupportAccessError,
  SupportAccessErrorCode,
  // Core service
  createSupportAccessRequest,
  decideSupportAccessRequest,
  revokeSupportAccessGrant,
  expireStaleSupportAccessGrants,
  findActiveSupportAccessGrant,
  listRequestsForAgency,
  listRequestsByPlatformAdmin,
  listActiveGrantsForActor,
  listActiveAgencyIds,
  listRecentAuditForActor,
  listRecentSupportAuditAsPlatform,
  authorizePlatformTenantView,
  authorizePlatformDownload,
  recordSupportAccessAudit,
  // Audit vocabulary
  SupportAccessAuditAction,
} from "./access";
export type {
  CreateSupportAccessRequestInput,
  SupportAccessDecision,
  SupportAccessDecisionInput,
  RecordSupportAccessAuditInput,
  SupportAccessAuditAction as SupportAccessAuditActionType,
} from "./access";

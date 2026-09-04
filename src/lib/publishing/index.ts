/**
 * M4 — Publish-ready Post and Reel packages barrel.
 *
 * Public surface for the M4 implementation. The route layer
 * (`/app/w/[slug]/planning/[id]/publish/page.tsx`) imports from
 * this barrel; the service tests import from the same surface.
 *
 * The barrel is the contract: any consumer that needs to read
 * or write a platform payload, gate a "Ready for publishing"
 * transition, or route through the materiality service goes
 * through here.
 */

export {
  // Zod schemas (M4.1)
  PlatformPayloadSchema,
  CommonPublishingFieldsSchema,
  InstagramPostPayloadSchema,
  InstagramReelPayloadSchema,
  FacebookPayloadSchema,
  TikTokPayloadSchema,
  LinkedInPayloadSchema,
  YouTubePayloadSchema,
  PinterestPayloadSchema,
  XPayloadSchema,
  OtherPayloadSchema,
  PLATFORM_KEYS,
  // Platform payload service (M4.2)
  SavePlatformPayloadInputSchema,
  FinalCopyApprovalInputSchema,
  savePlatformPayload,
  setFinalCopyApproval,
  readPlatformPayload,
  readAllChannelPayloads,
  readAllChannelPayloadStates,
  clearChannelPayload,
  PlatformPayloadError,
  // Materiality service (M4.3)
  MATERIAL_RESOURCES,
  MATERIAL_RESOURCE_PLATFORM_PAYLOAD,
  MaterialityReasonCodeSchema,
  recordMaterialityEvent,
  recordNonMaterialityEvent,
  listMaterialEdits,
  newMaterialityCorrelationId,
  MaterialityError,
  // Readiness service (M4.4)
  ReadinessReportSchema,
  ReadinessIssueSchema,
  ChannelReadinessSchema,
  ReadinessIssueSeveritySchema,
  evaluateReadiness,
  ConfirmPublishReadinessInputSchema,
  confirmPublishReadiness,
  foldAiSuggestions,
  ReadinessError,
} from "./materiality-helpers";

// FEAT-17 (GAP-FULL-REVIEW-2026-08-25) — per-platform publishing
// adapter slot. The LinkedIn + X stubs ship today; the M4.5 worker
// will replace their bodies with real provider calls.
export {
  LinkedInPublishingAdapter,
  XPublishingAdapter,
  publishingAdapterRegistry,
  isSupportedPlatform,
} from "./adapters";

// Publication records — read by the planning detail page
// (so the per-channel "outcome" card can render), written by
// the publish-side actions. Lives in `service.ts`, not
// `materiality-helpers.ts`, because the publication history
// is a separate concern from material edits.
export {
  listPublicationsForItem,
  recordPublication,
  RecordPublicationSchema,
  type RecordPublicationInput,
} from "./service";
export type {
  PublishingAdapter,
  PublishResult,
  PublishFailureReason,
  SupportedPlatform,
} from "./adapters";

// Type re-exports.
export type {
  PlatformPayload,
  InstagramPostPayload,
  InstagramReelPayload,
  FacebookPayload,
  TikTokPayload,
  LinkedInPayload,
  YouTubePayload,
  PinterestPayload,
  XPayload,
  OtherPayload,
  CommonPublishingFields,
  DeliveryReference,
  Disclosure,
  ApprovalState,
  PublicationMethod,
  SavePlatformPayloadInput,
  FinalCopyApprovalInput,
  MaterialResource,
  MaterialityReasonCode,
  RecordMaterialityEventInput,
  RecordNonMaterialityEventInput,
  ReadinessReport,
  ReadinessIssue,
  ChannelReadiness,
  ReadinessIssueSeverity,
  ReadinessInput,
  ConfirmPublishReadinessInput,
} from "./materiality-helpers";

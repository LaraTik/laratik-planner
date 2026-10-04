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
  SavePlatformPayloadBatchEntrySchema,
  SavePlatformPayloadBatchInputSchema,
  FinalCopyApprovalInputSchema,
  savePlatformPayload,
  savePlatformPayloadsBatch,
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
  recordMaterialityEventInTx,
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

// Publish surface UI contracts. `blocker-targets` is the canonical
// readiness-issue → control map (no generic `#publishing` fallback, so a
// Fix link can never dead-end); `platform-required-fields` describes the
// per-platform schema fields the form must expose so YouTube and
// Pinterest packages are saveable at all.
export {
  // Blocker → control map
  PUBLISH_FIELD_ANCHORS,
  WORKSPACE_SECTION_ANCHORS,
  KNOWN_BLOCKER_PATHS,
  normaliseBlockerPath,
  resolveBlockerTarget,
  readinessAnchorForPath,
  isManualDispatchBlocker,
} from "./blocker-targets";
export type { PublishBlockerKind, PublishBlockerTarget } from "./blocker-targets";

// Per-platform required fields
export {
  PLATFORM_REQUIRED_FIELDS,
  PLATFORM_RIGHTS_CHECKBOXES,
  requiredFieldsFor,
  rightsCheckboxesFor,
  readPlatformField,
  readRightsFlag,
  validateRequiredFields,
} from "./platform-required-fields";
export type {
  PlatformFieldKind,
  PlatformRequiredField,
  PlatformRightsCheckbox,
} from "./platform-required-fields";

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
  SavePlatformPayloadBatchInput,
  SavePlatformPayloadBatchEntry,
  BatchChannelResult,
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

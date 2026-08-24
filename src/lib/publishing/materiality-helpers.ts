/**
 * M4 barrel re-exports. This module exists so the
 * `src/lib/publishing/index.ts` barrel can expose the full
 * public surface in a single import without pulling every
 * transitive dep of the service modules into every consumer.
 */
export {
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
  type PlatformPayload,
  type InstagramPostPayload,
  type InstagramReelPayload,
  type FacebookPayload,
  type TikTokPayload,
  type LinkedInPayload,
  type YouTubePayload,
  type PinterestPayload,
  type XPayload,
  type OtherPayload,
  type CommonPublishingFields,
  type DeliveryReference,
  type Disclosure,
  type ApprovalState,
  type PublicationMethod,
} from "./payload-schemas";
export {
  SavePlatformPayloadInputSchema,
  savePlatformPayload,
  readPlatformPayload,
  readAllChannelPayloads,
  clearChannelPayload,
  PlatformPayloadError,
  type SavePlatformPayloadInput,
} from "./platform-payload-service";
export {
  MATERIAL_RESOURCES,
  MATERIAL_RESOURCE_PLATFORM_PAYLOAD,
  MaterialityReasonCodeSchema,
  RecordNonMaterialityEventInputSchema,
  recordMaterialityEvent,
  recordNonMaterialityEvent,
  listMaterialEdits,
  newMaterialityCorrelationId,
  MaterialityError,
  type MaterialResource,
  type MaterialityReasonCode,
  type RecordMaterialityEventInput,
  type RecordNonMaterialityEventInput,
} from "./materiality";
export {
  ReadinessReportSchema,
  ReadinessIssueSchema,
  ChannelReadinessSchema,
  ReadinessIssueSeveritySchema,
  evaluateReadiness,
  foldAiSuggestions,
  ReadinessError,
  type ReadinessReport,
  type ReadinessIssue,
  type ChannelReadiness,
  type ReadinessIssueSeverity,
  type ReadinessInput,
} from "./readiness";

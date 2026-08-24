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
  savePlatformPayload,
  readPlatformPayload,
  readAllChannelPayloads,
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
  foldAiSuggestions,
  ReadinessError,
} from "./materiality-helpers";

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
  MaterialResource,
  MaterialityReasonCode,
  RecordMaterialityEventInput,
  RecordNonMaterialityEventInput,
  ReadinessReport,
  ReadinessIssue,
  ChannelReadiness,
  ReadinessIssueSeverity,
  ReadinessInput,
} from "./materiality-helpers";

/** Client-safe projection of the saved provider configuration. Secret material
 * stays server-side and is deliberately absent from this type. */
export type ProviderConfigSummary = {
  appId: string;
  loginConfigId: string | null;
  graphApiVersion: string | null;
  enabled: boolean;
  publishingEnabled: boolean;
  appReviewStatus: "not_requested" | "pending" | "approved" | "rejected";
  businessVerificationStatus: "not_required" | "not_started" | "pending" | "verified" | "rejected";
  lastTestedAt: Date | null;
  lastTestedOk: boolean | null;
  lastTestErrorCode: string | null;
  configuredBy: string;
  updatedAt: Date;
};

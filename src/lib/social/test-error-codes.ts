/**
 * Stable codes returned by the user-triggered channel validation path.
 * User-facing prose belongs to the active interface catalog, not this
 * domain module, so this file is safe to import from client components.
 */
export type TestErrorCode =
  | "auth_expired"
  | "permission_denied"
  | "rate_limited"
  | "provider_unavailable"
  | "not_found"
  | "invalid_response"
  | "platform_kek_missing"
  | "social_not_enabled"
  | "provider_not_configured"
  | "not_configured"
  | "no_connection"
  | "not_connected"
  | "unknown";

export const TEST_ERROR_CODES: readonly TestErrorCode[] = [
  "auth_expired",
  "permission_denied",
  "rate_limited",
  "provider_unavailable",
  "not_found",
  "invalid_response",
  "platform_kek_missing",
  "social_not_enabled",
  "provider_not_configured",
  "not_configured",
  "no_connection",
  "not_connected",
  "unknown",
] as const;

export const TEST_ERROR_COPY: Record<TestErrorCode, { key: string; fallback: string }> = {
  auth_expired: {
    key: "users.channelsErrors.retest.auth_expired",
    fallback: "Your Meta access has expired. Reconnect to resume.",
  },
  permission_denied: {
    key: "users.channelsErrors.retest.permission_denied",
    fallback:
      "The connected account is missing the analytics permission. Reconnect and grant access.",
  },
  rate_limited: {
    key: "users.channelsErrors.retest.rate_limited",
    fallback: "Meta is rate-limiting this account. The next scheduled sync will retry.",
  },
  provider_unavailable: {
    key: "users.channelsErrors.retest.provider_unavailable",
    fallback: "Meta is temporarily unavailable. Try again in a few minutes.",
  },
  not_found: {
    key: "users.channelsErrors.retest.not_found",
    fallback: "The connected account could not be found. It may have been deleted or renamed.",
  },
  invalid_response: {
    key: "users.channelsErrors.retest.invalid_response",
    fallback:
      "Meta returned an unrecognized response. The endpoint may be temporarily unavailable; try again in a few minutes.",
  },
  platform_kek_missing: {
    key: "users.channelsErrors.retest.platform_kek_missing",
    fallback: "Platform credential envelope is not configured. Contact your agency admin.",
  },
  social_not_enabled: {
    key: "users.channelsErrors.retest.social_not_enabled",
    fallback: "Social sync is not enabled for this agency. Contact your agency admin.",
  },
  provider_not_configured: {
    key: "users.channelsErrors.retest.provider_not_configured",
    fallback:
      "This agency has no provider configuration for analytics. Ask an agency admin to configure it.",
  },
  not_configured: {
    key: "users.channelsErrors.retest.not_configured",
    fallback:
      "This channel's analytics are not configured. Ask your agency admin to check the app credentials in Agency Settings, or ask Meta to enable the missing insights metric for the app.",
  },
  no_connection: {
    key: "users.channelsErrors.retest.no_connection",
    fallback: "This channel is not currently linked to a provider grant.",
  },
  not_connected: {
    key: "users.channelsErrors.retest.not_connected",
    fallback: "This channel is not in a connected state. Reconnect to resume.",
  },
  unknown: {
    key: "users.channelsErrors.retest.unknown",
    fallback: "The validation request failed. Try again, or check the system status.",
  },
};

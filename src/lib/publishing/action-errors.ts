/**
 * Stable error codes crossing the publish Server Action boundary.
 *
 * Actions must return codes, not domain exception messages. The client
 * resolves these codes through the active message catalog, while logs may
 * retain the technical exception details server-side.
 */
export type PublishActionErrorCode =
  | "authRequired"
  | "invalidPublishRequest"
  | "workspaceNotFound"
  | "invalidPlatformPayload"
  | "forbidden"
  | "publishNotFound"
  | "crossChannel"
  | "saveFailed"
  | "invalidInternalNote"
  | "recordNoteFailed"
  | "invalidApprovalRequest"
  | "approvalFailed"
  | "invalidReadinessRequest"
  | "readinessForbidden"
  | "readinessNotFound"
  | "readinessInvalid"
  | "readinessFailed";

export function platformPayloadErrorCode(
  code: "INVALID" | "NOT_FOUND" | "FORBIDDEN" | "CROSS_CHANNEL",
): PublishActionErrorCode {
  switch (code) {
    case "FORBIDDEN":
      return "forbidden";
    case "NOT_FOUND":
      return "publishNotFound";
    case "CROSS_CHANNEL":
      return "crossChannel";
    case "INVALID":
      return "invalidPlatformPayload";
  }
}

export function readinessErrorCode(
  code: "FORBIDDEN" | "NOT_FOUND" | "INVALID",
): PublishActionErrorCode {
  switch (code) {
    case "FORBIDDEN":
      return "readinessForbidden";
    case "NOT_FOUND":
      return "readinessNotFound";
    case "INVALID":
      return "readinessInvalid";
  }
}

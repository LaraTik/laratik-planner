export const UPLOAD_INTENT_STATUSES = [
  "reserved",
  "uploaded",
  "completed",
  "failed",
  "expired",
  "aborted",
] as const;

export type UploadIntentStatus = (typeof UPLOAD_INTENT_STATUSES)[number];

const TRANSITIONS: Record<UploadIntentStatus, readonly UploadIntentStatus[]> = {
  reserved: ["uploaded", "failed", "expired", "aborted"],
  uploaded: ["completed", "failed", "expired", "aborted"],
  completed: [],
  failed: [],
  expired: [],
  aborted: [],
};

export function assertUploadIntentTransition(
  from: UploadIntentStatus,
  to: UploadIntentStatus,
): void {
  if (!TRANSITIONS[from].includes(to))
    throw new Error(`Invalid upload intent transition: ${from} -> ${to}`);
}

export function isUploadIntentExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() < now.getTime();
}

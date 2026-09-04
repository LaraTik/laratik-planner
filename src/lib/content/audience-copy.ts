import { parseFormatPayload, type ContentFormat } from "@/lib/format-payload/schemas";

/** Fields owned by the shared audience-copy surface. */
export const AUDIENCE_COPY_KEYS = [
  "caption",
  "hashtags",
  "firstComment",
  "callToAction",
  "description",
  "location",
] as const;
export type AudienceCopyKey = (typeof AUDIENCE_COPY_KEYS)[number];

export type ChannelCopyStatus = "inherited" | "custom" | "stale";

export function channelCopyStatus(input: {
  hasOverride: boolean;
  sourceRevision?: number | null;
  currentRevision?: number | null;
}): ChannelCopyStatus {
  if (!input.hasOverride) return "inherited";
  if (
    input.sourceRevision != null &&
    input.currentRevision != null &&
    input.sourceRevision < input.currentRevision
  )
    return "stale";
  return "custom";
}

export function isAudienceCopyKey(key: string): key is AudienceCopyKey {
  return (AUDIENCE_COPY_KEYS as readonly string[]).includes(key);
}

export function audienceCopyFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const result = Object.fromEntries(
    AUDIENCE_COPY_KEYS.filter((key) => payload[key] !== undefined).map((key) => [
      key,
      payload[key],
    ]),
  );
  if (payload.translations !== undefined) result.translations = payload.translations;
  return result;
}

/** Merge only canonical copy keys, then run the format schema again. */
export function mergeAudienceCopy(
  format: ContentFormat,
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...current };
  for (const key of AUDIENCE_COPY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      const value = patch[key];
      if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
        delete next[key];
      } else {
        next[key] = value;
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "translations")) {
    if (patch.translations === undefined) delete next.translations;
    else next.translations = patch.translations;
  }
  return parseFormatPayload(format, { ...next, schemaVersion: next.schemaVersion ?? 1 }) as Record<
    string,
    unknown
  >;
}

export function audienceCopyFingerprint(payload: Record<string, unknown>): string {
  return JSON.stringify(audienceCopyFromPayload(payload));
}

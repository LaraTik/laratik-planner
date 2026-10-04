/**
 * Per-platform fields the payload schema requires (or that a readiness
 * rule blocks on) but that the publish form did not previously expose.
 *
 * Before this module, a YouTube or Pinterest channel could be attached
 * to a content item but its package could never be saved:
 * `YouTubePayloadSchema.title` and `PinterestPayloadSchema.pinTitle` /
 * `.boardId` are `z.string().min(1)` with no default, `defaultPayloadFor`
 * seeds them to `""`, and the form had no input. `savePlatformPayload`
 * calls `PlatformPayloadSchema.parse(...)`, which threw a `ZodError` —
 * not a `PlatformPayloadError` — so the action collapsed it to a bare
 * `saveFailed` with no field to fix.
 *
 * This table is the single source of truth for which extra controls the
 * Platform Settings section renders. Every entry is also reachable from
 * `blocker-targets.ts`, so a readiness blocker on one of these fields
 * deep-links to the control that resolves it.
 *
 * Adding a field here means adding a `labelKey` under
 * `contentDetail.publishForm.platformFieldLabels` in both `en` and `ar`
 * (`tests/unit/i18n/catalogs.test.ts` enforces parity).
 */

export type PlatformFieldKind = "text" | "select";

export interface PlatformRequiredField {
  /** Payload key on the platform payload object. */
  key: string;
  /** Catalog key under `contentDetail.publishForm.platformFieldLabels`. */
  labelKey: string;
  kind: PlatformFieldKind;
  /** `z.string().max()` from the schema, for client-side validation. */
  maxLength?: number;
  /** `z.enum()` members, for `kind: "select"`. */
  options?: readonly string[];
  /** `z.string().min()` from the schema — the value a save rejects. */
  minLength?: number;
}

export const PLATFORM_REQUIRED_FIELDS: Readonly<Record<string, readonly PlatformRequiredField[]>> =
  {
    youtube: [
      {
        key: "title",
        labelKey: "youtubeTitle",
        kind: "text",
        minLength: 1,
        maxLength: 100,
      },
      {
        key: "privacy",
        labelKey: "youtubePrivacy",
        kind: "select",
        options: ["public", "unlisted", "private"],
      },
    ],
    pinterest: [
      {
        key: "pinTitle",
        labelKey: "pinterestPinTitle",
        kind: "text",
        minLength: 1,
        maxLength: 100,
      },
      {
        key: "boardId",
        labelKey: "pinterestBoardId",
        kind: "text",
        minLength: 1,
        maxLength: 80,
      },
    ],
    tiktok: [
      {
        key: "privacy",
        labelKey: "tiktokPrivacy",
        kind: "select",
        options: ["public", "friends", "followers_only", "private"],
      },
    ],
  };

/**
 * Rights / review confirmations a readiness rule blocks on, rendered
 * in the Compliance section. These are booleans with a `false` default,
 * so an unedited package is always in violation — which is the point:
 * the operator must positively confirm them.
 */
export interface PlatformRightsCheckbox {
  key: string;
  labelKey: string;
  /** Platforms where this confirmation is meaningful. */
  platforms: readonly string[];
}

export const PLATFORM_RIGHTS_CHECKBOXES: readonly PlatformRightsCheckbox[] = [
  {
    key: "audioRightsConfirmed",
    labelKey: "audioRights",
    platforms: ["instagram_reel"],
  },
  {
    key: "transcriptReviewed",
    labelKey: "transcriptReviewed",
    platforms: ["instagram_reel"],
  },
  {
    key: "musicRightsConfirmed",
    labelKey: "musicRights",
    platforms: ["tiktok"],
  },
];

/** The extra fields a platform needs, or `[]` when it needs none. */
export function requiredFieldsFor(platform: string): readonly PlatformRequiredField[] {
  return PLATFORM_REQUIRED_FIELDS[platform] ?? [];
}

/** The rights checkboxes that apply to a platform. */
export function rightsCheckboxesFor(platform: string): readonly PlatformRightsCheckbox[] {
  return PLATFORM_RIGHTS_CHECKBOXES.filter((entry) => entry.platforms.includes(platform));
}

/** Read a required field's current value off a payload as a string. */
export function readPlatformField(payload: unknown, key: string): string {
  if (!payload || typeof payload !== "object") return "";
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

/** Read a rights checkbox's current boolean off a payload. */
export function readRightsFlag(payload: unknown, key: string): boolean {
  if (!payload || typeof payload !== "object") return false;
  const value = (payload as Record<string, unknown>)[key];
  return value === true;
}

/**
 * Client-side pre-flight mirroring the Zod `min(1)` constraint, so the
 * user sees a field-level message instead of a generic save failure.
 * Returns an error key per field key; empty when the platform is valid.
 */
export function validateRequiredFields(
  platform: string,
  payload: unknown,
  t: (key: string, params?: Record<string, string | number>) => string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of requiredFieldsFor(platform)) {
    if (field.kind !== "text") continue;
    const value = readPlatformField(payload, field.key).trim();
    const min = field.minLength ?? 1;
    if (value.length < min) {
      errors[field.key] = t(
        `contentDetail.publishForm.platformFieldErrors.${field.labelKey}.required`,
      );
    } else if (field.maxLength && value.length > field.maxLength) {
      errors[field.key] = t(
        `contentDetail.publishForm.platformFieldErrors.${field.labelKey}.tooLong`,
        { max: field.maxLength },
      );
    }
  }
  return errors;
}

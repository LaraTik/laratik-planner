/**
 * Canonical blocker → control map for the publish surface.
 *
 * Every `ReadinessIssue` the readiness service emits must resolve to
 * exactly one of three states:
 *
 *   - `field`   — the control that fixes it lives on the publish page
 *                 and is reachable by an in-page anchor.
 *   - `section` — the control lives in another panel of the workspace
 *                 (Assets, Workflow) and is reachable by that panel's
 *                 anchor.
 *   - `manual`  — there is no collectable control at all. The operator
 *                 must publish this platform manually. We render an
 *                 explicit manual-dispatch state instead of a fix link
 *                 that would dead-end on a page with nothing to edit.
 *
 * There is deliberately NO generic fallback. An unmapped path returns
 * `undefined`, and the UI renders no fix affordance rather than a link
 * to a section that cannot fix it. `tests/unit/publishing/
 * readiness-anchor-map.test.ts` asserts that every path the readiness
 * service can emit is present in this map, so the "no dead-end link"
 * rule is mechanically enforced rather than aspirational.
 *
 * Paths in the map are written *normalised* — the `channels[N].`
 * prefix the service prepends is stripped before lookup, so the same
 * entry serves the aggregate panel and the per-channel checklist.
 */

/** Anchors on the publish page itself (form sections). */
export const PUBLISH_FIELD_ANCHORS = {
  caption: "#publish-caption",
  hashtags: "#publish-hashtags",
  altText: "#publish-alt-text",
  disclosures: "#publish-disclosures",
  audioRights: "#publish-audio-rights",
  transcriptReviewed: "#publish-transcript-reviewed",
  musicRights: "#publish-music-rights",
  platformSettings: "#publish-platform-settings",
  approval: "#publish-approval",
  copy: "#publish-copy",
} as const;

/** Anchors owned by other workspace panels. */
export const WORKSPACE_SECTION_ANCHORS = {
  assets: "#assets-versions",
  workflow: "#workflow",
} as const;

export type PublishBlockerKind = "field" | "section" | "manual";

export interface PublishBlockerTarget {
  kind: PublishBlockerKind;
  /**
   * In-page anchor. Present for `field` and `section`.
   * Absent for `manual` — a manual-dispatch row has no fix link.
   */
  anchor?: string;
  /** Catalog key (under `contentDetail.publishReadiness`) for the row's action label. */
  labelKey: string;
}

/**
 * Keyed by the normalised path suffix emitted by `readiness.ts`:
 * `payload.*`, `disclosures.*`, the bare `payload`, and
 * `approvedDeliveryVersion`. Prefixes are `channels[N].`,
 * `delivery.`, and `approvals.`.
 */
const BLOCKER_TARGETS: Readonly<Record<string, PublishBlockerTarget>> = {
  // ─── Editable on the publish page ───────────────────────────────────
  "payload.caption": {
    kind: "field",
    anchor: PUBLISH_FIELD_ANCHORS.caption,
    labelKey: "fixInPackage",
  },
  "payload.altText": {
    kind: "field",
    anchor: PUBLISH_FIELD_ANCHORS.altText,
    labelKey: "fixInPackage",
  },
  "payload.approval.finalCopyApproved": {
    kind: "field",
    anchor: PUBLISH_FIELD_ANCHORS.approval,
    labelKey: "fixInPackage",
  },
  "payload.audioRightsConfirmed": {
    kind: "field",
    anchor: PUBLISH_FIELD_ANCHORS.audioRights,
    labelKey: "fixInPackage",
  },
  "payload.transcriptReviewed": {
    kind: "field",
    anchor: PUBLISH_FIELD_ANCHORS.transcriptReviewed,
    labelKey: "fixInPackage",
  },
  "payload.musicRightsConfirmed": {
    kind: "field",
    anchor: PUBLISH_FIELD_ANCHORS.musicRights,
    labelKey: "fixInPackage",
  },
  "payload.privacy": {
    kind: "field",
    anchor: PUBLISH_FIELD_ANCHORS.platformSettings,
    labelKey: "fixInPackage",
  },
  "payload.title": {
    kind: "field",
    anchor: PUBLISH_FIELD_ANCHORS.platformSettings,
    labelKey: "fixInPackage",
  },
  "payload.pinTitle": {
    kind: "field",
    anchor: PUBLISH_FIELD_ANCHORS.platformSettings,
    labelKey: "fixInPackage",
  },
  "payload.boardId": {
    kind: "field",
    anchor: PUBLISH_FIELD_ANCHORS.platformSettings,
    labelKey: "fixInPackage",
  },
  // Channel-level payload defects (no payload saved / no platform tag /
  // stored payload invalid for the current schema).
  payload: {
    kind: "field",
    anchor: PUBLISH_FIELD_ANCHORS.platformSettings,
    labelKey: "fixInPackage",
  },
  "disclosures.rightsConfirmed": {
    kind: "field",
    anchor: PUBLISH_FIELD_ANCHORS.disclosures,
    labelKey: "fixInPackage",
  },
  "disclosures.syntheticMedia": {
    kind: "field",
    anchor: PUBLISH_FIELD_ANCHORS.disclosures,
    labelKey: "fixInPackage",
  },

  // ─── Editable in another panel ──────────────────────────────────────
  "payload.coverFrame": {
    kind: "section",
    anchor: WORKSPACE_SECTION_ANCHORS.assets,
    labelKey: "fixInAssets",
  },
  "payload.thumbnail": {
    kind: "section",
    anchor: WORKSPACE_SECTION_ANCHORS.assets,
    labelKey: "fixInAssets",
  },
  approvedDeliveryVersion: {
    kind: "section",
    anchor: WORKSPACE_SECTION_ANCHORS.assets,
    labelKey: "fixInAssets",
  },
  // Both `no_approved_delivery` and `delivery_version_missing`.
  "approvals.openCount": {
    kind: "section",
    anchor: WORKSPACE_SECTION_ANCHORS.workflow,
    labelKey: "fixInWorkflow",
  },

  // ─── Not collectable in v1 — manual dispatch ────────────────────────
  // Facebook / LinkedIn / Instagram Reel / Other require a
  // `selectedDestinationProfile`, which is resolved at channel-link
  // time and has no control on the publish page. Rendering a fix link
  // here would send the operator to a page with nothing to change.
  "payload.destinationProfile": { kind: "manual", labelKey: "fixManually" },
};

/** Every normalised path the map knows about — the test surface. */
export const KNOWN_BLOCKER_PATHS: readonly string[] = Object.keys(BLOCKER_TARGETS);

/** Strip the `channels[N].` prefix the readiness service prepends. */
export function normaliseBlockerPath(path: string): string {
  return path.replace(/^channels\[\d+\]\./, "");
}

/**
 * Resolve an issue path to its control. Returns `undefined` for a path
 * the map does not know, so the UI can omit the affordance instead of
 * pointing somewhere useless.
 */
export function resolveBlockerTarget(path: string): PublishBlockerTarget | undefined {
  const normalised = normaliseBlockerPath(path);
  const direct = BLOCKER_TARGETS[normalised];
  if (direct) return direct;
  // `delivery.` and `approvals.` are emitted unprefixed at the
  // planning level; fold them onto the same entries.
  if (normalised.startsWith("delivery.")) return BLOCKER_TARGETS.approvedDeliveryVersion;
  if (normalised.startsWith("approvals.")) return BLOCKER_TARGETS["approvals.openCount"];
  return undefined;
}

/**
 * The anchor a Fix link should use, or `undefined` when the issue has
 * no collectable control (manual dispatch) or is unmapped.
 */
export function readinessAnchorForPath(path: string): string | undefined {
  const target = resolveBlockerTarget(path);
  return target?.kind === "manual" ? undefined : target?.anchor;
}

/** True when the issue cannot be fixed in the product and must be dispatched manually. */
export function isManualDispatchBlocker(path: string): boolean {
  return resolveBlockerTarget(path)?.kind === "manual";
}

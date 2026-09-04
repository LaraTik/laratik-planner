"use client";

import { useState, useTransition } from "react";
import { Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox as UiCheckbox } from "@/components/ui/checkbox";
import { DirAwareInput, DirAwareTextarea } from "@/components/forms/dir-aware-textarea";
import { CaptionField } from "@/components/forms/caption-field";
import { HashtagEditor } from "@/components/forms/hashtag-editor";
import { ReasonDialog } from "@/components/forms/reason-dialog";
import {
  confirmPublishReadinessAction,
  recordInternalNoteAction,
  savePublishPackageAction,
  setFinalCopyApprovalAction,
} from "./actions";
import type { PlatformPayload, ReadinessReport } from "@/lib/publishing";
import type { AudienceCopyViewModel, MappedPlatformFields } from "@/lib/format-payload/mapper";
import type { PublishActionErrorCode } from "@/lib/publishing/action-errors";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";

/**
 * M4 — Publish package form (client component).
 *
 * Layout:
 *
 *   - Desktop (md+): 3-column grid via CSS.
 *     Left   = destination profile, schedule, caption/discovery
 *              and platform fields.
 *     Center = media, accessibility, disclosures, interaction
 *              settings.
 *     Right  = platform preview + the readiness summary (the
 *              readiness card on the page is the at-a-glance
 *              view; this right column is the per-channel
 *              preview + the "Ready for publishing" CTA).
 *   - Mobile: stacked single column. The form sections are
 *     collapsible accordions; the action bar is sticky to the
 *     bottom (the page wraps a `<div className="sticky bottom-0">`
 *     on the small-viewport breakpoint).
 *
 * A11y:
 *
 *   - Every input has a label.
 *   - The "Save draft" and "Ready for publishing" buttons are
 *     real `<button type="button">` elements that submit the
 *     local form via React state; the server action is the
 *     single source of truth on save.
 *   - The minimum 44×44 px touch target is enforced via
 *     Tailwind's `min-h-11 min-w-11` on the action buttons
 *     (44px is the WCAG 2.2 AA target).
 *
 * Behaviour:
 *
 *   - The form is a controlled component, one channel at a time.
 *     The page passes `channels` + initial `payload`; the form
 *     holds the local edit state and submits a full `payload`
 *     object to the server action.
 *   - Material edits (anything in the form) trigger the
 *     materiality service in the server action — the revision
 *     increments and approvals reset on save. The UI surfaces
 *     a banner when a save has triggered a reset (the
 *     readiness report's `approvals_open` flag).
 */

type DeliveryVersionSummary = {
  id: string;
  versionNumber: number;
  isFinalApproved: boolean;
};

type ChannelSummary = {
  id: string;
  socialChannelId: string;
  platform: string;
  accountName: string;
  payload: PlatformPayload | null;
  copySourceRevision?: number | null;
};

function defaultPayloadFor(platform: string, socialChannelId: string): PlatformPayload {
  // Build a per-platform minimal default. The schema is the
  // gate; if a key is missing the Zod discriminated union will
  // fill it with the documented default. This is the initial
  // state for a channel that has never been saved.
  const base = {
    schemaVersion: 1 as const,
    // The content-item channel is the selected destination profile. Keep
    // this relationship in the first draft so saving a package configures
    // the channel instead of leaving the publishing card permanently in
    // its unconfigured state.
    selectedDestinationProfile: { socialChannelId },
    hashtags: [] as string[],
    mentions: [] as { handle: string }[],
    collaborators: [] as { handle: string; role: "tagged" | "co_author" | "invited" }[],
    disclosures: {
      paidPartnership: false,
      aiGenerated: false,
      syntheticMedia: false,
      rightsConfirmed: false,
    },
    publicationMethod: "api" as const,
    approval: { finalCopyApproved: false, approvedByUserId: null, approvedAt: null },
    deliveryReferences: [] as {
      deliveryVersionId: string;
      role: "primary" | "thumbnail" | "carousel" | "transcript" | "subtitle";
    }[],
  };
  if (platform === "instagram") {
    return {
      ...base,
      platform: "instagram",
      feedCrop: "original",
      carouselOrder: [],
    } as PlatformPayload;
  }
  if (platform === "instagram_reel") {
    return {
      ...base,
      platform: "instagram_reel",
      transcriptReviewed: false,
      audioRightsConfirmed: false,
      allowComments: true,
      allowRemix: true,
    } as PlatformPayload;
  }
  if (platform === "facebook") {
    return {
      ...base,
      platform: "facebook",
      mediaPresentation: "feed",
    } as PlatformPayload;
  }
  if (platform === "tiktok") {
    return {
      ...base,
      platform: "tiktok",
      privacy: "public",
      allowComments: true,
      allowDuet: true,
      allowStitch: true,
      commercialContentDisclosure: false,
      musicRightsConfirmed: false,
    } as PlatformPayload;
  }
  if (platform === "linkedin") {
    return {
      ...base,
      platform: "linkedin",
      visibility: "public",
    } as PlatformPayload;
  }
  if (platform === "youtube") {
    return {
      ...base,
      platform: "youtube",
      title: "",
      categoryId: "22",
      privacy: "unlisted",
      tags: [],
      madeForKids: false,
      notifySubscribers: true,
    } as PlatformPayload;
  }
  if (platform === "pinterest") {
    return {
      ...base,
      platform: "pinterest",
      pinTitle: "",
      boardId: "",
      productTags: [],
    } as PlatformPayload;
  }
  if (platform === "x") {
    return {
      ...base,
      platform: "x",
      replySettings: "everyone",
      mediaAlt: [],
    } as PlatformPayload;
  }
  return {
    ...base,
    platform: "other",
    manualChecklist: [],
  } as PlatformPayload;
}

export function PublishPackageForm({
  workspaceId,
  workspaceSlug,
  contentItemId,
  itemTitle,
  itemFormat,
  audienceCopy,
  formatPayloadPreFill,
  contentLocale,
  channels,
  deliveryVersions,
  readiness,
  canEdit,
  canApproveFinalCopy,
  canConfirmReadiness,
  t: tProp,
}: {
  workspaceId: string;
  workspaceSlug: string;
  contentItemId: string;
  itemTitle: string;
  itemFormat: string;
  /** Canonical audience copy plus locale-resolved publishing values. */
  audienceCopy?: AudienceCopyViewModel;
  /**
   * Pre-fill from the planner's `formatPayload` work (the
   * "More details" editor on the content detail page).
   * Applied on top of the per-platform default for channels
   * that have no saved `platformPayload` yet. Existing saved
   * values always win — the planner's structured fields
   * never overwrite an already-published package.
   */
  formatPayloadPreFill?: MappedPlatformFields;
  /** Agency content locale is the default; the publisher may choose per channel. */
  contentLocale?: string;
  channels: ChannelSummary[];
  deliveryVersions: DeliveryVersionSummary[];
  readiness: ReadinessReport;
  canEdit: boolean;
  canApproveFinalCopy: boolean;
  canConfirmReadiness: boolean;
  /**
   * Bound translator from the parent. Phase 6e (2026-09-01)
   * migrates the top-level chrome (empty state, status
   * messages, save / ready buttons, last-saved label) through
   * `contentDetail.publish.*`. The per-field labels inside
   * the Destination & caption / Media & disclosures /
   * Preview & approval sections (Phase {hashtag} /
   * First comment / etc.) are still English and belong to a
   * follow-up commit.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
}) {
  const localeT = useLocaleT();
  const locale = useLocaleCode();
  const t = tProp ?? localeT;
  const [activeChannel, setActiveChannel] = useState<string>(channels[0]?.id ?? "");
  const [drafts, setDrafts] = useState<Record<string, PlatformPayload>>(() => {
    const initial: Record<string, PlatformPayload> = {};
    for (const ch of channels) {
      // Pre-fill order: saved channel payload > per-platform
      // default + formatPayload pre-fill. The pre-fill is
      // merged into the default so a planner who filled in
      // the More details editor sees their caption /
      // hashtags / location in the publish form on first
      // open, before any manual save.
      const base = ch.payload ?? defaultPayloadFor(ch.platform, ch.socialChannelId);
      if (ch.payload || (!formatPayloadPreFill && !audienceCopy)) {
        initial[ch.id] = base;
        continue;
      }
      const sharedCopy =
        audienceCopy?.resolvedByLocale[contentLocale ?? locale] ??
        audienceCopy?.resolved ??
        formatPayloadPreFill ??
        {};
      initial[ch.id] = {
        ...base,
        ...sharedCopy,
        contentLanguage: contentLocale ?? locale,
      } as PlatformPayload;
    }
    return initial;
  });
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});

  if (channels.length === 0) {
    return (
      <Card padding="lg" data-testid="publish-no-channels">
        <CardTitle>{t("contentDetail.publish.noChannelsTitle")}</CardTitle>
        <CardDescription>{t("contentDetail.publish.noChannelsDescription")}</CardDescription>
      </Card>
    );
  }

  const current = channels.find((c) => c.id === activeChannel);
  const currentDraft = current ? drafts[current.id] : undefined;
  const selectedLanguage =
    (currentDraft as { contentLanguage?: string } | undefined)?.contentLanguage ??
    contentLocale ??
    locale;
  const sharedCopy =
    audienceCopy?.resolvedByLocale[selectedLanguage] ??
    audienceCopy?.resolved ??
    formatPayloadPreFill;
  const currentReadiness = current
    ? readiness.channels.find((channel) => channel.socialChannelId === current.socialChannelId)
    : undefined;
  const sharedCopyDiffers = Boolean(
    current?.payload != null &&
    currentDraft &&
    sharedCopy &&
    ["caption", "description", "firstComment", "hashtags", "callToAction", "location"].some(
      (key) =>
        JSON.stringify((currentDraft as Record<string, unknown>)[key]) !==
        JSON.stringify(sharedCopy[key as keyof MappedPlatformFields]),
    ),
  );

  function applySharedCopy(channelId: string, language: string) {
    const shared =
      audienceCopy?.resolvedByLocale[language] ?? audienceCopy?.resolved ?? formatPayloadPreFill;
    if (!shared) return;
    const existing = drafts[channelId] as Record<string, unknown> | undefined;
    updateDraft(channelId, {
      ...(shared.caption !== undefined ? { caption: shared.caption } : {}),
      ...(shared.hashtags !== undefined ? { hashtags: shared.hashtags } : {}),
      ...(shared.firstComment !== undefined ? { firstComment: shared.firstComment } : {}),
      ...(shared.description !== undefined ? { description: shared.description } : {}),
      ...(shared.callToAction
        ? {
            callToAction: {
              ...shared.callToAction,
              url:
                typeof existing?.callToAction === "object" && existing.callToAction
                  ? (((existing.callToAction as { url?: unknown }).url as string | undefined) ?? "")
                  : shared.callToAction.url,
            },
          }
        : {}),
      ...(shared.location !== undefined ? { location: shared.location } : {}),
      contentLanguage: language,
    });
  }

  function readinessIssueText(code: string, fallback: string) {
    const localized = t(`contentDetail.publishReadiness.${code}`);
    return localized.startsWith("[contentDetail.publishReadiness.") ? fallback : localized;
  }

  function updateDraft(channelId: string, patch: Partial<PlatformPayload>) {
    setDrafts((prev) => {
      const base =
        prev[channelId] ??
        defaultPayloadFor(
          channels.find((c) => c.id === channelId)?.platform ?? "other",
          channels.find((c) => c.id === channelId)?.socialChannelId ?? channelId,
        );
      // Cast through unknown — the form patches across platform
      // variants and the discriminated union narrows at the
      // server-side Zod parse.
      return {
        ...prev,
        [channelId]: {
          ...(base as object),
          ...(patch as object),
          approval: {
            finalCopyApproved: false,
            approvedByUserId: null,
            approvedAt: null,
          },
        } as PlatformPayload,
      };
    });
  }

  function handleSave(channelId: string) {
    if (!currentDraft) return;
    start(async () => {
      setError(null);
      setStatusMessage(null);
      const result = await savePublishPackageAction({
        workspaceSlug,
        contentItemId,
        socialChannelId: channels.find((c) => c.id === channelId)?.socialChannelId ?? "",
        payload: JSON.stringify(currentDraft),
      });
      if (!result.ok) {
        setError(translatePublishError(t, result, "saveFailed"));
        return;
      }
      setDrafts((previous) => ({ ...previous, [channelId]: result.payload }));
      setSavedAt((prev) => ({ ...prev, [channelId]: Date.now() }));
      setStatusMessage(t("contentDetail.publish.statusDraftSaved"));
    });
  }

  async function handleInternalNote(summary: string) {
    const result = await recordInternalNoteAction({
      workspaceSlug,
      contentItemId,
      resource: "internal_note",
      summary,
    });
    if (!result.ok) throw new Error(translatePublishError(t, result, "recordNoteFailed"));
    setStatusMessage(t("contentDetail.publish.statusInternalNoteAdded"));
  }

  function handleFinalCopyApproval(approved: boolean) {
    if (!current) return;
    start(async () => {
      setError(null);
      setStatusMessage(null);
      const result = await setFinalCopyApprovalAction({
        workspaceSlug,
        contentItemId,
        socialChannelId: current.socialChannelId,
        approved,
      });
      if (!result.ok) {
        setError(translatePublishError(t, result, "approvalFailed"));
        return;
      }
      setDrafts((previous) => ({ ...previous, [current.id]: result.payload }));
      setStatusMessage(
        approved
          ? t("contentDetail.publish.statusFinalCopyApproved")
          : t("contentDetail.publish.statusFinalCopyRevoked"),
      );
    });
  }

  function handleConfirmReadiness() {
    start(async () => {
      setError(null);
      setStatusMessage(null);
      const result = await confirmPublishReadinessAction({ workspaceSlug, contentItemId });
      if (!result.ok) {
        setError(translatePublishError(t, result, "readinessFailed"));
        return;
      }
      setStatusMessage(
        t("contentDetail.publish.statusConfirmedReadyOne", {
          revision: result.report.revision,
        }),
      );
    });
  }

  return (
    <div className="space-y-4" data-testid="publish-package-form" data-workspace-id={workspaceId}>
      {/* Channel selector (top, also visible on mobile) */}
      <div className="flex flex-wrap gap-2" data-testid="publish-channel-tabs" role="tablist">
        {channels.map((ch) => {
          const chReadiness = readiness.channels.find(
            (c) => c.socialChannelId === ch.socialChannelId,
          );
          const blockers = chReadiness?.blockerCount ?? 0;
          return (
            <button
              key={ch.id}
              type="button"
              role="tab"
              aria-selected={ch.id === activeChannel}
              aria-controls={`publish-channel-panel-${ch.id}`}
              onClick={() => setActiveChannel(ch.id)}
              className={`focus-visible:ring-focus-ring rounded-[var(--radius-control)] border px-3 py-2 text-sm font-semibold ${
                ch.id === activeChannel
                  ? "border-primary bg-primary-subtle text-primary"
                  : "border-border bg-surface text-fg-primary"
              } min-h-11 min-w-11`}
              data-testid={`publish-channel-tab-${ch.socialChannelId}`}
            >
              <span>{ch.accountName}</span>
              <span className="text-label text-fg-muted ms-2 uppercase">{ch.platform}</span>
              {blockers > 0 ? (
                <Badge variant="danger" className="ms-2">
                  {blockers}
                </Badge>
              ) : null}
            </button>
          );
        })}
      </div>

      {error ? (
        <div
          role="alert"
          data-testid="publish-save-error"
          className="border-danger bg-danger-container text-on-danger-container rounded-[var(--radius-control)] border px-3 py-2 text-sm"
        >
          {error}
        </div>
      ) : null}
      {statusMessage ? (
        <div
          role="status"
          className="border-success bg-success-container text-on-success-container rounded-[var(--radius-control)] border px-3 py-2 text-sm"
        >
          {statusMessage}
        </div>
      ) : null}

      {current && currentDraft ? (
        <div
          id={`publish-channel-panel-${current.id}`}
          role="tabpanel"
          className="grid grid-cols-1 gap-4 lg:grid-cols-3"
          data-testid={`publish-channel-panel-${current.socialChannelId}`}
        >
          {currentReadiness && currentReadiness.issues.length > 0 ? (
            <div
              role="alert"
              aria-labelledby="publish-readiness-title"
              className="border-danger bg-danger-container text-on-danger-container rounded-[var(--radius-control)] border p-3 lg:col-span-3"
              data-testid="publish-readiness-issues"
            >
              <p id="publish-readiness-title" className="text-body font-semibold">
                {t("contentDetail.publishReadiness.title")}
              </p>
              <ul className="text-label mt-1 list-disc space-y-1 ps-5">
                {currentReadiness.issues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>
                    {readinessIssueText(issue.code, issue.message)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {/* Left column — destination + caption/discovery */}
          <Card padding="lg" className="space-y-3">
            <CardTitle>{t("contentDetail.publishForm.destinationCaption")}</CardTitle>
            <Field
              label={t("contentDetail.publishForm.channel")}
              value={current.accountName}
              readOnly
              testId="publish-channel-name"
            />
            <Field
              label={t("contentDetail.publishForm.itemTitle")}
              value={itemTitle}
              readOnly
              testId="publish-item-title"
            />
            <Field
              label={t("contentDetail.publishForm.format")}
              value={itemFormat}
              readOnly
              testId="publish-item-format"
            />
            <div>
              <label
                htmlFor="publish-content-language"
                className="text-body text-fg-primary mb-1 block font-semibold"
              >
                {t("contentDetail.publishForm.publishLanguage")}
              </label>
              <select
                id="publish-content-language"
                value={
                  (currentDraft as { contentLanguage?: string }).contentLanguage ??
                  contentLocale ??
                  locale
                }
                onChange={(e) => applySharedCopy(current.id, e.target.value)}
                className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring min-h-11 w-full rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:outline-none"
                data-testid="publish-content-language"
              >
                <option value="en">{t("contentDetail.publishForm.languageEnglish")}</option>
                <option value="ar">{t("contentDetail.publishForm.languageArabic")}</option>
              </select>
              <p className="text-label text-fg-muted mt-1">
                {t("contentDetail.publishForm.publishLanguageHint")}
              </p>
            </div>
            <div>
              <CaptionField
                id="publish-caption"
                name="caption"
                label={t("contentDetail.publishForm.caption")}
                value={(currentDraft as { caption?: string }).caption ?? ""}
                onChange={(next) => updateDraft(current.id, { caption: next })}
                hint={t("contentDetail.publishForm.captionHint")}
                testId="publish-caption"
              />
            </div>
            <div>
              <HashtagEditor
                id="publish-hashtags"
                name="hashtags"
                label={t("contentDetail.publishForm.hashtags")}
                value={(currentDraft as { hashtags?: string[] }).hashtags ?? []}
                onChange={(next) => updateDraft(current.id, { hashtags: next })}
                hint={t("contentDetail.publishForm.hashtagsHint")}
                locale={locale}
                t={t}
                testId="publish-hashtags"
              />
            </div>
            {sharedCopy && sharedCopyDiffers ? (
              <div className="border-info bg-info-subtle flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border p-2">
                <p className="text-label text-fg-secondary">
                  {current.copySourceRevision != null &&
                  current.copySourceRevision < readiness.revision
                    ? t("contentDetail.copy.staleOverride")
                    : t("contentDetail.publishForm.sharedCopyChanged")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  onClick={() => applySharedCopy(current.id, selectedLanguage)}
                  data-testid="publish-use-shared-copy"
                >
                  {t("contentDetail.publishForm.useSharedCopy")}
                </Button>
              </div>
            ) : null}
            <Field
              label={t("contentDetail.publishForm.firstComment")}
              value={(currentDraft as { firstComment?: string }).firstComment ?? ""}
              onChange={(v) => updateDraft(current.id, { firstComment: v })}
              multiline
              testId="publish-first-comment"
            />
            <Field
              label={t("contentDetail.publishForm.destinationUrl")}
              value={(currentDraft as { destinationUrl?: string }).destinationUrl ?? ""}
              onChange={(v) => updateDraft(current.id, { destinationUrl: v })}
              placeholder="https://"
              testId="publish-destination-url"
            />
          </Card>

          {/* Center column — media, disclosures */}
          <Card padding="lg" className="space-y-3">
            <CardTitle>{t("contentDetail.publishForm.mediaDisclosures")}</CardTitle>
            <div>
              <label
                htmlFor="publish-alt-text"
                className="text-body text-fg-primary mb-1 block font-semibold"
              >
                {t("contentDetail.publishForm.altText")}
              </label>
              <DirAwareTextarea
                id="publish-alt-text"
                locale={locale}
                rows={3}
                value={(currentDraft as { altText?: string }).altText ?? ""}
                onChange={(e) => updateDraft(current.id, { altText: e.target.value })}
                data-testid="publish-alt-text"
              />
            </div>
            <Checkbox
              label={t("contentDetail.publishForm.rightsConfirmed")}
              checked={Boolean(
                (currentDraft as { disclosures?: { rightsConfirmed?: boolean } }).disclosures
                  ?.rightsConfirmed,
              )}
              onChange={(v) =>
                updateDraft(current.id, {
                  disclosures: {
                    paidPartnership: Boolean(
                      (currentDraft as { disclosures?: { paidPartnership?: boolean } }).disclosures
                        ?.paidPartnership,
                    ),
                    aiGenerated: Boolean(
                      (currentDraft as { disclosures?: { aiGenerated?: boolean } }).disclosures
                        ?.aiGenerated,
                    ),
                    syntheticMedia: Boolean(
                      (currentDraft as { disclosures?: { syntheticMedia?: boolean } }).disclosures
                        ?.syntheticMedia,
                    ),
                    rightsConfirmed: v,
                  },
                })
              }
              testId="publish-rights-confirmed"
            />
            <Checkbox
              label={t("contentDetail.publishForm.aiGenerated")}
              checked={Boolean(
                (currentDraft as { disclosures?: { aiGenerated?: boolean } }).disclosures
                  ?.aiGenerated,
              )}
              onChange={(v) =>
                updateDraft(current.id, {
                  disclosures: {
                    paidPartnership: Boolean(
                      (currentDraft as { disclosures?: { paidPartnership?: boolean } }).disclosures
                        ?.paidPartnership,
                    ),
                    aiGenerated: v,
                    syntheticMedia: Boolean(
                      (currentDraft as { disclosures?: { syntheticMedia?: boolean } }).disclosures
                        ?.syntheticMedia,
                    ),
                    rightsConfirmed: Boolean(
                      (currentDraft as { disclosures?: { rightsConfirmed?: boolean } }).disclosures
                        ?.rightsConfirmed,
                    ),
                  },
                })
              }
              testId="publish-ai-generated"
            />
            <Checkbox
              label={t("contentDetail.publishForm.paidPartnership")}
              checked={Boolean(
                (currentDraft as { disclosures?: { paidPartnership?: boolean } }).disclosures
                  ?.paidPartnership,
              )}
              onChange={(v) =>
                updateDraft(current.id, {
                  disclosures: {
                    paidPartnership: v,
                    aiGenerated: Boolean(
                      (currentDraft as { disclosures?: { aiGenerated?: boolean } }).disclosures
                        ?.aiGenerated,
                    ),
                    syntheticMedia: Boolean(
                      (currentDraft as { disclosures?: { syntheticMedia?: boolean } }).disclosures
                        ?.syntheticMedia,
                    ),
                    rightsConfirmed: Boolean(
                      (currentDraft as { disclosures?: { rightsConfirmed?: boolean } }).disclosures
                        ?.rightsConfirmed,
                    ),
                  },
                })
              }
              testId="publish-paid-partnership"
            />
            <div>
              {/* Phase 8 (2026-08-30): user-facing label renamed from
                  "Approved delivery version" → "Approved version"
                  per the terminology sweep in the planning-detail
                  refactor (spec §10 / §16 — the DB column
                  `delivery_versions` is unchanged). */}
              <CardTitle className="text-title-card">
                {t("contentDetail.publishForm.approvedVersion")}
              </CardTitle>
              {deliveryVersions.filter((d) => d.isFinalApproved).length === 0 ? (
                <p
                  className="text-label text-warning mt-1"
                  data-testid="publish-no-approved-delivery"
                >
                  {t("contentDetail.publish.noApprovedDelivery")}
                </p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm" data-testid="publish-approved-deliveries">
                  {deliveryVersions
                    .filter((d) => d.isFinalApproved)
                    .map((d) => (
                      <li key={d.id}>v{d.versionNumber}</li>
                    ))}
                </ul>
              )}
            </div>
          </Card>

          {/* Right column — preview + approval */}
          <Card padding="lg" className="space-y-3">
            <CardTitle>{t("contentDetail.publishForm.previewApproval")}</CardTitle>
            <PreviewPane payload={currentDraft} platform={current.platform} />
            <div className="border-border bg-surface-subtle rounded-[var(--radius-control)] border p-3">
              <p className="text-body text-fg-primary font-semibold">
                {currentDraft.approval.finalCopyApproved
                  ? t("contentDetail.publishForm.finalCopyApproved")
                  : t("contentDetail.publishForm.finalCopyAwaitingApproval")}
              </p>
              {currentDraft.approval.approvedAt ? (
                <p className="text-label text-fg-muted mt-1">
                  {t("contentDetail.publishForm.approvedAt", {
                    time: new Date(currentDraft.approval.approvedAt).toLocaleString(),
                  })}
                </p>
              ) : null}
              {canApproveFinalCopy ? (
                <Button
                  type="button"
                  variant={currentDraft.approval.finalCopyApproved ? "secondary" : "default"}
                  size="sm"
                  className="mt-3"
                  disabled={pending}
                  onClick={() => handleFinalCopyApproval(!currentDraft.approval.finalCopyApproved)}
                  data-testid="publish-final-copy-approved"
                >
                  {currentDraft.approval.finalCopyApproved
                    ? t("contentDetail.publishForm.revokeApproval")
                    : t("contentDetail.publishForm.approveFinalCopy")}
                </Button>
              ) : (
                <p className="text-label text-fg-muted mt-2">
                  {t("contentDetail.publishForm.adminApprovalRequired")}
                </p>
              )}
            </div>
            <p className="text-label text-fg-muted">
              {t("contentDetail.publishForm.approvalResetHint")}
            </p>
          </Card>
        </div>
      ) : null}

      {/* Sticky action bar — bottom of the form on every viewport */}
      <div
        className="bg-surface border-border sticky bottom-0 z-10 -mx-4 flex flex-col items-stretch gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:mx-0 md:px-0"
        data-testid="publish-action-bar"
      >
        <div className="flex items-center gap-2">
          <ReasonDialog
            trigger={
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                data-testid="publish-internal-note"
              >
                {t("contentDetail.internalNote.title")}
              </Button>
            }
            title={t("contentDetail.internalNote.title")}
            description={t("contentDetail.internalNote.description")}
            label={t("contentDetail.publishForm.note")}
            confirmLabel={t("contentDetail.publishForm.addNote")}
            onConfirm={handleInternalNote}
            closeAriaLabel={t("common.dialogCloseAria")}
          />
          {Object.keys(savedAt).length > 0 ? (
            <span className="text-label text-fg-muted" data-testid="publish-last-saved">
              {t("contentDetail.publish.lastSaved", {
                time: new Date(Math.max(...Object.values(savedAt))).toLocaleTimeString(),
              })}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => current && handleSave(current.id)}
            disabled={pending || !current || !canEdit}
            className="min-h-11"
            data-testid="publish-save-draft"
          >
            <Save className="me-1 h-4 w-4" aria-hidden="true" />
            {t("contentDetail.publish.saveDraft")}
          </Button>
          <Button
            type="button"
            onClick={handleConfirmReadiness}
            disabled={pending || !readiness.canPublish || !canConfirmReadiness}
            className="min-h-11"
            data-testid="publish-ready"
          >
            <Send className="me-1 h-4 w-4" aria-hidden="true" />
            {t("contentDetail.publish.readyForPublishing")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function translatePublishError(
  t: (key: string, params?: Record<string, string | number>) => string,
  result: { ok: false; errorCode?: PublishActionErrorCode },
  fallback: PublishActionErrorCode,
): string {
  const code = result.errorCode ?? fallback;
  return t(`contentDetail.publishErrors.${code}`);
}

function Field({
  label,
  value,
  onChange,
  readOnly,
  placeholder,
  testId,
  multiline,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  testId?: string;
  multiline?: boolean;
}) {
  const locale = useLocaleCode();
  const id = `field-${testId ?? label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="text-body text-fg-primary mb-1 block font-semibold">
        {label}
      </label>
      {multiline ? (
        <DirAwareTextarea
          id={id}
          locale={locale}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          rows={4}
          data-testid={testId}
          className="min-h-11"
        />
      ) : (
        <DirAwareInput
          id={id}
          locale={locale}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          data-testid={testId}
          className="min-h-11"
        />
      )}
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}) {
  const id = `cb-${testId ?? label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <label
      htmlFor={id}
      className="text-body text-fg-primary flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-1"
      data-testid={testId}
    >
      <UiCheckbox id={id} checked={checked} onCheckedChange={(next) => onChange(next === true)} />
      <span>{label}</span>
    </label>
  );
}

function PreviewPane({ payload, platform }: { payload: PlatformPayload; platform: string }) {
  const t = useLocaleT();
  const caption = (payload as { caption?: string }).caption ?? "";
  const hashtags = (payload as { hashtags?: string[] }).hashtags ?? [];
  return (
    <div
      className="border-border rounded-[var(--radius-control)] border p-3"
      data-testid="publish-preview-pane"
    >
      <p className="text-label text-fg-muted uppercase">{platform}</p>
      <p
        className="text-body text-fg-primary mt-1 whitespace-pre-wrap"
        data-testid="publish-preview-caption"
      >
        {caption || (
          <span className="text-fg-muted italic">({t("contentDetail.publishForm.noCaption")})</span>
        )}
      </p>
      {hashtags.length > 0 ? (
        <p className="text-label text-fg-muted mt-1">{hashtags.map((h) => `#${h}`).join(" ")}</p>
      ) : null}
    </div>
  );
}

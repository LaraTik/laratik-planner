"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Languages, Plus, Save, Send, X } from "lucide-react";
import { PerFieldAiSuggest } from "@/components/forms/per-field-ai-suggest";
import { phaseBlockerCounts } from "@/lib/publishing/blocker-targets";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox as UiCheckbox } from "@/components/ui/checkbox";
import { DirAwareInput, DirAwareTextarea } from "@/components/forms/dir-aware-textarea";
import { CaptionField } from "@/components/forms/caption-field";
import { HashtagEditor } from "@/components/forms/hashtag-editor";
import { ReasonDialog } from "@/components/forms/reason-dialog";
import {
  markPublishingSetupReadyAction,
  recordInternalNoteAction,
  savePublishPackageAction,
  savePublishPackageBatchAction,
  setFinalCopyApprovalAction,
} from "./actions";
import { recordPublicationAction } from "@/app/(app)/app/w/[slug]/planning/actions";
import type { PlatformPayload, ReadinessReport } from "@/lib/publishing";
/*
 * Value imports come from the concrete modules, never the
 * `@/lib/publishing` barrel. The barrel re-exports `service.ts`, which
 * is `server-only` and imports `revalidatePath`; pulling it into this
 * client component fails the webpack build. The type-only import above
 * is erased at compile time, which is why it was always safe.
 */
import {
  requiredFieldsFor,
  rightsCheckboxesFor,
  readPlatformField,
  readRightsFlag,
  validateRequiredFields,
  type PlatformRequiredField,
  type PlatformRightsCheckbox,
} from "@/lib/publishing/platform-required-fields";
import type { AudienceCopyViewModel, MappedPlatformFields } from "@/lib/format-payload/mapper";
import type { PublishActionErrorCode } from "@/lib/publishing/action-errors";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";
import { formatDate } from "@/lib/i18n/format-locale";
import { platformLabel, PlatformIcon } from "@/components/workspace/platform-icon";
import { cn } from "@/lib/utils";
import { humanFormat } from "@/lib/content/status";
import { PublishPhaseStepper } from "@/components/planning/publish-phase-stepper";
import {
  PlatformPreviewSwitcher,
  type PreviewChannel,
} from "@/components/planning/platform-preview-switcher";

/**
 * Serializable preview inputs handed down from the server page. Kept as
 * data (not a pre-rendered node) so the form can bind the simulator to
 * the channel the operator is actually editing.
 */
/**
 * In-page anchors for the four preparation phases, shared by the
 * stepper's links and the action bar's "Continue to …" control so the
 * two can never point at different sections.
 */
const PHASE_ANCHORS = {
  destination: "#publish-destination",
  content: "#publish-caption",
  compliance: "#publish-compliance",
  review: "#publish-approval",
} as const;

export interface PublishPreviewData {
  channels: ReadonlyArray<PreviewChannel>;
  sharedCaption: string;
  sharedHashtags?: string[];
  thumbnailUrl?: string | null;
  thumbnailWidth?: number | null;
  thumbnailHeight?: number | null;
}
import { useBeforeunloadDirtyGuard } from "@/lib/forms/use-beforeunload-dirty-guard";
import { useNavigationDirtyGuard } from "@/lib/forms/use-navigation-dirty-guard";
import type { MetaPublishingReadiness } from "@/lib/db/schema";
import {
  MetaPublishingReadinessCard,
  type MetaPublishingReadinessCopy,
} from "@/components/workspace/meta-publishing-readiness-card";

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
  /**
   * `content_item_channels.updated_at` at read time, sent back as
   * `expectedUpdatedAt` so a save is rejected if a collaborator saved
   * first. NOT `copySourceRevision` — that column is provenance
   * ("which content revision this inherited shared copy from"), not a
   * row version.
   */
  updatedAt?: string | null;
  publicationStatus?: "pending" | "published" | "failed" | "skipped";
};

/** Stable empty map so a channel with no errors does not re-render on every keystroke. */
const EMPTY_FIELD_ERRORS: Record<string, string> = {};

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
  workspaceTimezone,
  contentItemId,
  itemFormat,
  audienceCopy,
  formatPayloadPreFill,
  contentLocale,
  channels,
  deliveryVersions,
  readiness,
  canApproveFinalCopy,
  canConfirmReadiness,
  canSavePackage,
  workflowAtPublishingSetup = true,
  canExcludeChannel = false,
  publishingSetupReady = false,
  metaPublishingReadiness,
  metaPublishingCopy,
  previewData,
  aiCaptionDraftsEnabled = false,
  aiCaptionDisabledReason = null,
  t: tProp,
}: {
  workspaceId: string;
  workspaceSlug: string;
  workspaceTimezone: string;
  contentItemId: string;
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
  canApproveFinalCopy: boolean;
  canConfirmReadiness: boolean;
  /**
   * Whether this actor may persist a package.
   *
   * This replaces the old `canEdit` prop. `savePlatformPayload`
   * authorises `workspace_manager` and `content_planner` only
   * (`platform-payload-service.ts:110-120`), while the page's
   * `canEdit` also covers an assigned designer — so the form used to
   * render Save for a designer whose save always failed with
   * FORBIDDEN. The package form has exactly one write path, so it
   * now takes exactly one write-authority flag and renders a
   * read-only summary when it is false.
   */
  canSavePackage: boolean;
  /**
   * Whether the global workflow has reached Publishing setup. Below
   * this the sticky bar must not offer "Mark setup ready": the
   * workspace rail's next action is still the primary one, and two
   * primary buttons describing different lifecycle levels is how the
   * wrong one gets clicked.
   *
   * Optional so an isolated consumer (a test, a future sub-route)
   * renders the full bar without restating the gate; the page always
   * supplies it.
   */
  workflowAtPublishingSetup?: boolean | undefined;
  /** Publishers and managers may exclude an unrecorded channel from publication. */
  canExcludeChannel?: boolean;
  /** Package-level lifecycle gate, independent from platform capability. */
  publishingSetupReady?: boolean;
  metaPublishingReadiness?: MetaPublishingReadiness;
  metaPublishingCopy?: MetaPublishingReadinessCopy;
  /**
   * Serializable preview inputs, not a pre-rendered node.
   *
   * The simulator used to arrive as a `ReactNode` built by the server,
   * which meant it could not know which channel the form had selected —
   * so it shipped its own duplicate channel strip to stay clickable.
   * Passing data instead lets the form render the preview itself and
   * bind it to `activeChannel`, leaving one owner for channel
   * selection: the channel tab row.
   */
  previewData?: PublishPreviewData;
  /**
   * Whether the agency has AI caption drafting switched on. The publish
   * caption's "Generate with AI" control is hidden rather than disabled
   * when it is off, matching the format editor — an operator should not
   * be invited to a capability the agency has not bought.
   */
  aiCaptionDraftsEnabled?: boolean;
  /** Why the AI control is unavailable, when the capability is off. */
  aiCaptionDisabledReason?: string | null;
  /**
   * Bound translator from the parent. Phase 6e (2026-09-01)
   * migrates the top-level chrome (empty state, status
   * messages, save / ready buttons, last-saved label) through
   * `contentDetail.publish.*`. Per-field labels inside the
   * Destination & caption / Media & disclosures /
   * Preview & approval sections are resolved from the active
   * catalog as well.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
}) {
  const localeT = useLocaleT();
  const locale = useLocaleCode();
  const router = useRouter();
  const t = tProp ?? localeT;
  const localizedPlatformLabel = (platform: string) => {
    const key = `contentDetail.publishForm.platformLabels.${platform}`;
    const value = t(key);
    return value === key ? platformLabel(platform) : value;
  };
  const localizedFormatLabel = (format: string) => {
    const key = `planningFilters.formatLabels.${format}`;
    const value = t(key);
    return value === key ? humanFormat(format) : value;
  };
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
  const [dirtyChannels, setDirtyChannels] = useState<Record<string, boolean>>({});
  const [bulkLanguage, setBulkLanguage] = useState(contentLocale ?? locale);
  /**
   * Field-scoped validation messages, keyed by payload field name.
   * Populated before a save attempt (client pre-flight mirroring the
   * schema's `min(1)`) and from the server's `fieldPath` when a save
   * is rejected, so a Pinterest board error never degrades to a bare
   * "save failed".
   */
  /**
   * Field-scoped validation messages, keyed **by channel id** then by
   * payload field name.
   *
   * This was a flat `Record<fieldName, string>`, which meant a batch
   * save left only the *last* failing channel's errors in state, and
   * they were rendered inside whichever channel happened to be active.
   * With two Pinterest channels — A active and valid, B with an empty
   * board — Save all painted "Choose a Pinterest board." under A's
   * board input and pointed A's `aria-describedby` at B's error, while
   * the status line said one channel needed fixing. Keying by channel
   * makes the message land on the field that caused it, which is the
   * only place it can be acted on.
   */
  const [fieldErrorsByChannel, setFieldErrorsByChannel] = useState<
    Record<string, Record<string, string>>
  >({});
  /** Errors for the channel currently being edited. */
  const fieldErrors = fieldErrorsByChannel[activeChannel] ?? EMPTY_FIELD_ERRORS;
  const formRef = useRef<HTMLFormElement | null>(null);
  const dirty = channels.some((channel) => dirtyChannels[channel.id]);
  const dirtyCount = channels.filter((channel) => dirtyChannels[channel.id]).length;
  useBeforeunloadDirtyGuard(formRef, !dirty);
  useNavigationDirtyGuard({
    formRef,
    isClean: !dirty,
    confirmMessage: t("contentDetail.publish.unsavedGuard"),
  });

  /**
   * The next preparation phase to move into, or `null` when the
   * operator is already on the last one.
   *
   * This is local navigation *within* the publish form — the same class
   * of action as the stepper links — so it does not compete with the
   * workspace rail's lifecycle "Next action". It is only offered once
   * there is no unsaved work, because advancing past a phase whose edits
   * are still in memory would strand them.
   *
   * Declared above the no-channels early return on purpose: hooks must
   * run on every render, and this one is needed by the action bar.
   */
  const nextPhase = useMemo(() => {
    const order = ["destination", "content", "compliance", "review"] as const;
    const counts = phaseBlockerCounts(
      readiness.issues.map((issue) => ({ path: issue.path, severity: issue.severity })),
    );
    const firstBlocking = order.findIndex((id) => counts[id] > 0);
    if (firstBlocking === -1) return null;
    // Never below Content when a destination is already selected, and
    // never offer an advance while edits are still unsaved.
    if (dirtyCount > 0 || dirty) return null;
    const idx = Math.max(firstBlocking, 1);
    return order[idx + 1] ?? null;
  }, [readiness.issues, dirty, dirtyCount]);

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
  const currentBlockerCount = currentReadiness?.blockerCount ?? readiness.blockers;
  const canExcludeCurrentChannel =
    canExcludeChannel &&
    (!current?.publicationStatus ||
      current.publicationStatus === "pending" ||
      current.publicationStatus === "failed");
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
  /**
   * True when the shared audience copy has been revised since this
   * channel last saved — the one case where "using shared copy" is a
   * stale claim rather than a true one.
   */
  const isCopyStale = Boolean(
    current?.copySourceRevision != null && current.copySourceRevision < readiness.revision,
  );
  /** Schema-required extras for the active channel's platform. */
  /**
   * A channel that has never been saved has nothing to save *back to*,
   * so it is not dirty — but it also has no persisted package, so the
   * primary action must still be Save rather than a status link. This
   * is the "one state, one action" rule's third state, and collapsing
   * it into "not dirty" would hide the only way to persist the draft.
   */
  const activeNeverSaved = current != null && current.payload == null;
  const currentNeedsSave = dirty || activeNeverSaved;
  /**
   * Save all only when more than one channel is genuinely dirty.
   *
   * The first version of this bar keyed the decision on
   * `channels.length > 1`, so on any multi-channel item a single edited
   * channel rendered "Save all changes (1)" and the per-channel Save
   * disappeared — the operator lost the ability to save one package, and
   * a one-channel edit was presented as a batch operation. The count
   * that decides this is how many channels *changed*, not how many
   * exist.
   *
   * Found by the browser gate, not by unit tests: a component test with
   * a single channel could never have surfaced it.
   */
  const saveAllIsTheRightAction = dirtyCount > 1;
  const nextPhaseLabel = nextPhase
    ? t("contentDetail.publishForm.continueToPhase", {
        phase: t(`contentDetail.publishForm.phase.${nextPhase}`),
      })
    : null;
  /** The one channel to save when the action is not a batch. */
  const singleDirtyChannelId =
    dirtyCount === 1
      ? (channels.find((channel) => dirtyChannels[channel.id])?.id ?? activeChannel)
      : activeChannel;
  const currentPlatformFields = requiredFieldsFor(current?.platform ?? "");
  /** Rights confirmations a readiness rule blocks on for this platform. */
  const currentRightsCheckboxes = rightsCheckboxesFor(current?.platform ?? "");

  function applySharedCopy(channelId: string, language: string) {
    const shared =
      audienceCopy?.resolvedByLocale[language] ?? audienceCopy?.resolved ?? formatPayloadPreFill;
    const existing = drafts[channelId] as Record<string, unknown> | undefined;
    updateDraft(channelId, {
      ...(shared?.caption !== undefined ? { caption: shared.caption } : {}),
      ...(shared?.hashtags !== undefined ? { hashtags: shared.hashtags } : {}),
      ...(shared?.firstComment !== undefined ? { firstComment: shared.firstComment } : {}),
      ...(shared?.description !== undefined ? { description: shared.description } : {}),
      ...(shared?.callToAction
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
      ...(shared?.location !== undefined ? { location: shared.location } : {}),
      contentLanguage: language,
    });
  }

  function applyLanguageToAll() {
    for (const channel of channels) applySharedCopy(channel.id, bulkLanguage);
    setStatusMessage(t("contentDetail.publish.statusLanguageApplied", { count: channels.length }));
  }

  /**
   * Channel switching is the one draft transition the unload guard
   * cannot cover: `useBeforeunloadDirtyGuard` / `useNavigationDirtyGuard`
   * only intercept leaving the page, so switching tabs silently carried
   * an unsaved draft forward with no warning and no autosave to catch
   * it. Drafts are deliberately *not* auto-saved — every save is a
   * material edit that increments `content_items.revision` and fans out
   * approval activity — so the guard is the only honest option.
   */
  function selectChannel(nextChannelId: string) {
    if (nextChannelId === activeChannel) return;
    if (dirtyChannels[activeChannel] && !window.confirm(t("contentDetail.publish.unsavedGuard"))) {
      return;
    }
    setActiveChannel(nextChannelId);
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
      //
      // `approval` is deliberately NOT reset here. The server owns it:
      // `savePlatformPayload` re-reads the stored approval and spreads
      // it *last*, so whatever the client sends is discarded
      // (`platform-payload-service.ts:129-130,147-150`). Clearing it
      // locally therefore made the form report "not approved" for a
      // package the server still considered approved, and the
      // discrepancy silently healed on the next render. It was also
      // the reason `approvalResetHint` promised a reset that never
      // happened. Only `setFinalCopyApprovalAction` changes it.
      return {
        ...prev,
        [channelId]: {
          ...(base as object),
          ...(patch as object),
        } as PlatformPayload,
      };
    });
    setDirtyChannels((previous) => ({ ...previous, [channelId]: true }));
  }

  /**
   * Pre-flight a channel's required platform fields. Returns true when
   * the draft can be submitted; otherwise records field-scoped messages
   * and returns false.
   */
  function validateChannel(channelId: string): boolean {
    const channel = channels.find((candidate) => candidate.id === channelId);
    const draft = drafts[channelId];
    if (!channel || !draft) return true;
    const errors = validateRequiredFields(channel.platform, draft, t);
    setFieldErrorsByChannel((previous) => ({ ...previous, [channelId]: errors }));
    if (Object.keys(errors).length > 0) {
      setError(null);
      setStatusMessage(t("contentDetail.publish.statusFixRequiredFields"));
      return false;
    }
    return true;
  }

  function handleSave(channelId: string) {
    const draft = drafts[channelId];
    if (!draft) return;
    if (!validateChannel(channelId)) return;
    start(async () => {
      setError(null);
      setStatusMessage(null);
      const result = await savePublishPackageAction({
        workspaceSlug,
        contentItemId,
        socialChannelId: channels.find((c) => c.id === channelId)?.socialChannelId ?? "",
        payload: JSON.stringify(draft),
        expectedUpdatedAt: channels.find((c) => c.id === channelId)?.updatedAt ?? null,
      });
      if (!result.ok) {
        if (result.fieldPath) {
          // Server rejected a specific field — surface it on the
          // control instead of collapsing to a page-level error.
          const rejectedField = result.fieldPath;
          setFieldErrorsByChannel((previous) => ({
            ...previous,
            [channelId]: {
              [rejectedField]: t("contentDetail.publishErrors.invalidPlatformPayload"),
            },
          }));
          setError(null);
        } else {
          setError(translatePublishError(t, result, "saveFailed"));
        }
        return;
      }
      setFieldErrorsByChannel((previous) => ({ ...previous, [channelId]: EMPTY_FIELD_ERRORS }));
      setDrafts((previous) => ({ ...previous, [channelId]: result.payload }));
      setSavedAt((prev) => ({ ...prev, [channelId]: Date.now() }));
      setDirtyChannels((previous) => ({ ...previous, [channelId]: false }));
      setStatusMessage(t("contentDetail.publish.statusDraftSaved"));
    });
  }

  function handleSaveAll() {
    const dirtyIds = channels
      .filter((channel) => dirtyChannels[channel.id])
      .map((channel) => channel.id);
    if (dirtyIds.length === 0) return;
    // Validate every dirty channel before submitting any of them, so a
    // single empty Pinterest board cannot leave the batch half-saved.
    const invalid = dirtyIds.filter((channelId) => !validateChannel(channelId));
    if (invalid.length > 0) {
      setStatusMessage(
        t("contentDetail.publish.statusFixRequiredFields", { count: invalid.length }),
      );
      return;
    }
    const entries = dirtyIds.flatMap((channelId) => {
      const channel = channels.find((candidate) => candidate.id === channelId);
      const draft = drafts[channelId];
      if (!channel || !draft) return [];
      return [
        {
          socialChannelId: channel.socialChannelId,
          payload: JSON.stringify(draft),
          expectedUpdatedAt: channel.updatedAt ?? null,
        },
      ];
    });
    if (entries.length === 0) return;
    const channelIdBySocial = new Map(
      channels.map((channel) => [channel.socialChannelId, channel.id]),
    );

    start(async () => {
      setError(null);
      setStatusMessage(null);
      /*
       * One call = one material edit. The service validates every entry
       * first and writes nothing unless all of them pass, so this no
       * longer produces N revision bumps and N notification batches for
       * one click, and it can no longer half-save.
       */
      const result = await savePublishPackageBatchAction({
        workspaceSlug,
        contentItemId,
        entries,
      });
      if (!result.ok) {
        const failures = "results" in result ? result.results : [];
        const stale = failures.filter(
          (entry): entry is Extract<typeof entry, { ok: false }> =>
            !entry.ok && entry.errorCode === "stale",
        );
        if (stale.length > 0) {
          // A collaborator saved one of these channels after this page
          // loaded. Keep every local draft and say so — never discard
          // the operator's work to resolve a conflict.
          setStatusMessage(t("contentDetail.publish.statusBatchStale", { count: stale.length }));
        } else {
          const firstFailure = failures.find(
            (entry): entry is Extract<typeof entry, { ok: false }> => !entry.ok,
          );
          const failedChannelId = firstFailure
            ? channelIdBySocial.get(firstFailure.socialChannelId)
            : undefined;
          if (firstFailure && "fieldPath" in firstFailure && firstFailure.fieldPath) {
            const fieldPath = firstFailure.fieldPath;
            if (failedChannelId) {
              setFieldErrorsByChannel((previous) => ({
                ...previous,
                [failedChannelId]: {
                  [fieldPath]: t("contentDetail.publishErrors.invalidPlatformPayload"),
                },
              }));
              // The error lives on the failing channel's panel, so bring
              // the operator to it. Without this the message is correct
              // but invisible, which is the same defect as before.
              setActiveChannel(failedChannelId);
            }
            setError(null);
          } else {
            setError(translatePublishError(t, result, "saveFailed"));
          }
        }
        return;
      }
      const now = Date.now();
      setFieldErrorsByChannel((previous) => {
        const next = { ...previous };
        for (const entry of result.results) {
          const channelId = channelIdBySocial.get(entry.socialChannelId);
          if (channelId && entry.ok) next[channelId] = EMPTY_FIELD_ERRORS;
        }
        return next;
      });
      setDrafts((previous) => {
        const next = { ...previous };
        for (const entry of result.results) {
          const channelId = channelIdBySocial.get(entry.socialChannelId);
          if (channelId && entry.ok) next[channelId] = entry.payload;
        }
        return next;
      });
      setSavedAt((previous) => {
        const next = { ...previous };
        for (const entry of result.results) {
          const channelId = channelIdBySocial.get(entry.socialChannelId);
          if (channelId && entry.ok) next[channelId] = now;
        }
        return next;
      });
      setDirtyChannels((previous) => {
        const next = { ...previous };
        for (const entry of result.results) {
          const channelId = channelIdBySocial.get(entry.socialChannelId);
          if (channelId && entry.ok) next[channelId] = false;
        }
        return next;
      });
      setStatusMessage(t("contentDetail.publish.statusSaveAll", { count: result.results.length }));
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
      setDirtyChannels((previous) => ({ ...previous, [current.id]: false }));
      setStatusMessage(
        approved
          ? t("contentDetail.publish.statusFinalCopyApproved")
          : t("contentDetail.publish.statusFinalCopyRevoked"),
      );
    });
  }

  function handleExcludeChannel() {
    if (!current || !canExcludeCurrentChannel) return;
    if (!window.confirm(t("contentDetail.publish.excludeChannelConfirm"))) return;
    start(async () => {
      setError(null);
      setStatusMessage(null);
      const result = await recordPublicationAction({
        workspaceSlug,
        contentItemChannelId: current.id,
        status: "skipped",
        note: t("contentDetail.publish.excludeChannelNote"),
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setStatusMessage(t("contentDetail.publish.statusChannelExcluded"));
      router.refresh();
    });
  }

  function handleConfirmReadiness() {
    start(async () => {
      setError(null);
      setStatusMessage(null);
      const result = await markPublishingSetupReadyAction({ workspaceSlug, contentItemId });
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
    <form
      ref={formRef}
      className="space-y-4"
      data-testid="publish-package-form"
      data-workspace-id={workspaceId}
      onSubmit={(event) => event.preventDefault()}
    >
      {metaPublishingReadiness &&
      metaPublishingCopy &&
      channels.some(
        (channel) => channel.platform === "instagram" || channel.platform === "facebook",
      ) ? (
        <MetaPublishingReadinessCard
          readiness={metaPublishingReadiness}
          copy={metaPublishingCopy}
          compact
          testId="publish-meta-readiness-card"
        />
      ) : null}

      <div
        className="border-border bg-surface-subtle rounded-[var(--radius-control)] border p-3"
        data-testid="publish-channel-workspace"
      >
        {/*
          The tab row is the single owner of channel selection for this
          form — the preview follows it rather than carrying its own
          switcher. Each tab therefore leads with the platform mark so
          the platform is recognisable before the label is read, and
          states the platform as a name for assistive tech and for the
          case where the glyph does not render.

          "Add channel" is a sibling of the tablist, never a child. A
          `tablist` may only contain `tab` elements; a `<button>` inside
          one is an `aria-required-children` violation, and it is also
          wrong semantically — adding a destination is not selecting
          one. (The visual gate caught this on all five publish
          surfaces before any pixel diff was compared.)
        */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="publish-channel-tabs"
            role="tablist"
          >
            {channels.map((ch) => {
              const chReadiness = readiness.channels.find(
                (c) => c.socialChannelId === ch.socialChannelId,
              );
              const blockers = chReadiness?.blockerCount ?? 0;
              const isActive = ch.id === activeChannel;
              return (
                <button
                  key={ch.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`publish-channel-panel-${ch.id}`}
                  onClick={() => selectChannel(ch.id)}
                  className={cn(
                    "focus-visible:ring-focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2 text-sm font-semibold",
                    isActive
                      ? "border-primary bg-primary-subtle text-primary"
                      : "border-border bg-surface text-fg-primary hover:bg-surface",
                  )}
                  data-testid={`publish-channel-tab-${ch.socialChannelId}`}
                >
                  <PlatformIcon platform={ch.platform} tile className="h-6 w-6 shrink-0" />
                  <span className="truncate">{localizedPlatformLabel(ch.platform)}</span>
                  <span aria-hidden="true" className="text-fg-muted">
                    ·
                  </span>
                  <span className="truncate">{ch.accountName}</span>
                  {blockers > 0 ? (
                    <Badge variant="danger" className="ms-0.5">
                      {blockers}
                    </Badge>
                  ) : chReadiness ? (
                    <CheckCircle2
                      className="text-success ms-0.5 h-4 w-4 shrink-0"
                      aria-label={t("contentDetail.publishForm.channelReady")}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
          {/*
            Adding a destination is a workspace-level decision (it
            creates a social-channel link), not a package write, so it
            routes to the Channels surface instead of mutating the
            package. Before this existed the only way to reach it was
            the global navigation, which is several levels away from
            the one screen where "I need another account" arises.
          */}
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 border-dashed"
            onClick={() => router.push(`/app/w/${workspaceSlug}/channels`)}
            data-testid="publish-add-channel"
          >
            <Plus className="me-1 h-4 w-4" aria-hidden="true" />
            {t("contentDetail.publishForm.addChannel")}
          </Button>
        </div>
      </div>

      {/*
        Channel identity, stated once. This replaces the three read-only
        `Field`s (channel name, item title, format) that duplicated the
        active tab and `PlanningHeader` — three labels and three 44px
        controls for information already on screen.
      */}
      {current ? (
        <p
          className="text-label text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1"
          data-testid="publish-channel-meta"
        >
          <span className="text-fg-secondary font-semibold">
            {localizedFormatLabel(itemFormat)}
          </span>
          <span aria-hidden="true">·</span>
          <span>{current.accountName}</span>
          <span aria-hidden="true">·</span>
          <span>{localizedPlatformLabel(current.platform)}</span>
          {currentBlockerCount > 0 ? (
            <Badge variant="danger" data-testid="publish-channel-meta-blockers">
              {t(
                currentBlockerCount === 1
                  ? "contentDetail.publishReadiness.blockersOne"
                  : "contentDetail.publishReadiness.blockersMany",
                { count: currentBlockerCount },
              )}
            </Badge>
          ) : null}
        </p>
      ) : null}

      {channels.length > 0 ? (
        <PublishPhaseStepper
          activeChannel={activeChannel}
          channels={channels.map((c) => ({
            id: c.id,
            socialChannelId: c.socialChannelId,
          }))}
          blockerIssues={readiness.issues.map((issue) => ({
            path: issue.path,
            severity: issue.severity,
          }))}
          t={t}
        />
      ) : null}

      {channels.length > 1 ? (
        <div
          className="border-border bg-surface-subtle flex flex-col gap-2 rounded-[var(--radius-control)] border p-3 sm:flex-row sm:items-end sm:justify-between"
          data-testid="publish-language-all"
        >
          <div>
            <label
              htmlFor="publish-language-all-select"
              className="text-body text-fg-primary mb-1 block font-semibold"
            >
              {t("contentDetail.publishForm.applyLanguageToAll")}
            </label>
            <p className="text-label text-fg-muted">
              {t("contentDetail.publishForm.applyLanguageToAllHint")}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              id="publish-language-all-select"
              value={bulkLanguage}
              onChange={(event) => setBulkLanguage(event.target.value)}
              className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring min-h-11 rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:outline-none"
              data-testid="publish-language-all-select"
            >
              <option value="en">{t("contentDetail.publishForm.languageEnglish")}</option>
              <option value="ar">{t("contentDetail.publishForm.languageArabic")}</option>
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={applyLanguageToAll}
              disabled={pending || !canSavePackage}
              className="min-h-11"
              data-testid="publish-apply-language-all"
            >
              {t("contentDetail.publishForm.applyLanguageToAllButton")}
            </Button>
          </div>
        </div>
      ) : null}

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
      {publishingSetupReady ? (
        <div
          className="border-success/30 bg-success-subtle text-success rounded-[var(--radius-control)] border px-3 py-2 text-sm"
          role="status"
          data-testid="publish-setup-ready"
        >
          {t("contentDetail.publish.markPublishingSetupReady")}
        </div>
      ) : null}

      {current && currentDraft ? (
        <div
          id={`publish-channel-panel-${current.id}`}
          role="tabpanel"
          /*
            The simulator gets a fixed phone-width track and the editor
            takes the rest. Splitting this 50/50 was what squeezed the
            caption to roughly 100px: the center column is already
            narrowed by the 248px nav and the 304px workflow rail, so a
            half-and-half split left the writing surface with less room
            than a label needed. A capped preview column gives the copy
            the width it needs without hiding the preview on mobile,
            where the grid collapses to one column anyway.
          */
          className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]"
          data-testid={`publish-channel-panel-${current.socialChannelId}`}
        >
          {/*
            The per-channel readiness checklist used to render here as a
            full-width block above the editor, duplicating the count and
            status the `PublishingCommandCenter` already renders at the
            top of the panel. The command center is now the single
            status surface and hosts the blocker list as its expandable
            body; the per-channel counts stay on the channel tabs.
          */}
          <div className="min-w-0 space-y-4">
            {/* Editor column — destination + caption/discovery, then disclosures */}
            {/*
              `canSavePackage` gates the whole editor, not just the Save
              button. Rendering disabled inputs for a viewer (or an
              assigned designer, whom the server rejects anyway) left a
              form that accepted typing, marked the channel dirty, and
              then offered a permanently greyed-out Save. A read-only
              summary is honest about what the actor can do, and it is
              the same definition-list grammar the plan specifies
              instead of "disabled controls that look enabled".
            */}
            {/* Excluding a channel from publication is a publisher/manager
                lifecycle decision, gated by `canExcludeChannel` — not a
                package write. It therefore stays available to actors who
                cannot edit the payload, so it sits outside the
                `canSavePackage` editor gate below. */}
            {canExcludeCurrentChannel ? (
              <div
                className="border-warning/30 bg-warning-subtle flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border p-3"
                data-testid="publish-exclude-channel"
              >
                <p className="text-label text-fg-secondary">
                  {t("contentDetail.publish.excludeChannelDescription")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  onClick={handleExcludeChannel}
                  disabled={pending}
                  data-testid="publish-exclude-channel-button"
                >
                  <X className="me-1 h-4 w-4" aria-hidden="true" />
                  {t("contentDetail.publish.excludeChannel")}
                </Button>
              </div>
            ) : null}

            {canSavePackage ? (
              <>
                <Card
                  id="publish-destination"
                  padding="md"
                  /*
                    A flex column, not a grid. This card is a plain
                    vertical stack of one field after another, and the
                    grid version collapsed its first track to 0px in
                    practice — the card title and the field-tools row
                    rendered with zero width beside a full-width
                    sibling. A stack has no track to get wrong.
                  */
                  className="flex min-w-0 scroll-mt-24 flex-col gap-3"
                >
                  <CardTitle>{t("contentDetail.publishForm.destinationCaption")}</CardTitle>
                  {/*
                    The three read-only Fields that used to sit here
                    (channel name, item title, format) duplicated the
                    active channel tab and the page header verbatim, at a
                    cost of three labels and three 44px controls. Channel
                    identity is now a single meta row above the editor —
                    `format · accountName · platform` — and the item
                    title and format live in `PlanningHeader`.
                  */}
                  <div className="sm:max-w-xs">
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
                    {/*
                      Field-level tools sit on one row above the caption
                      so the field itself keeps the full column width.
                      They used to be absent from the Publish tab: AI
                      drafting was reachable only from the Create tab's
                      format-payload editor, so an operator writing
                      channel copy had to leave the tab to get a draft.
                      `PerFieldAiSuggest` is the same component the
                      format editor uses — drafts only, never a write,
                      and the operator confirms Insert / Replace.
                    */}
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <PerFieldAiSuggest
                        locale={locale}
                        contentItemId={contentItemId}
                        field="caption"
                        currentValue={(currentDraft as { caption?: string }).caption ?? ""}
                        contentLanguage={selectedLanguage}
                        onApply={(text, mode) => {
                          const existing = (currentDraft as { caption?: string }).caption ?? "";
                          updateDraft(current.id, {
                            caption:
                              mode === "replace" || existing === "" ? text : `${existing}\n${text}`,
                          });
                        }}
                        enabled={aiCaptionDraftsEnabled}
                        disabledReason={aiCaptionDisabledReason}
                        t={t}
                      />
                      {/*
                          Translations of the shared audience copy are
                          owned by the Create tab's copy editor — the
                          per-channel publish payload has no
                          `translations` map, so there is nothing to
                          translate in place here. This control routes
                          to that editor rather than opening a second,
                          write-capable copy surface that would compete
                          with the first one.
                        */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-11"
                        onClick={() => {
                          window.location.hash = "#create-plan";
                          router.refresh();
                        }}
                        data-testid="publish-manage-translations"
                      >
                        <Languages className="me-1 h-4 w-4" aria-hidden="true" />
                        {t("contentDetail.publishForm.manageTranslations")}
                      </Button>
                    </div>
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
                  {/*
                    Make the shared-copy → channel-inherits → optional
                    override chain visible. The same Arabic text appears in
                    the Copy tab and again here, and nothing on screen said
                    which was which — so identical text read as a
                    duplication bug rather than an inheritance. This also
                    gives `copySourceRevision` a user-facing meaning.
                  */}
                  {current?.payload ? (
                    <p
                      className="text-label text-fg-muted flex flex-wrap items-center gap-2 lg:col-span-2"
                      data-testid="publish-copy-source"
                    >
                      {isCopyStale ? (
                        <>
                          <span className="text-warning font-semibold">
                            {t("contentDetail.publishForm.copySourceStale")}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="min-h-11"
                            onClick={() => applySharedCopy(current.id, selectedLanguage)}
                            data-testid="publish-copy-refresh"
                          >
                            {t("contentDetail.publishForm.useSharedCopy")}
                          </Button>
                        </>
                      ) : sharedCopyDiffers ? (
                        <>
                          <span className="text-fg-secondary font-semibold">
                            {t("contentDetail.publishForm.copySourceOverride")}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="min-h-11"
                            onClick={() => applySharedCopy(current.id, selectedLanguage)}
                            data-testid="publish-copy-reset"
                          >
                            {t("contentDetail.publishForm.copySourceResetAction")}
                          </Button>
                        </>
                      ) : (
                        <>
                          <CheckCircle2
                            className="text-success h-4 w-4 shrink-0"
                            aria-hidden="true"
                          />
                          <span className="text-fg-secondary">
                            {t("contentDetail.publishForm.copySourceShared")}
                          </span>
                        </>
                      )}
                    </p>
                  ) : null}
                  {sharedCopy && sharedCopyDiffers && !isCopyStale ? (
                    <div className="border-info bg-info-subtle flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border p-2 lg:col-span-2">
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
                  <details className="border-border bg-surface-subtle rounded-[var(--radius-control)] border p-3 lg:col-span-2">
                    <summary className="text-label text-fg-primary cursor-pointer font-semibold">
                      {t("contentDetail.publishForm.firstComment")} &amp;{" "}
                      {t("contentDetail.publishForm.destinationUrl")}
                    </summary>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
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
                    </div>
                  </details>
                </Card>

                {/*
              Platform settings — the schema-required fields per
              platform. Before this section a YouTube or Pinterest
              channel could be attached to an item but its package
              could never be saved: `YouTubePayloadSchema.title` and
              `PinterestPayloadSchema.pinTitle` / `.boardId` are
              `min(1)` with no default, the form had no input, and the
              ZodError collapsed to a bare "save failed". Rendered from
              `PLATFORM_REQUIRED_FIELDS` so the controls and the
              blocker→anchor map cannot drift apart. Platforms with no
              required extras render nothing.
            */}
                {currentPlatformFields.length > 0 ? (
                  <Card
                    id="publish-platform-settings"
                    padding="lg"
                    className="min-w-0 scroll-mt-24 space-y-3"
                  >
                    <CardTitle>{t("contentDetail.publishForm.platformSettingsTitle")}</CardTitle>
                    <CardDescription>
                      {t("contentDetail.publishForm.platformSettingsDescription")}
                    </CardDescription>
                    {currentPlatformFields.map((field) => {
                      const inputId = `publish-platform-${field.key}`;
                      const error = fieldErrors[field.key];
                      const describedBy = error ? `${inputId}-error` : undefined;
                      return (
                        <div key={field.key}>
                          <label
                            htmlFor={inputId}
                            className="text-body text-fg-primary mb-1 block font-semibold"
                          >
                            {t(`contentDetail.publishForm.platformFieldLabels.${field.labelKey}`)}
                          </label>
                          {field.kind === "select" ? (
                            <select
                              id={inputId}
                              value={readPlatformField(currentDraft, field.key)}
                              onChange={(event) =>
                                updateDraft(current.id, {
                                  [field.key]: event.target.value,
                                } as unknown as Partial<PlatformPayload>)
                              }
                              disabled={pending || !canSavePackage}
                              aria-invalid={error ? true : undefined}
                              aria-describedby={describedBy}
                              data-testid={`publish-platform-${field.key}`}
                              className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring min-h-11 w-full rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {field.options?.map((option) => (
                                <option key={option} value={option}>
                                  {t(
                                    `contentDetail.publishForm.platformFieldOptions.${field.labelKey}.${option}`,
                                  )}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <DirAwareInput
                              id={inputId}
                              locale={locale}
                              value={readPlatformField(currentDraft, field.key)}
                              onChange={(event) =>
                                updateDraft(current.id, {
                                  [field.key]: event.target.value,
                                } as unknown as Partial<PlatformPayload>)
                              }
                              disabled={pending || !canSavePackage}
                              aria-invalid={error ? true : undefined}
                              aria-describedby={describedBy}
                              data-testid={`publish-platform-${field.key}`}
                              className="min-h-11"
                            />
                          )}
                          {error ? (
                            <p
                              id={`${inputId}-error`}
                              className="text-label text-danger mt-1"
                              role="alert"
                              data-testid={`${inputId}-error`}
                            >
                              {error}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </Card>
                ) : null}

                <Card
                  id="publish-compliance"
                  padding="lg"
                  className="min-w-0 scroll-mt-24 space-y-3"
                >
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
                  <details
                    id="publish-disclosures"
                    className="border-border bg-surface-subtle rounded-[var(--radius-control)] border p-3"
                    data-testid="publish-advanced-disclosures"
                  >
                    <summary className="text-body text-fg-primary cursor-pointer font-semibold">
                      {t("contentDetail.publishForm.advancedDisclosures")}
                      <span className="text-label text-fg-muted ms-2 font-normal">
                        {t("contentDetail.publishForm.advancedDisclosuresSummary")}
                      </span>
                    </summary>
                    <div className="mt-3 space-y-3">
                      <Checkbox
                        label={t("contentDetail.publishForm.rightsConfirmed")}
                        checked={Boolean(
                          (currentDraft as { disclosures?: { rightsConfirmed?: boolean } })
                            .disclosures?.rightsConfirmed,
                        )}
                        onChange={(v) =>
                          updateDraft(current.id, {
                            disclosures: {
                              paidPartnership: Boolean(
                                (currentDraft as { disclosures?: { paidPartnership?: boolean } })
                                  .disclosures?.paidPartnership,
                              ),
                              aiGenerated: Boolean(
                                (currentDraft as { disclosures?: { aiGenerated?: boolean } })
                                  .disclosures?.aiGenerated,
                              ),
                              syntheticMedia: Boolean(
                                (currentDraft as { disclosures?: { syntheticMedia?: boolean } })
                                  .disclosures?.syntheticMedia,
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
                                (currentDraft as { disclosures?: { paidPartnership?: boolean } })
                                  .disclosures?.paidPartnership,
                              ),
                              aiGenerated: v,
                              syntheticMedia: Boolean(
                                (currentDraft as { disclosures?: { syntheticMedia?: boolean } })
                                  .disclosures?.syntheticMedia,
                              ),
                              rightsConfirmed: Boolean(
                                (currentDraft as { disclosures?: { rightsConfirmed?: boolean } })
                                  .disclosures?.rightsConfirmed,
                              ),
                            },
                          })
                        }
                        testId="publish-ai-generated"
                      />
                      <Checkbox
                        label={t("contentDetail.publishForm.paidPartnership")}
                        checked={Boolean(
                          (currentDraft as { disclosures?: { paidPartnership?: boolean } })
                            .disclosures?.paidPartnership,
                        )}
                        onChange={(v) =>
                          updateDraft(current.id, {
                            disclosures: {
                              paidPartnership: v,
                              aiGenerated: Boolean(
                                (currentDraft as { disclosures?: { aiGenerated?: boolean } })
                                  .disclosures?.aiGenerated,
                              ),
                              syntheticMedia: Boolean(
                                (currentDraft as { disclosures?: { syntheticMedia?: boolean } })
                                  .disclosures?.syntheticMedia,
                              ),
                              rightsConfirmed: Boolean(
                                (currentDraft as { disclosures?: { rightsConfirmed?: boolean } })
                                  .disclosures?.rightsConfirmed,
                              ),
                            },
                          })
                        }
                        testId="publish-paid-partnership"
                      />
                    </div>
                  </details>
                  {/*
                Per-platform rights / review confirmations. These are
                booleans with a `false` default, so an unedited
                package always fails the matching readiness rule
                (`missing_audio_rights`, `transcript_not_reviewed`,
                `missing_music_rights`) — the operator must positively
                confirm them. They live outside the advanced
                disclosures disclosure because a readiness blocker
                links straight here.
              */}
                  {currentRightsCheckboxes.map((entry) => {
                    const anchorId = `publish-${entry.labelKey.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
                    const boxId = `${anchorId}-checkbox`;
                    return (
                      <div key={entry.key} id={anchorId} className="scroll-mt-24">
                        <Checkbox
                          label={t(
                            `contentDetail.publishForm.platformRightsLabels.${entry.labelKey}`,
                          )}
                          checked={readRightsFlag(currentDraft, entry.key)}
                          onChange={(v) =>
                            updateDraft(current.id, {
                              [entry.key]: v,
                            } as unknown as Partial<PlatformPayload>)
                          }
                          testId={boxId}
                        />
                      </div>
                    );
                  })}
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
                      <ul
                        className="mt-2 space-y-1 text-sm"
                        data-testid="publish-approved-deliveries"
                      >
                        {deliveryVersions
                          .filter((d) => d.isFinalApproved)
                          .map((d) => (
                            <li key={d.id}>v{d.versionNumber}</li>
                          ))}
                      </ul>
                    )}
                  </div>
                </Card>
              </>
            ) : (
              <ReadOnlyPackageSummary
                payload={currentDraft}
                platform={current.platform}
                platformFields={currentPlatformFields}
                rightsCheckboxes={currentRightsCheckboxes}
                approvedDeliveryCount={deliveryVersions.filter((d) => d.isFinalApproved).length}
                t={t}
              />
            )}
          </div>

          {/*
            The preview stays beside the editor on large screens and
            drops below the inputs on mobile, where it is still
            first-class content rather than a hidden tab. It renders
            here — not as a server-built node — so it follows the
            active channel from the tab row above and does not need its
            own duplicate channel strip.
          */}
          {previewData && previewData.channels.length > 0 ? (
            <div
              id="publish-preview"
              data-testid="publish-preview-panel"
              className="min-w-0 scroll-mt-24 space-y-3"
            >
              <div>
                <p className="text-title-card text-fg-primary font-semibold">
                  {t("contentDetail.preview.title")}
                </p>
                <p className="text-label text-fg-secondary mt-0.5">
                  {t("contentDetail.preview.description", {
                    platform: localizedPlatformLabel(
                      current?.platform ?? previewData.channels[0]!.platform,
                    ),
                    account: current?.accountName ?? previewData.channels[0]!.accountName,
                  })}
                </p>
              </div>
              <PlatformPreviewSwitcher {...previewData} activeChannelId={activeChannel} />
            </div>
          ) : null}
          {/* The approval gate spans the full grid width rather than
              orphaning itself in the editor column: it is the one card
              whose action ("Approve final copy") is a lifecycle
              decision, and a half-width card under a two-column editor
              reads as a footnote when it is actually a gate. */}
          <Card
            id="publish-review"
            padding="lg"
            className="min-w-0 scroll-mt-24 space-y-3 lg:col-span-2"
          >
            <CardTitle>{t("contentDetail.publishForm.previewApproval")}</CardTitle>
            <div
              id="publish-approval"
              className="border-border bg-surface-subtle scroll-mt-24 rounded-[var(--radius-control)] border p-3"
            >
              <p className="text-body text-fg-primary font-semibold">
                {currentDraft.approval.finalCopyApproved
                  ? t("contentDetail.publishForm.finalCopyApproved")
                  : t("contentDetail.publishForm.finalCopyAwaitingApproval")}
              </p>
              {currentDraft.approval.approvedAt ? (
                <p className="text-label text-fg-muted mt-1">
                  {t("contentDetail.publishForm.approvedAt", {
                    time: formatDate(new Date(currentDraft.approval.approvedAt), locale, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: workspaceTimezone,
                    }),
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
          </Card>
        </div>
      ) : null}

      {/* Sticky action bar — bottom of the form on every viewport */}
      {/*
        `sm:min-h-[4.5rem]` keeps the bar's geometry stable while its
        contents change. Without it, the status line appearing or
        disappearing ("Unsaved publishing changes" → "Draft saved…")
        changes the bar's height, which moves the buttons in a
        `position: sticky` container — the button is under the pointer
        mid-click, and the browser gate caught it as an intermittent,
        un-clickable Save. A fixed floor is also simply less jumpy for a
        person reaching for it right after typing.
      */}
      <div
        className="bg-surface border-border sticky bottom-0 z-10 -mx-4 flex flex-col items-stretch gap-2 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:min-h-[4.5rem] sm:flex-row sm:items-center sm:justify-between md:mx-0 md:px-0"
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
          {dirty ? (
            <span
              className="text-label text-warning font-semibold"
              role="status"
              data-testid="publish-unsaved-state"
            >
              {t("contentDetail.publish.unsaved")}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {/*
            One state, one primary action. The bar used to render four
            competing controls in one line — Save draft, Save all, a
            blockers count, and Mark publishing setup ready — so the
            operator had to decide which of them was the next step. The
            primary slot now holds exactly one action, chosen by state,
            and the "mark setup ready" button is gated on the global
            workflow having actually reached publishing setup (the
            workspace rail owns the next action until it does).
          */}
          {saveAllIsTheRightAction ? (
            <Button
              type="button"
              onClick={handleSaveAll}
              disabled={pending || !canSavePackage}
              className="min-h-11"
              data-testid="publish-save-all"
            >
              <Save className="me-1 h-4 w-4" aria-hidden="true" />
              {t("contentDetail.publish.saveAll", { count: dirtyCount })}
            </Button>
          ) : currentNeedsSave || dirtyCount > 0 ? (
            <Button
              type="button"
              onClick={() => {
                /*
                 * Prefer the channel the operator is looking at. The
                 * dirty-channel lookup is only a fallback for the case
                 * where the active channel is clean but another one is
                 * not — otherwise a per-channel save can be routed at
                 * an id whose draft is not loaded, and `handleSave`
                 * returns silently (no request, no status, no error).
                 */
                const target =
                  currentNeedsSave && current ? current.id : singleDirtyChannelId || activeChannel;
                if (target && drafts[target]) handleSave(target);
              }}
              disabled={pending || !canSavePackage}
              className="min-h-11"
              data-testid="publish-save-draft"
            >
              <Save className="me-1 h-4 w-4" aria-hidden="true" />
              {t("contentDetail.publish.saveDraft")}
            </Button>
          ) : !readiness.canPublish ? (
            /*
              Blockers are open. If the operator's current phase is
              settled and a later one is not, "Continue to …" is the
              action that moves them; otherwise the honest primary is
              still the link to the blockers.
            */
            nextPhase ? (
              <a
                href={PHASE_ANCHORS[nextPhase]}
                className="text-label text-primary inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] px-2 font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                data-testid="publish-continue-phase"
              >
                {nextPhaseLabel}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              </a>
            ) : (
              <Link
                href="#publish-package"
                aria-describedby="publish-ready-hint"
                className="text-label text-warning inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-2 font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                data-testid="publish-review-blockers"
              >
                {t("contentDetail.publishCommandCenter.actionReviewBlockers")}
              </Link>
            )
          ) : publishingSetupReady ? (
            <Link
              href="#publish-outcomes"
              className="text-label text-primary inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-2 font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
              data-testid="publish-record-outcome"
            >
              {t("contentDetail.publishCommandCenter.actionRecordOutcomes")}
            </Link>
          ) : workflowAtPublishingSetup ? (
            <Button
              type="button"
              onClick={handleConfirmReadiness}
              disabled={pending || dirty || !readiness.canPublish || !canConfirmReadiness}
              className="min-h-11"
              data-testid="publish-ready"
            >
              <Send className="me-1 h-4 w-4" aria-hidden="true" />
              {t("contentDetail.publish.markPublishingSetupReady")}
            </Button>
          ) : null}
        </div>
      </div>
    </form>
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

/**
 * Read-only rendering of a channel package for actors who may view but
 * not save it.
 *
 * A definition list, not a disabled form. A disabled input looks
 * editable until the operator types into it, which is exactly the
 * failure the `canSavePackage` split was introduced to prevent.
 */
function ReadOnlyPackageSummary({
  payload,
  platform,
  platformFields,
  rightsCheckboxes,
  approvedDeliveryCount,
  t,
}: {
  payload: PlatformPayload;
  platform: string;
  platformFields: readonly PlatformRequiredField[];
  rightsCheckboxes: readonly PlatformRightsCheckbox[];
  approvedDeliveryCount: number;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const flat = payload as unknown as Record<string, unknown>;
  const captions = (flat.caption as string | undefined) ?? "";
  const disclosureValues: Array<[string, boolean]> = [
    [
      "rightsConfirmed",
      Boolean((flat.disclosures as { rightsConfirmed?: boolean } | undefined)?.rightsConfirmed),
    ],
    [
      "aiGenerated",
      Boolean((flat.disclosures as { aiGenerated?: boolean } | undefined)?.aiGenerated),
    ],
    [
      "paidPartnership",
      Boolean((flat.disclosures as { paidPartnership?: boolean } | undefined)?.paidPartnership),
    ],
    ...rightsCheckboxes.map(
      (entry) => [entry.labelKey, readRightsFlag(payload, entry.key)] as [string, boolean],
    ),
  ];

  const rows: Array<{ key: string; label: string; value: string }> = [
    {
      key: "caption",
      label: t("contentDetail.publishForm.caption"),
      value: captions || `—`,
    },
    {
      key: "hashtags",
      label: t("contentDetail.publishForm.hashtags"),
      value:
        ((flat.hashtags as string[] | undefined) ?? []).map((tag) => `#${tag}`).join(" ") || "—",
    },
    {
      key: "firstComment",
      label: t("contentDetail.publishForm.firstComment"),
      value: (flat.firstComment as string | undefined) || "—",
    },
    {
      key: "destinationUrl",
      label: t("contentDetail.publishForm.destinationUrl"),
      value: (flat.destinationUrl as string | undefined) || "—",
    },
    {
      key: "altText",
      label: t("contentDetail.publishForm.altText"),
      value: (flat.altText as string | undefined) || "—",
    },
    {
      key: "contentLanguage",
      label: t("contentDetail.publishForm.publishLanguage"),
      value: (flat.contentLanguage as string | undefined) || "—",
    },
    ...platformFields.map((field) => ({
      key: field.key,
      label: t(`contentDetail.publishForm.platformFieldLabels.${field.labelKey}`),
      value: readPlatformField(payload, field.key) || "—",
    })),
  ];

  return (
    <Card id="publish-destination" padding="lg" className="min-w-0 scroll-mt-24 space-y-3">
      <CardTitle>{t("contentDetail.publishForm.readOnlySummaryTitle")}</CardTitle>
      <CardDescription>{t("contentDetail.publishForm.readOnlySummaryDescription")}</CardDescription>
      <p className="text-label text-fg-muted" data-testid="publish-read-only-platform">
        {t(`contentDetail.publishForm.platformLabels.${platform}`)}
      </p>
      <dl className="space-y-2" data-testid="publish-read-only-summary">
        {rows.map((row) => (
          <div
            key={row.key}
            className="grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(0,10rem)_1fr]"
          >
            <dt className="text-label text-fg-muted font-semibold">{row.label}</dt>
            <dd
              className="text-body text-fg-primary break-words whitespace-pre-wrap"
              data-testid={`publish-read-only-${row.key}`}
            >
              {row.value}
            </dd>
          </div>
        ))}
        {disclosureValues.map(([key, value]) => (
          <div key={key} className="grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(0,10rem)_1fr]">
            <dt className="text-label text-fg-muted font-semibold">
              {t(`contentDetail.publishForm.disclosureLabels.${key}`)}
            </dt>
            <dd
              className="text-body text-fg-primary"
              data-testid={`publish-read-only-disclosure-${key}`}
            >
              {value
                ? t("contentDetail.publishForm.disclosureYes")
                : t("contentDetail.publishForm.disclosureNo")}
            </dd>
          </div>
        ))}
        <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(0,10rem)_1fr]">
          <dt className="text-label text-fg-muted font-semibold">
            {t("contentDetail.publishForm.approvedVersion")}
          </dt>
          <dd
            className="text-body text-fg-primary"
            data-testid="publish-read-only-approved-deliveries"
          >
            {approvedDeliveryCount === 0
              ? t("contentDetail.publish.noApprovedDelivery")
              : t("contentDetail.publishForm.approvedDeliveryCount", {
                  count: approvedDeliveryCount,
                })}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

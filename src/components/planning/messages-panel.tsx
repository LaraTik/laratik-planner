"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { TabSwitchLink } from "@/components/planning/tab-switch-link";
import { CheckCircle2, Info, Loader2, AlertCircle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { AUTOSAVE_DEBOUNCE_MS } from "@/lib/forms/autosave";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { FormSummary } from "@/components/forms/form-summary";
import { rendererFor } from "@/components/forms/format-payload-field-renderers";
import { fieldsFor } from "@/components/forms/format-payload-field-set";
import { focusFirstInvalid } from "@/lib/forms/focus-first-invalid";
import { useBeforeunloadDirtyGuard } from "@/lib/forms/use-beforeunload-dirty-guard";
import { useNavigationDirtyGuard } from "@/lib/forms/use-navigation-dirty-guard";
import { updateAudienceCopyAction } from "@/app/(app)/app/w/[slug]/planning/actions";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";
import { formatNumber } from "@/lib/i18n/format-locale";
import { buildAudienceCopyViewModel } from "@/lib/format-payload/mapper";
import { channelCopyStatus, isAudienceCopyKey } from "@/lib/content/audience-copy";
import { type ContentFormat } from "@/lib/format-payload/schemas";
import { type ActionState } from "@/lib/validation/action-state";
import { platformLabel } from "@/components/workspace/platform-icon";

const initial: ActionState<"contentItemId" | "format" | "formatPayload"> = {};

type Channel = {
  id: string;
  socialChannelId: string;
  platform: string;
  accountName: string;
  payload?: Record<string, unknown> | null;
  sourceRevision?: number | null;
  currentRevision?: number;
};

export interface MessagesPanelProps {
  workspaceSlug: string;
  contentItemId: string;
  format: ContentFormat;
  initialPayload: Record<string, unknown>;
  contentLocale: string;
  channels: Channel[];
  canEdit: boolean;
  /** Managers/planners can select destinations from the Details surface. */
  canManageChannels?: boolean;
}

/** Canonical shared-copy editor. The legacy component name remains exported
 * so old imports and tests continue to resolve while the product surface is
 * now called Copy. */
export function AudienceCopyPanel({
  workspaceSlug,
  contentItemId,
  format,
  initialPayload,
  contentLocale,
  channels,
  canEdit,
  canManageChannels = false,
}: MessagesPanelProps) {
  const locale = useLocaleCode();
  const t = useLocaleT();
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) => {
    const result = t(key, params);
    return result === key
      ? fallback.replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? `{${name}}`))
      : result;
  };
  const localizedPlatformLabel = (platform: string) => {
    const key = `contentDetail.publishForm.platformLabels.${platform}`;
    const value = t(key);
    return value === key ? platformLabel(platform) : value;
  };
  const [payload, setPayload] = React.useState<Record<string, unknown>>(initialPayload);
  const initialJson = React.useMemo(() => JSON.stringify(initialPayload), [initialPayload]);
  const [savedJson, setSavedJson] = React.useState(initialJson);
  const boundAction = updateAudienceCopyAction.bind(null, workspaceSlug);
  const [state, formAction, pending] = useActionState(boundAction, initial);
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const dirty = JSON.stringify(payload) !== savedJson;

  React.useEffect(() => {
    // The server revalidation can replace the initial payload while this
    // persistent panel remains mounted; mirror that external snapshot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPayload(initialPayload);
    setSavedJson(initialJson);
    // The serialised snapshot is the stable identity; object props are
    // recreated by the Server Component on ordinary parent renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJson]);
  React.useEffect(() => {
    // useActionState reports the completed server write; mark this local
    // snapshot clean without unmounting the persistent Copy panel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state.ok) setSavedJson(JSON.stringify(payload));
    // Only react to a new action result. Keeping `payload` out of this
    // dependency list prevents a post-save edit from being marked clean.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);
  React.useEffect(() => {
    if (!state.fieldErrors || Object.keys(state.fieldErrors).length === 0) return;
    const handle = window.setTimeout(() => focusFirstInvalid(formRef.current), 0);
    return () => window.clearTimeout(handle);
  }, [state.fieldErrors]);

  useBeforeunloadDirtyGuard(formRef, !dirty);
  useNavigationDirtyGuard({
    formRef,
    isClean: !dirty,
    confirmMessage: tr(
      "contentDetail.copy.unsavedGuard",
      "You have unsaved changes in Copy. Leave and lose them?",
    ),
  });

  // Auto-save on idle: when the user stops typing for AUTOSAVE_DEBOUNCE_MS
  // and there are pending edits, requestSubmit() the form. 8s was chosen
  // (over the previous 800ms) because:
  //   - 800ms fired mid-thought on multi-word phrases and created
  //     "endless activity logs" (every partial word became a revision).
  //   - 8s matches the typical pause-to-think cadence for copy editing
  //     and is short enough that a habitual tab-switch still feels free.
  // The navigation/beforeunload guards above still kick in for real
  // navigation (closing the tab, clicking a tab pill while a save
  // is in flight) — we only kick off the save itself, not bypass
  // the safety rails.
  React.useEffect(() => {
    if (!dirty || pending) return;
    const timer = window.setTimeout(() => {
      const form = formRef.current;
      if (!form) return;
      if (typeof form.requestSubmit === "function") form.requestSubmit();
      else form.submit();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [dirty, pending, payload]);

  function setField(key: string, value: unknown) {
    setPayload((current) => ({ ...current, [key]: value }));
  }
  // Compute the at-a-glance counts for the channel-readiness card
  // header. Doing it once here keeps the summary in lockstep with the
  // per-channel rows below — if you filter a row out, the count
  // moves with it.
  const channelCounts = React.useMemo(() => {
    let overrides = 0;
    let stale = 0;
    for (const channel of channels) {
      const status = channelCopyStatus({
        hasOverride: channel.payload != null,
        sourceRevision: channel.sourceRevision ?? null,
        currentRevision: channel.currentRevision ?? null,
      });
      if (status === "custom") overrides += 1;
      if (status === "stale") stale += 1;
    }
    return { overrides, stale };
  }, [channels]);
  function setTranslation(key: string, code: string, value: string) {
    setPayload((current) => ({
      ...current,
      translations: {
        ...((current.translations as Record<string, Record<string, unknown>> | undefined) ?? {}),
        [code]: {
          ...(((current.translations as Record<string, Record<string, unknown>> | undefined) ?? {})[
            code
          ] ?? {}),
          [key]: value,
        },
      },
    }));
  }

  const translations =
    (payload.translations as Record<string, Record<string, unknown>> | undefined) ?? {};
  const copyFields = fieldsFor(format).filter((field) => isAudienceCopyKey(field.key));
  const copyLabels: Record<string, string> = {
    caption: tr("contentDetail.messages.captionLabel", "Caption"),
    hashtags: tr("contentDetail.messages.hashtagsLabel", "Hashtags"),
    firstComment: tr("contentDetail.messages.firstCommentLabel", "First comment"),
    callToAction: tr("formatEditor.fields.callToAction", "Call to action"),
    description: tr("formatEditor.fields.description", "Platform description"),
    location: tr("formatEditor.fields.location", "Location"),
  };
  const copyHints: Record<string, string> = {
    caption: tr(
      "contentDetail.messages.captionHint",
      "Write the complete text people will read with the post. Length warnings appear for each selected channel.",
    ),
    hashtags: tr(
      "contentDetail.messages.hashtagsHint",
      "Add up to 30 tags. Press Enter, comma, or space to add one.",
    ),
    firstComment: tr(
      "contentDetail.messages.firstCommentHint",
      "Optional follow-up published as the first comment when the channel supports it.",
    ),
    callToAction: tr(
      "contentDetail.messages.ctaHint",
      "Describe the action you want the audience to take. Add the final link per channel in Publishing.",
    ),
    description: tr(
      "contentDetail.messages.descriptionHint",
      "The audience-facing description used by supported channels.",
    ),
    location: tr(
      "contentDetail.messages.locationHint",
      "Optional location shown with the published post.",
    ),
  };
  const copyView = React.useMemo(
    () => buildAudienceCopyViewModel({ format, formatPayload: payload }),
    [format, payload],
  );
  const mapped = copyView.resolved;
  const fieldLabels = Object.fromEntries(
    copyFields.map((field) => [field.key, copyLabels[field.key] ?? t(field.labelKey)]),
  );

  return (
    <div className="space-y-4" data-testid="audience-copy-panel">
      <Card padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{tr("contentDetail.copy.title", "Audience copy")}</CardTitle>
            <CardDescription>
              {tr(
                "contentDetail.copy.description",
                "One shared source for the words your audience will read. Publishing owns the final channel-specific version.",
              )}
            </CardDescription>
          </div>
          <span className="text-label border-border bg-surface-subtle text-fg-secondary rounded-full border px-2 py-1 font-semibold">
            {tr("contentDetail.copy.sourceLanguage", "Source language: {language}", {
              language: contentLocale.toUpperCase(),
            })}
          </span>
        </div>
      </Card>

      <form ref={formRef} action={formAction} className="space-y-4" data-testid="messages-form">
        <input type="hidden" name="contentItemId" value={contentItemId} />
        <input type="hidden" name="format" value={format} />
        <input type="hidden" name="formatPayload" value={JSON.stringify(payload)} />
        <FormSummary
          {...(state.error ? { error: state.error } : {})}
          {...(state.fieldErrors ? { fieldErrors: state.fieldErrors } : {})}
          fieldLabels={fieldLabels}
        />
        {/* "Source copy" sub-header so the planner knows this
            section is the canonical author-side input and the
            Channel Readiness card below is read-only diagnostics. */}
        <div
          className="border-border bg-surface rounded-[var(--radius-control)] border px-4 py-3"
          data-testid="copy-source-section-header"
        >
          <h3 className="text-body text-fg-primary font-semibold">
            {tr("contentDetail.copy.sourceTitle", "Source copy")}
          </h3>
          <p className="text-label text-fg-secondary mt-1">
            {tr(
              "contentDetail.copy.sourceDescription",
              "The words your audience will read. Channels inherit this; override per channel in Publishing.",
            )}
          </p>
        </div>
        <div className="space-y-5">
          {copyFields.length === 0 ? (
            <p className="text-body text-fg-muted italic" role="status">
              {tr("contentDetail.copy.empty", "This format has no audience-copy fields yet.")}
            </p>
          ) : (
            copyFields.map((field) => {
              const renderer = rendererFor(field.key);
              return (
                <div key={field.key} data-testid={`copy-field-${field.key}`}>
                  {renderer({
                    fieldKey: field.key,
                    label: copyLabels[field.key] ?? t(field.labelKey),
                    hint: copyHints[field.key],
                    payload,
                    translations,
                    locale: contentLocale,
                    editable: canEdit && !pending,
                    aiEnabled: canEdit,
                    contentItemId,
                    t,
                    onField: setField,
                    onTranslation: setTranslation,
                  })}
                </div>
              );
            })
          )}
        </div>

        <div
          className="bg-surface sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:-mx-6 sm:px-6"
          data-testid="copy-save-bar"
        >
          <p
            className={cn(
              "text-label inline-flex items-center gap-1",
              state?.error
                ? "text-danger font-semibold"
                : pending
                  ? "text-fg-secondary"
                  : dirty
                    ? "text-warning"
                    : "text-success",
            )}
            aria-live="polite"
            data-testid="messages-save-status"
            data-state={state?.error ? "error" : pending ? "saving" : dirty ? "dirty" : "saved"}
          >
            {state?.error ? (
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
            ) : pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : dirty ? (
              <span
                aria-hidden="true"
                className="bg-warning inline-block h-1.5 w-1.5 rounded-full"
              />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {state?.error
              ? tr("contentDetail.copy.saveFailed", "Save failed — see error above")
              : pending
                ? tr("contentDetail.copy.autoSaving", "Saving…")
                : dirty
                  ? tr("contentDetail.copy.unsaved", "Unsaved changes — auto-save in a moment")
                  : tr("contentDetail.copy.allSaved", "All changes saved")}
          </p>
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              disabled={!canEdit || pending || !dirty}
              data-testid="messages-save-now"
            >
              {tr("contentDetail.copy.saveNow", "Save now")}
            </Button>
          </div>
        </div>
      </form>

      <Card padding="lg" data-testid="copy-channel-readiness">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1">
            <CardTitle>{tr("contentDetail.copy.readinessTitle", "Channel readiness")}</CardTitle>
            <p className="text-label text-fg-muted mt-1">
              {tr(
                "contentDetail.copy.readinessDescription",
                "Review the shared copy before opening Publishing for language, metadata, and final approval.",
              )}
            </p>
            {/* Compact at-a-glance summary that stays visible even when
                the per-channel list is collapsed. The planner gets
                the current state of copy health on every visit
                without scrolling. */}
            {channels.length > 0 ? (
              <p
                className="text-label text-fg-secondary mt-3 flex flex-wrap items-center gap-3"
                data-testid="copy-channel-readiness-summary"
              >
                <span>
                  <span className="text-fg-primary font-semibold">{channels.length}</span>{" "}
                  {tr("contentDetail.copy.channelsCount", "channels")}
                </span>
                {channelCounts.overrides > 0 ? (
                  <span
                    className="text-info inline-flex items-center gap-1"
                    data-testid="copy-override-summary"
                  >
                    <span
                      aria-hidden="true"
                      className="bg-info inline-block h-1.5 w-1.5 rounded-full"
                    />
                    <span className="font-semibold">{channelCounts.overrides}</span>{" "}
                    {tr("contentDetail.copy.overridesCount", "with custom override")}
                  </span>
                ) : null}
                {channelCounts.stale > 0 ? (
                  <span
                    className="text-warning inline-flex items-center gap-1"
                    data-testid="copy-stale-summary"
                  >
                    <span
                      aria-hidden="true"
                      className="bg-warning inline-block h-1.5 w-1.5 rounded-full"
                    />
                    <span className="font-semibold">{channelCounts.stale}</span>{" "}
                    {tr("contentDetail.copy.staleCount", "marked stale")}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          {channels.length > 0 ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/app/w/${workspaceSlug}/planning/${contentItemId}/publish`}>
                {tr("contentDetail.copy.openPublishing", "Review in Publishing")}
              </Link>
            </Button>
          ) : null}
        </div>
        {/* Per-channel list is collapsed by default. Planners see the
            summary above; expanding is one click when they need the
            per-channel override depth (writer wants to edit one
            channel without leaving the Copy tab). */}
        {channels.length > 0 ? (
          <div
            className="border-info bg-info-subtle text-fg-primary mt-4 rounded-[var(--radius-control)] border p-3"
            role="note"
            data-testid="copy-version-explanation"
          >
            <p className="text-label">
              {tr(
                "contentDetail.copy.versionExplanation",
                "Shared copy is the starting point. Inherited channels use it as-is; custom overrides are the channel's final version. Review the final result in Publishing.",
              )}
            </p>
          </div>
        ) : null}
        {channels.length === 0 ? (
          <div
            className="border-border bg-surface-subtle mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border p-3"
            role="status"
            data-testid="copy-no-channels"
          >
            <p className="text-body text-fg-secondary">
              {canManageChannels
                ? tr(
                    "contentDetail.copy.noChannelsDescription",
                    "No destination channels are selected yet. Add them from Details before configuring publishing.",
                  )
                : tr(
                    "contentDetail.copy.noChannelsOwner",
                    "No destination channels are selected yet. A workspace manager or planner must add one from Details before publishing can be configured.",
                  )}
            </p>
            {canManageChannels ? (
              <Button asChild size="sm" variant="outline">
                <TabSwitchLink href="#overview">
                  {tr("contentDetail.copy.openDetails", "Open Details")}
                </TabSwitchLink>
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="mt-3 space-y-3" data-testid="messages-per-channel-list">
            {Object.entries(
              channels.reduce<Record<string, typeof channels>>((groups, ch) => {
                const key = ch.platform.toLowerCase();
                (groups[key] ??= []).push(ch);
                return groups;
              }, {}),
            ).map(([platformKey, platformChannels]) => (
              <li
                key={platformKey}
                className="space-y-2"
                data-testid={`messages-platform-group-${platformKey}`}
              >
                <p
                  className="text-label text-fg-secondary flex items-center gap-2 font-semibold tracking-wide uppercase"
                  data-testid={`messages-platform-group-${platformKey}-label`}
                >
                  <span aria-hidden="true" className="bg-fg-muted inline-block h-px w-3" />
                  {localizedPlatformLabel(platformKey)}
                  <span className="text-fg-muted font-normal normal-case">
                    ({platformChannels.length})
                  </span>
                </p>
                <ul className="space-y-2">
                  {platformChannels.map((channel) => {
                    const platform = channel.platform.toLowerCase();
                    const limit =
                      platform === "twitter" || platform === "x"
                        ? 280
                        : platform === "linkedin"
                          ? 3000
                          : 2200;
                    const caption = typeof mapped?.caption === "string" ? mapped.caption : "";
                    const hashtagCount = mapped?.hashtags?.length ?? 0;
                    const custom =
                      channel.payload != null &&
                      [
                        "caption",
                        "description",
                        "firstComment",
                        "hashtags",
                        "callToAction",
                        "location",
                      ].some(
                        (key) =>
                          channel.payload?.[key] !== undefined &&
                          JSON.stringify(channel.payload[key]) !==
                            JSON.stringify(mapped[key as keyof typeof mapped]),
                      );
                    const copyStatus = channelCopyStatus({
                      hasOverride: custom,
                      ...(channel.sourceRevision !== undefined
                        ? { sourceRevision: channel.sourceRevision }
                        : {}),
                      ...(channel.currentRevision !== undefined
                        ? { currentRevision: channel.currentRevision }
                        : {}),
                    });
                    const language =
                      typeof channel.payload?.contentLanguage === "string"
                        ? channel.payload.contentLanguage
                        : contentLocale;
                    return (
                      <li
                        key={channel.id}
                        className={cn(
                          "border-border bg-surface-container rounded-[var(--radius-control)] border p-3",
                          // Subtle border tint when the channel has a custom
                          // override — matches the workflow badge above so
                          // the planner can scan a long list and find the
                          // channels that need attention.
                          copyStatus === "custom" && "border-info",
                          copyStatus === "stale" && "border-warning",
                        )}
                        data-testid={`messages-per-channel-row-${channel.socialChannelId}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-label text-fg-primary font-semibold">
                            <bdi>{localizedPlatformLabel(channel.platform)}</bdi> ·{" "}
                            <bdi>{channel.accountName}</bdi>
                          </p>
                          {copyStatus !== "inherited" && channels ? (
                            <TabSwitchLink
                              href="#publishing"
                              data-testid={`messages-channel-jump-${channel.socialChannelId}`}
                              className={cn(
                                "text-label inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold transition-opacity hover:opacity-80",
                                copyStatus === "stale"
                                  ? "bg-warning-subtle text-warning"
                                  : "bg-info-subtle text-info",
                              )}
                            >
                              {/* Coloured status dot — gives the eye an
                          instant visual anchor before the user reads
                          the badge label. */}
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  copyStatus === "stale" ? "bg-warning" : "bg-info",
                                )}
                              />
                              {copyStatus === "stale"
                                ? tr(
                                    "contentDetail.copy.staleOverride",
                                    "Custom override — shared copy changed",
                                  )
                                : tr("contentDetail.copy.customOverride", "Custom override")}
                              <ChevronRight className="h-3 w-3" aria-hidden="true" />
                            </TabSwitchLink>
                          ) : (
                            <span className="text-label bg-surface text-fg-secondary inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold">
                              <span
                                aria-hidden="true"
                                className="bg-fg-muted h-1.5 w-1.5 rounded-full"
                              />
                              {tr("contentDetail.copy.inherited", "Inherited shared copy")}
                            </span>
                          )}
                          {/* Keep the override badge reachable for the
                              accessibility tree. The data-testid
                              attribute below lets the existing
                              per-channel tests still assert the
                              "stale" vs "custom" state off the row. */}
                          <span
                            className="sr-only"
                            data-testid={`messages-channel-status-${channel.socialChannelId}`}
                            data-status={copyStatus}
                          >
                            {copyStatus === "stale"
                              ? tr(
                                  "contentDetail.copy.staleOverride",
                                  "Custom override — shared copy changed",
                                )
                              : copyStatus === "custom"
                                ? tr("contentDetail.copy.customOverride", "Custom override")
                                : tr("contentDetail.copy.inherited", "Inherited shared copy")}
                          </span>
                        </div>
                        {/* Metadata strip — language + counters + warnings,
                      grouped into a single line so the planner can
                      scan a long list of channels in one glance. The
                      `role="list"` keeps SR rotor behaviour. */}
                        <div
                          className="text-label text-fg-secondary mt-2 flex flex-wrap items-center gap-x-4 gap-y-1"
                          role="list"
                          aria-label={tr(
                            "contentDetail.copy.perChannelMetaLabel",
                            "Channel copy summary",
                          )}
                        >
                          <span role="listitem">
                            <span className="text-fg-muted">
                              {tr("contentDetail.copy.languageShort", "Lang")}:{" "}
                            </span>
                            {language.toUpperCase()}
                          </span>
                          <span
                            role="listitem"
                            className={caption.length > limit ? "text-danger font-semibold" : ""}
                          >
                            <span className="text-fg-muted">
                              {tr("contentDetail.copy.charactersShort", "Chars")}:{" "}
                            </span>
                            {formatNumber(caption.length, locale)} / {formatNumber(limit, locale)}
                          </span>
                          <span role="listitem">
                            <span className="text-fg-muted">
                              {tr("contentDetail.copy.hashtagsShort", "Tags")}:{" "}
                            </span>
                            {formatNumber(hashtagCount, locale)} / 30
                          </span>
                          {caption.length > limit ? (
                            <span
                              role="alert"
                              className="text-danger inline-flex items-center gap-1"
                            >
                              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                              {tr(
                                "contentDetail.copy.characterWarning",
                                "Too long for this channel",
                              )}
                            </span>
                          ) : null}
                          {language !== contentLocale && !copyView.translations[language] ? (
                            <span
                              role="listitem"
                              className="text-warning inline-flex items-center gap-1"
                            >
                              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                              {tr("contentDetail.copy.missingTranslation", "Missing translation")}
                            </span>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
        <div
          className="border-info bg-info-subtle text-fg-primary mt-4 flex items-start gap-2 rounded-[var(--radius-control)] border p-3"
          role="note"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="text-label">
            {tr(
              "contentDetail.copy.publishHandoff",
              "Publishing is where you choose each channel language, add destinations and disclosures, and approve the final copy.",
            )}
          </p>
        </div>
      </Card>
    </div>
  );
}

export const MessagesPanel = AudienceCopyPanel;

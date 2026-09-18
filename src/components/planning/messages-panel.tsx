"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { TabSwitchLink } from "@/components/planning/tab-switch-link";
import { CheckCircle2, Loader2, AlertCircle, ChevronRight } from "lucide-react";
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
    // CTA is the *label* half of {label, url}. The URL lives in
    // Publishing. The Copy tab prefers the explicit `callToActionLabel`
    // string (en: "CTA label" / ar: "تسمية الإجراء") and falls back to
    // the legacy `callToAction` value if the new key is missing — keeps
    // back-compat for translators who only filled in the old key.
    callToAction: (() => {
      const newLabel = t("formatEditor.fields.callToActionLabel");
      if (newLabel && newLabel !== "formatEditor.fields.callToActionLabel") return newLabel;
      return tr("formatEditor.fields.callToAction", "Call to action");
    })(),
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

  // Resolve the audience-copy view model up-front so the
  // `perChannelList` IIFE below can read `mapped` from its closure
  // without tripping the const TDZ (originally this was inline in the
  // JSX, which avoided the TDZ because `mapped` was already declared
  // by the time the JSX ran; the lift preserves render-time ordering).
  const copyView = React.useMemo(
    () => buildAudienceCopyViewModel({ format, formatPayload: payload }),
    [format, payload],
  );
  const mapped = copyView.resolved;

  // Lifted out of the return statement so the JSX parser does not have
  // to walk a ternary inside a ternary inside <details>. The original
  // structure worked but TSX confused the deeply-nested `(... ? ( <ul> )
  // : ( ... ))` with an unclosed parenthesis in some setups; lifting
  // it into a `const` removes the ambiguity without changing the
  // rendered DOM.
  const perChannelList = (() => {
    if (channels.length === 0) {
      return (
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
      );
    }
    return (
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
                        <span role="alert" className="text-danger inline-flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          {tr("contentDetail.copy.characterWarning", "Too long for this channel")}
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
    );
  })();
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
              {tr("contentDetail.copy.subtitle", "The words your audience will read.")}
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
            {/* Compact at-a-glance summary that stays visible even when
                the per-channel list is collapsed. The planner gets
                the current state of copy health on every visit
                without scrolling. */}
            {channels.length > 0 ? (
              <p
                className="text-label text-fg-secondary mt-2 flex flex-wrap items-center gap-3"
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
            channel without leaving the Copy tab). The list body is
            lifted into the `perChannelList` const above so this region
            stays a clean ternary with no nested JSX ternaries. */}
        {channels.length > 0 ? (
          <details className="mt-3" data-testid="copy-channel-list-details">
            <summary className="text-label text-fg-secondary focus-visible:ring-focus-ring cursor-pointer rounded-[var(--radius-control)] px-1 py-1 font-semibold select-none focus:outline-none focus-visible:ring-2">
              {tr("contentDetail.copy.perChannelSummary", "Per-channel override state ({count})", {
                count: channels.length,
              })}
            </summary>
            {perChannelList}
          </details>
        ) : (
          perChannelList
        )}
      </Card>
    </div>
  );
}

export const MessagesPanel = AudienceCopyPanel;

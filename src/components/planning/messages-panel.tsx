"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle2, Info, Loader2, Save } from "lucide-react";
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
}: MessagesPanelProps) {
  const locale = useLocaleCode();
  const t = useLocaleT();
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) => {
    const result = t(key, params);
    return result === key
      ? fallback.replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? `{${name}}`))
      : result;
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

  function setField(key: string, value: unknown) {
    setPayload((current) => ({ ...current, [key]: value }));
  }
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
          className="bg-surface sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:-mx-6 sm:px-6"
          data-testid="copy-save-bar"
        >
          <p className="text-label text-fg-secondary" aria-live="polite">
            {dirty
              ? tr("contentDetail.copy.unsaved", "Unsaved changes")
              : tr("contentDetail.copy.allSaved", "All changes saved")}
          </p>
          <div className="flex items-center gap-3">
            {state.ok && !pending ? (
              <span className="text-label text-success inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                {tr("contentDetail.copy.saved", "Saved")}
              </span>
            ) : null}
            <Button
              type="submit"
              size="lg"
              disabled={!canEdit || pending || !dirty}
              data-testid="messages-save"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {pending
                ? tr("contentDetail.copy.saving", "Saving…")
                : tr("contentDetail.copy.save", "Save copy")}
            </Button>
          </div>
        </div>
      </form>

      <Card padding="lg" data-testid="copy-channel-readiness">
        <CardTitle>{tr("contentDetail.copy.readinessTitle", "Channel readiness")}</CardTitle>
        <p className="text-label text-fg-muted mt-1">
          {tr(
            "contentDetail.copy.readinessDescription",
            "Review the shared copy before opening Publishing for language, metadata, and final approval.",
          )}
        </p>
        {channels.length === 0 ? (
          <p className="text-body text-fg-muted mt-3 italic" role="status">
            {tr("contentDetail.messages.noChannels", "No channels selected yet.")}
          </p>
        ) : (
          <ul className="mt-3 space-y-2" data-testid="messages-per-channel-list">
            {channels.map((channel) => {
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
                  className="border-border bg-surface-container rounded-[var(--radius-control)] border p-3"
                  data-testid={`messages-per-channel-row-${channel.socialChannelId}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-label text-fg-secondary font-semibold">
                      <bdi>{channel.platform}</bdi> · <bdi>{channel.accountName}</bdi>
                    </p>
                    <span className="text-label bg-surface rounded-full px-2 py-0.5 font-semibold">
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
                  <div className="text-label text-fg-secondary mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    <span>
                      {tr("contentDetail.copy.resolvedLanguage", "Language: {language}", {
                        language: language.toUpperCase(),
                      })}
                    </span>
                    <span className={caption.length > limit ? "text-danger font-semibold" : ""}>
                      {tr("contentDetail.copy.characterStatus", "{count} / {limit} characters", {
                        count: formatNumber(caption.length, locale),
                        limit: formatNumber(limit, locale),
                      })}
                    </span>
                    <span>
                      {tr("contentDetail.copy.hashtagStatus", "{count} / 30 hashtags", {
                        count: formatNumber(hashtagCount, locale),
                      })}
                    </span>
                    {caption.length > limit ? (
                      <span role="alert">
                        {tr("contentDetail.copy.characterWarning", "Too long for this channel")}
                      </span>
                    ) : null}
                    {language !== contentLocale && !copyView.translations[language] ? (
                      <span className="text-warning">
                        {tr("contentDetail.copy.missingTranslation", "Missing translation")}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
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

"use client";

import * as React from "react";
import { useActionState } from "react";
import { Save, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { CaptionField } from "@/components/forms/caption-field";
import { HashtagEditor } from "@/components/forms/hashtag-editor";
import { FormSummary } from "@/components/forms/form-summary";
import { focusFirstInvalid } from "@/lib/forms/focus-first-invalid";
import { useBeforeunloadDirtyGuard } from "@/lib/forms/use-beforeunload-dirty-guard";
import { updateFormatPayloadAction } from "@/app/(app)/app/w/[slug]/planning/actions";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { mapFormatPayloadToPlatform } from "@/lib/format-payload/mapper";
import { type ContentFormat } from "@/lib/format-payload/schemas";
import { type ActionState } from "@/lib/validation/action-state";

/**
 * MessagesPanel — the 6th tab on the post detail page.
 *
 * Plan §3: the audience-facing copy (caption + hashtags +
 * first comment + per-channel preview) is consolidated into
 * one tab. The tab is between Content and Preview in the
 * detail page's tab strip. It is the planner's working
 * draft surface; the per-platform adaptation preview table
 * shows what the formatPayload maps to for each
 * content_item_channel.
 *
 * The save is a single `updateFormatPayloadAction` call —
 * the editor's existing service. The form serialises the
 * in-memory payload (caption + hashtags + firstComment) into
 * the existing `formatPayload` JSON shape and posts it.
 *
 * Why this is a separate tab and not a sub-section of the
 * Content tab: the Content tab is the per-format structured
 * editor (per §15, the per-format fields like scenes,
 * slideOutline, hooks). The Messages tab is the
 * audience-facing text surface that already exists in two
 * places (the per-format editor's "copy" section + the
 * PublishPackageForm). Consolidating them gives the
 * publisher a single view of "what the audience sees".
 */
const CAPTION_ID = "messages-caption";
const HASHTAGS_ID = "messages-hashtags";
const FIRST_COMMENT_ID = "messages-first-comment";
const FIRST_COMMENT_MAX = 2_200;

const FIELD_LABELS: Record<string, string> = {
  formatPayload: "Message",
};

export interface MessagesPanelProps {
  workspaceSlug: string;
  contentItemId: string;
  format: ContentFormat;
  initialCaption: string;
  initialHashtags: string[];
  initialFirstComment: string;
  channels: Array<{
    id: string;
    socialChannelId: string;
    platform: string;
    accountName: string;
  }>;
  /** Whether the current user can edit. */
  canEdit: boolean;
}

const initial: ActionState<"formatPayload"> = {};

export function MessagesPanel({
  workspaceSlug,
  contentItemId,
  format,
  initialCaption,
  initialHashtags,
  initialFirstComment,
  channels,
  canEdit,
}: MessagesPanelProps) {
  const t = useLocaleT();
  const tr = (key: string, fallback: string) => (t(key) === key ? fallback : t(key));
  const [caption, setCaption] = React.useState(initialCaption);
  const [hashtags, setHashtags] = React.useState<string[]>(initialHashtags);
  const [firstComment, setFirstComment] = React.useState(initialFirstComment);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  const boundAction = updateFormatPayloadAction.bind(null, workspaceSlug);
  const [state, formAction, pending] = useActionState(boundAction, initial);
  const formRef = React.useRef<HTMLFormElement | null>(null);

  // The form posts a single `formatPayload` JSON field that
  // merges caption + hashtags + firstComment into the
  // existing schemaVersion=1 contract.
  const payloadJson = React.useMemo(
    () =>
      JSON.stringify({
        schemaVersion: 1,
        caption: caption.trim() || undefined,
        hashtags: hashtags.length > 0 ? hashtags : undefined,
        firstComment: firstComment.trim() || undefined,
      }),
    [caption, hashtags, firstComment],
  );

  // Focus the first invalid field on submit failure.
  React.useEffect(() => {
    if (state?.fieldErrors && Object.keys(state.fieldErrors).length > 0) {
      const handle = window.setTimeout(() => {
        focusFirstInvalid(formRef.current);
      }, 0);
      return () => window.clearTimeout(handle);
    }
    return undefined;
  }, [state?.fieldErrors]);

  // Mark the form clean after a successful save so the
  // beforeunload prompt doesn't fire for already-saved data.
  const isClean = state.ok === true;
  useBeforeunloadDirtyGuard(formRef, isClean);

  // Per-channel preview: derive the per-platform fields
  // from the planner's current draft. The publisher may
  // still override on the Publishing tab; this is the
  // planner's-eye view.
  const mapped = React.useMemo(
    () =>
      mapFormatPayloadToPlatform({
        format,
        formatPayload: {
          schemaVersion: 1,
          caption,
          hashtags,
          firstComment,
        },
      }),
    [format, caption, hashtags, firstComment],
  );

  return (
    <div className="space-y-4" data-testid="messages-panel">
      <form
        ref={formRef}
        action={formAction}
        className="space-y-4"
        data-testid="messages-form"
      >
        <input type="hidden" name="contentItemId" value={contentItemId} />
        <input type="hidden" name="format" value={format} />
        <input type="hidden" name="formatPayload" value={payloadJson} />

        <FormSummary
          {...(state?.error ? { error: state.error } : {})}
          {...(state?.fieldErrors ? { fieldErrors: state.fieldErrors } : {})}
          fieldLabels={FIELD_LABELS}
        />

        <CaptionField
          id={CAPTION_ID}
          name="caption"
          label={tr("contentDetail.messages.captionLabel", "Caption")}
          hint={tr(
            "contentDetail.messages.captionHint",
            "What people will see when the post lands in their feed.",
          )}
          value={caption}
          onChange={setCaption}
          disabled={!canEdit || pending}
          testId="messages-caption-field"
        />

        <HashtagEditor
          id={HASHTAGS_ID}
          name="hashtags"
          label={tr("contentDetail.messages.hashtagsLabel", "Hashtags")}
          value={hashtags}
          onChange={setHashtags}
          disabled={!canEdit || pending}
          hint={tr(
            "contentDetail.messages.hashtagsHint",
            "Press Enter, comma, or space to add. Up to 30 tags.",
          )}
          testId="messages-hashtags-editor"
        />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={FIRST_COMMENT_ID}
            className="text-body text-fg-primary font-semibold"
          >
            {tr("contentDetail.messages.firstCommentLabel", "First comment")}
          </label>
          <textarea
            id={FIRST_COMMENT_ID}
            name="firstComment"
            value={firstComment}
            onChange={(e) => setFirstComment(e.target.value)}
            rows={4}
            maxLength={FIRST_COMMENT_MAX}
            disabled={!canEdit || pending}
            placeholder={tr(
              "contentDetail.messages.firstCommentPlaceholder",
              "Optional — published as the first comment on the post.",
            )}
            className="border-border bg-surface text-fg-primary text-body placeholder:text-fg-muted focus-visible:ring-focus-ring w-full resize-y rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
            data-testid="messages-first-comment-field"
          />
          <p
            className="text-label text-fg-muted text-end font-mono tabular-nums"
            aria-live="polite"
            data-testid="messages-first-comment-counter"
          >
            {firstComment.length.toLocaleString()} / {FIRST_COMMENT_MAX.toLocaleString()}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="submit"
            size="lg"
            disabled={!canEdit || pending}
            data-testid="messages-save"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {pending
              ? tr("contentDetail.messages.saving", "Saving…")
              : tr("contentDetail.messages.save", "Save message")}
          </Button>
          {savedAt && !pending && !state?.error && state?.ok ? (
            <p
              className="text-label text-success inline-flex items-center gap-1"
              data-testid="messages-save-confirmation"
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              {tr("contentDetail.messages.saved", "Saved")}
            </p>
          ) : null}
        </div>
      </form>

      {/* Per-channel preview */}
      <Card padding="lg" data-testid="messages-per-channel-preview">
        <CardTitle>
          {tr("contentDetail.messages.perChannelPreviewTitle", "Per-channel preview")}
        </CardTitle>
        <p className="text-label text-fg-muted mt-1">
          {tr(
            "contentDetail.messages.perChannelPreviewBlurb",
            "What the publisher will see for each channel. The publisher can still override per-channel on the Publishing tab.",
          )}
        </p>
        {channels.length === 0 ? (
          <p className="text-body text-fg-muted mt-3 italic">
            {tr("contentDetail.messages.noChannels", "No channels selected yet.")}
          </p>
        ) : (
          <ul className="mt-3 space-y-2" data-testid="messages-per-channel-list">
            {channels.map((ch) => {
              const caption = mapped?.caption ?? "";
              const hashtags = mapped?.hashtags ?? [];
              return (
                <li
                  key={ch.id}
                  className="border-border bg-surface-container rounded-[var(--radius-control)] border p-3"
                  data-testid={`messages-per-channel-row-${ch.socialChannelId}`}
                >
                  <p className="text-label text-fg-secondary font-semibold uppercase tracking-wide">
                    {ch.platform} · {ch.accountName}
                  </p>
                  {caption ? (
                    <p className="text-body text-fg-primary mt-1 whitespace-pre-wrap">
                      {caption}
                    </p>
                  ) : (
                    <p className="text-label text-fg-muted mt-1 italic">
                      {tr("contentDetail.messages.perChannelEmpty", "No caption yet.")}
                    </p>
                  )}
                  {hashtags.length > 0 ? (
                    <p className="text-label text-fg-muted mt-1 flex flex-wrap gap-1">
                      {hashtags.map((tag) => (
                        <span
                          key={tag}
                          className="border-border bg-surface rounded-full border px-1.5 py-0.5"
                        >
                          #{tag}
                        </span>
                      ))}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

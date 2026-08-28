"use client";

import * as React from "react";
import { useActionState } from "react";
import { ChevronDown, Save, Loader2, ListChecks } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { DirAwareInput, DirAwareTextarea } from "@/components/forms/dir-aware-textarea";
import { PerFieldAiSuggest, type PerFieldAiField } from "@/components/forms/per-field-ai-suggest";
import { TranslationPanel } from "@/components/forms/translation-panel";
import { NavigableArrayField } from "@/components/forms/navigable-array-field";
import { updateFormatPayloadAction } from "@/app/(app)/app/w/[slug]/planning/actions";
import { getByCode, resolveLocale, type LocaleCode } from "@/lib/i18n/locales";
import { type ContentFormat } from "@/lib/format-payload/schemas";

/**
 * `More details` editor for `content_item.format_payload`.
 *
 * The disclosure renders the per-format structured fields
 * (caption, hook, mainMessage, callToAction, hashtags,
 * references, slideOutline, scenes, coverDirection, …) for
 * the active content item. Every field is optional (Quick
 * Create writes just `{ schemaVersion: 1 }`), the editor
 * normalises nulls on save, and the per-format Zod schema
 * (see `lib/format-payload/schemas.ts`) is the source of
 * truth for both validation and the field set.
 *
 * The UX choices (kept consistent with §17 + the
 * format-payload-schemas doc):
 *
 *   - All fields are *optional*. The disclosure is a
 *     card-section under the brief; the planner opens it
 *     when they need to write structured fields and closes
 *     it when they don't.
 *   - Each text field has a dir-aware input (auto
 *     RTL/LTR from the first char) and a translation
 *     sidecar. The sidecar is collapsed by default; the
 *     planner expands a locale when they need it.
 *   - Each field has a per-field AI suggest button. The
 *     button is hidden when the agency's
 *     `caption_drafts` capability is off.
 *   - Read-only fields are a separate code path: a
 *     non-updateable content item (anything past
 *     `changes_requested`) shows the same shape but
 *     every input is `readOnly`. The disclosure stays
 *     usable as a reference for creative handoff.
 *
 * Save semantics: the editor holds the full `formatPayload`
 * in React state; on save it serialises to JSON, posts via
 * the server action, and re-renders from the new server
 * state. Failed saves surface the error inline; the planner
 * can retry without losing their edits.
 */
export interface FormatPayloadEditorProps {
  workspaceSlug: string;
  contentItemId: string;
  format: ContentFormat;
  /** The current `formatPayload` value from the server. */
  initial: Record<string, unknown>;
  /** Whether the actor can edit (manager / planner + status updateable). */
  editable: boolean;
  /** Active agency locale — drives the fallback dir for every input. */
  locale: string;
  /**
   * Whether the agency's `caption_drafts` capability is
   * enabled. When false, all per-field AI buttons are
   * hidden (the route still won't serve a draft, so the
   * buttons would just 403).
   */
  aiEnabled: boolean;
}

const initial: { error?: string; ok?: true } = {};

export function FormatPayloadEditor({
  workspaceSlug,
  contentItemId,
  format,
  initial: initialPayload,
  editable,
  locale,
  aiEnabled,
}: FormatPayloadEditorProps) {
  // Local state holds the in-progress edits. Initial value
  // is the server-provided row; the server is the source of
  // truth on save.
  const [payload, setPayload] = React.useState<Record<string, unknown>>(initialPayload);
  const [open, setOpen] = React.useState<boolean>(false);

  // Reset local state when the server-provided value
  // changes (e.g. another tab saved a new version, or the
  // page revalidated). We compare against a JSON
  // serialisation of the initial value; a re-render with
  // the same value must not clobber the user's in-progress
  // edits.
  const initialJson = React.useMemo(() => JSON.stringify(initialPayload), [initialPayload]);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPayload(initialPayload);
    // Only on `initialJson` change — we don't want to reset
    // on every render of the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJson]);

  const boundAction = updateFormatPayloadAction.bind(null, workspaceSlug);
  const [state, formAction, pending] = useActionState(boundAction, initial);

  // "X / Y filled" badge for the disclosure header. Counts
  // every non-translation leaf value the planner wrote.
  // The total is the count of "creative" keys we render
  // for the active format — the badge is a soft progress
  // signal, not a hard requirement, and lives next to the
  // Show / Hide toggle.
  const completion = React.useMemo(() => {
    const filled = Object.entries(payload).filter(([k, v]) => {
      if (k === "schemaVersion" || k === "translations") return false;
      if (v === null || v === undefined) return false;
      if (typeof v === "string") return v.trim().length > 0;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "object") return Object.keys(v as object).length > 0;
      return true;
    }).length;
    return filled;
  }, [payload]);

  // Resolve the workspace locale once; the dir-aware
  // inputs read it from `locale` directly.
  resolveLocale(locale);

  // The `translations` map lives at the top of the payload
  // (it's the same shape for every format). Pull it out so
  // each field can read its own slice.
  const translations =
    (payload.translations as Record<string, Record<string, unknown>> | undefined) ?? {};

  function setField(fieldKey: string, value: unknown) {
    setPayload((prev) => ({ ...prev, [fieldKey]: value }));
  }

  function setFieldTranslation(fieldKey: string, localeCode: LocaleCode, value: string) {
    setPayload((prev) => {
      const current =
        (prev.translations as Record<string, Record<string, string>> | undefined) ?? {};
      const fieldMap = current[localeCode] ?? {};
      const next = {
        ...current,
        [localeCode]: { ...fieldMap, [fieldKey]: value },
      };
      return { ...prev, translations: next };
    });
  }

  return (
    <Card data-testid="format-payload-editor" data-format={format}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle>More details</CardTitle>
            <span
              className="text-label text-fg-secondary border-border bg-surface-subtle inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold"
              data-testid="format-payload-completion"
              aria-label={`${completion} fields filled`}
            >
              {completion} filled
            </span>
          </div>
          <CardDescription>
            Per-format creative contract — caption, hashtags, scenes, visual direction,
            translations. Everything is optional.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="format-payload-editor-body"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
          {open ? "Hide" : "Show"}
        </Button>
      </div>

      {open ? (
        <div id="format-payload-editor-body" className="mt-4 space-y-6">
          {!editable ? (
            <p className="text-label text-fg-muted inline-flex items-center gap-1.5">
              <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
              Read-only — this item is past <em>changes_requested</em>.
            </p>
          ) : null}

          <FormatFields
            format={format}
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={setField}
            onTranslation={setFieldTranslation}
          />

          {editable ? (
            <form
              action={(fd) => {
                fd.set("contentItemId", contentItemId);
                fd.set("format", format);
                fd.set("formatPayload", JSON.stringify(payload));
                formAction(fd);
              }}
              className="space-y-3"
            >
              {state?.error ? (
                <p role="alert" className="text-label text-danger font-semibold">
                  {state.error}
                </p>
              ) : null}
              {state?.ok ? (
                <p
                  role="status"
                  className="text-label text-success font-semibold"
                  aria-live="polite"
                >
                  Saved.
                </p>
              ) : null}
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" aria-hidden="true" /> Save creative details
                  </>
                )}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

// ─── Per-format field renderer ─────────────────────────────────────

interface FormatFieldsProps {
  format: ContentFormat;
  payload: Record<string, unknown>;
  translations: Record<string, Record<string, unknown>>;
  locale: string;
  editable: boolean;
  aiEnabled: boolean;
  contentItemId: string;
  onField: (key: string, value: unknown) => void;
  onTranslation: (key: string, locale: LocaleCode, value: string) => void;
}

function FormatFields({
  format,
  payload,
  translations,
  locale,
  editable,
  aiEnabled,
  contentItemId,
  onField,
  onTranslation,
}: FormatFieldsProps) {
  // The set of fields differs by format. We render them in a
  // single `switch` so the file is grep-able by format; the
  // shared sub-renderers (TextField, TagField, SceneList)
  // keep the per-field UX consistent.
  switch (format) {
    case "static_post":
      return (
        <>
          <CommonObjectiveAudience
            payload={payload}
            locale={locale}
            editable={editable}
            onField={onField}
          />
          <TextField
            fieldKey="hook"
            label="Hook"
            hint="1-line scroll-stop"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <TextField
            fieldKey="mainMessage"
            label="Main message"
            hint="1-line takeaway"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <TextField
            fieldKey="callToAction"
            label="CTA"
            hint="1-line next action"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <LongTextField
            fieldKey="caption"
            label="Caption"
            hint="Pre-publish caption draft. The publish form adapts it per platform."
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <TagField
            fieldKey="hashtags"
            label="Hashtags"
            hint="One per line or space-separated"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <LongTextField
            fieldKey="firstComment"
            label="First comment"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <LocationField payload={payload} locale={locale} editable={editable} onField={onField} />
          <VisualSlidesField
            payload={payload}
            locale={locale}
            editable={editable}
            onField={onField}
          />
          <LongTextField
            fieldKey="visualDirection"
            label="Visual guidelines"
            hint="Direction for the designer — composition, colour, mood"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <ReferencesField
            payload={payload}
            locale={locale}
            editable={editable}
            onField={onField}
          />
          <LongTextField
            fieldKey="additionalNotes"
            label="Additional notes"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
        </>
      );
    case "carousel":
      return (
        <>
          <CommonObjectiveAudience
            payload={payload}
            locale={locale}
            editable={editable}
            onField={onField}
          />
          <TextField
            fieldKey="hook"
            label="Hook"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <TextField
            fieldKey="mainMessage"
            label="Main message"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <TextField
            fieldKey="callToAction"
            label="CTA"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <LongTextField
            fieldKey="caption"
            label="Caption"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <TagField
            fieldKey="hashtags"
            label="Hashtags"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <SlideOutlineField
            payload={payload}
            locale={locale}
            editable={editable}
            onField={onField}
          />
          <LongTextField
            fieldKey="visualDirection"
            label="Visual guidelines"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <ReferencesField
            payload={payload}
            locale={locale}
            editable={editable}
            onField={onField}
          />
          <LongTextField
            fieldKey="additionalNotes"
            label="Additional notes"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
        </>
      );
    case "story":
      return (
        <>
          <NumberField
            fieldKey="frameCount"
            label="Frame count"
            hint="1–5"
            min={1}
            max={5}
            payload={payload}
            locale={locale}
            editable={editable}
            onField={onField}
          />
          <TextField
            fieldKey="hook"
            label="Hook"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <LongTextField
            fieldKey="caption"
            label="Caption"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <TagField
            fieldKey="hashtags"
            label="Hashtags"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <LongTextField
            fieldKey="visualDirection"
            label="Visual guidelines"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <LongTextField
            fieldKey="additionalNotes"
            label="Additional notes"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
        </>
      );
    case "short_form_video":
      return (
        <>
          <NumberField
            fieldKey="durationSeconds"
            label="Duration (seconds)"
            hint="5–90"
            min={5}
            max={90}
            payload={payload}
            locale={locale}
            editable={editable}
            onField={onField}
          />
          <PlainTextField
            fieldKey="ratio"
            label="Ratio"
            hint="9:16 / 1:1 / 4:5"
            payload={payload}
            locale={locale}
            editable={editable}
            onField={onField}
          />
          <TextField
            fieldKey="hook"
            label="Hook"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <TextField
            fieldKey="mainMessage"
            label="Main message"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <TextField
            fieldKey="callToAction"
            label="CTA"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <LongTextField
            fieldKey="caption"
            label="Caption"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <TagField
            fieldKey="hashtags"
            label="Hashtags"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <ScenesField payload={payload} locale={locale} editable={editable} onField={onField} />
          <LongTextField
            fieldKey="onScreenText"
            label="On-screen text"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <LongTextField
            fieldKey="voiceOverNotes"
            label="Voiceover notes"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <PlainTextField
            fieldKey="audioReference"
            label="Audio reference"
            hint="URL to a mood reference or licensed track"
            payload={payload}
            locale={locale}
            editable={editable}
            onField={onField}
          />
          <TextField
            fieldKey="coverDirection"
            label="Cover direction"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <LongTextField
            fieldKey="visualDirection"
            label="Visual guidelines"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <ReferencesField
            payload={payload}
            locale={locale}
            editable={editable}
            onField={onField}
          />
          <LongTextField
            fieldKey="additionalNotes"
            label="Additional notes"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
        </>
      );
    case "long_form_video":
      return (
        <>
          <NumberField
            fieldKey="durationSeconds"
            label="Duration (seconds)"
            hint="30–3600"
            min={30}
            max={3600}
            payload={payload}
            locale={locale}
            editable={editable}
            onField={onField}
          />
          <PlainTextField
            fieldKey="ratio"
            label="Ratio"
            hint="16:9 / 9:16 / 1:1"
            payload={payload}
            locale={locale}
            editable={editable}
            onField={onField}
          />
          <TextField
            fieldKey="hook"
            label="Hook"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <TextField
            fieldKey="mainMessage"
            label="Main message"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <TextField
            fieldKey="callToAction"
            label="CTA"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <LongTextField
            fieldKey="caption"
            label="Caption"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <LongTextField
            fieldKey="description"
            label="Description"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <ChaptersField payload={payload} locale={locale} editable={editable} onField={onField} />
          <LongTextField
            fieldKey="visualDirection"
            label="Visual guidelines"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <ReferencesField
            payload={payload}
            locale={locale}
            editable={editable}
            onField={onField}
          />
          <LongTextField
            fieldKey="additionalNotes"
            label="Additional notes"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
        </>
      );
    case "live_content":
      return (
        <>
          <LongTextField
            fieldKey="caption"
            label="Caption"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <TagField
            fieldKey="hashtags"
            label="Hashtags"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <GuestsField payload={payload} locale={locale} editable={editable} onField={onField} />
          <RunOfShowField payload={payload} locale={locale} editable={editable} onField={onField} />
          <LongTextField
            fieldKey="visualDirection"
            label="Visual guidelines"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <LongTextField
            fieldKey="additionalNotes"
            label="Additional notes"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
        </>
      );
    case "article":
      return (
        <>
          <NumberField
            fieldKey="wordCount"
            label="Word count"
            hint="100–20000"
            min={100}
            max={20000}
            payload={payload}
            locale={locale}
            editable={editable}
            onField={onField}
          />
          <CommonObjectiveAudience
            payload={payload}
            locale={locale}
            editable={editable}
            onField={onField}
          />
          <TextField
            fieldKey="hook"
            label="Hook"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <TextField
            fieldKey="mainMessage"
            label="Main message"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <TextField
            fieldKey="callToAction"
            label="CTA"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <LongTextField
            fieldKey="caption"
            label="Caption"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <OutlineField payload={payload} locale={locale} editable={editable} onField={onField} />
          <ReferencesField
            payload={payload}
            locale={locale}
            editable={editable}
            onField={onField}
          />
          <LongTextField
            fieldKey="visualDirection"
            label="Visual guidelines"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <LongTextField
            fieldKey="additionalNotes"
            label="Additional notes"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
        </>
      );
    case "other":
      return (
        <>
          <LongTextField
            fieldKey="caption"
            label="Caption"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <TagField
            fieldKey="hashtags"
            label="Hashtags"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <LongTextField
            fieldKey="visualDirection"
            label="Visual guidelines"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <LongTextField
            fieldKey="additionalNotes"
            label="Notes"
            payload={payload}
            translations={translations}
            locale={locale}
            editable={editable}
            aiEnabled={aiEnabled}
            contentItemId={contentItemId}
            onField={onField}
            onTranslation={onTranslation}
          />
          <ReferencesField
            payload={payload}
            locale={locale}
            editable={editable}
            onField={onField}
          />
        </>
      );
    default:
      // Exhaustiveness check — TypeScript will fail to
      // compile if a new format is added without a case
      // here. (The `never` assignment proves we covered
      // every value of `ContentFormat`.)
      return assertNever(format);
  }
}

function assertNever(value: never): React.ReactNode {
  // Surface the unknown format in dev so we don't silently
  // hide the editor for a newly-added format. In prod the
  // disclosure is still openable but renders an empty body.
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[format-payload-editor] unknown format: ${String(value)}`);
  }
  return null;
}

// ─── Shared sub-renderers ──────────────────────────────────────────

interface PlainTextFieldProps {
  fieldKey: string;
  label: string;
  hint?: string | undefined;
  payload: Record<string, unknown>;
  locale: string;
  editable: boolean;
  onField: (key: string, value: unknown) => void;
}

/**
 * Single-line text input without AI / translations. Used
 * for fields that don't translate (enums like `ratio`, or
 * URLs like `audioReference`). Everything else routes
 * through the full `TextField` below.
 */
function PlainTextField({
  fieldKey,
  label,
  hint,
  payload,
  locale,
  editable,
  onField,
}: PlainTextFieldProps) {
  const value = stringField(payload, fieldKey);
  return (
    <div className="space-y-1.5">
      <LabeledField fieldKey={fieldKey} label={label} hint={hint} />
      <DirAwareInput
        id={fieldKey}
        locale={locale}
        value={value}
        readOnly={!editable}
        onChange={(e) => onField(fieldKey, e.target.value || undefined)}
        maxLength={220}
        placeholder={hint}
      />
    </div>
  );
}

interface TextFieldProps {
  fieldKey: string;
  label: string;
  hint?: string;
  payload: Record<string, unknown>;
  translations: Record<string, Record<string, unknown>>;
  locale: string;
  editable: boolean;
  aiEnabled: boolean;
  contentItemId: string;
  onField: (key: string, value: unknown) => void;
  onTranslation: (key: string, locale: LocaleCode, value: string) => void;
}

function TextField({
  fieldKey,
  label,
  hint,
  payload,
  translations,
  locale,
  editable,
  aiEnabled,
  contentItemId,
  onField,
  onTranslation,
}: TextFieldProps) {
  const value = stringField(payload, fieldKey);
  return (
    <div className="space-y-1.5">
      <LabeledField fieldKey={fieldKey} label={label} hint={hint} />
      <DirAwareInput
        id={fieldKey}
        locale={locale}
        value={value}
        readOnly={!editable}
        onChange={(e) => onField(fieldKey, e.target.value || undefined)}
        maxLength={220}
        placeholder={hint}
      />
      {editable ? (
        <>
          <PerFieldAiSuggest
            locale={locale}
            contentItemId={contentItemId}
            field={fieldKey as PerFieldAiField}
            currentValue={value}
            enabled={aiEnabled}
            onApply={(text, mode) => {
              if (mode === "replace") {
                onField(fieldKey, text);
                return;
              }
              onField(fieldKey, [value, text].filter(Boolean).join("\n"));
            }}
          />
          <TranslationPanel
            locale={locale}
            sourceLocale={getByCode(resolveLocale(locale).code).code}
            fieldKey={fieldKey}
            kind="text"
            translations={readTranslationsFor(translations, fieldKey)}
            contentItemId={contentItemId}
            aiEnabled={aiEnabled}
            onChange={(next) => writeTranslationsFor(onTranslation, fieldKey, next)}
          />
        </>
      ) : null}
    </div>
  );
}

interface LongTextFieldProps {
  fieldKey: string;
  label: string;
  hint?: string;
  payload: Record<string, unknown>;
  translations: Record<string, Record<string, unknown>>;
  locale: string;
  editable: boolean;
  aiEnabled: boolean;
  contentItemId: string;
  onField: (key: string, value: unknown) => void;
  onTranslation: (key: string, locale: LocaleCode, value: string) => void;
}

function LongTextField({
  fieldKey,
  label,
  hint,
  payload,
  translations,
  locale,
  editable,
  aiEnabled,
  contentItemId,
  onField,
  onTranslation,
}: LongTextFieldProps) {
  const value = stringField(payload, fieldKey);
  return (
    <div className="space-y-1.5">
      <LabeledField fieldKey={fieldKey} label={label} hint={hint} />
      <DirAwareTextarea
        id={fieldKey}
        locale={locale}
        value={value}
        readOnly={!editable}
        onChange={(e) => onField(fieldKey, e.target.value || undefined)}
        maxLength={2200}
        rows={Math.min(6, Math.max(2, value.split("\n").length + 1))}
        placeholder={hint}
      />
      {editable ? (
        <>
          <PerFieldAiSuggest
            locale={locale}
            contentItemId={contentItemId}
            field={fieldKey as PerFieldAiField}
            currentValue={value}
            enabled={aiEnabled}
            onApply={(text, mode) => {
              if (mode === "replace") {
                onField(fieldKey, text);
                return;
              }
              onField(fieldKey, [value, text].filter(Boolean).join("\n"));
            }}
          />
          <TranslationPanel
            locale={locale}
            sourceLocale={getByCode(resolveLocale(locale).code).code}
            fieldKey={fieldKey}
            kind="long"
            translations={readTranslationsFor(translations, fieldKey)}
            contentItemId={contentItemId}
            aiEnabled={aiEnabled}
            onChange={(next) => writeTranslationsFor(onTranslation, fieldKey, next)}
          />
        </>
      ) : null}
    </div>
  );
}

interface TagFieldProps {
  fieldKey: string;
  label: string;
  hint?: string;
  payload: Record<string, unknown>;
  translations: Record<string, Record<string, unknown>>;
  locale: string;
  editable: boolean;
  aiEnabled: boolean;
  contentItemId: string;
  onField: (key: string, value: unknown) => void;
  onTranslation: (key: string, locale: LocaleCode, value: string) => void;
}

function TagField({
  fieldKey,
  label,
  hint,
  payload,
  translations,
  locale,
  editable,
  aiEnabled,
  contentItemId,
  onField,
  onTranslation,
}: TagFieldProps) {
  const arr = Array.isArray(payload[fieldKey]) ? (payload[fieldKey] as unknown[]) : [];
  const value = arr.filter((x): x is string => typeof x === "string").join(" ");
  return (
    <div className="space-y-1.5">
      <LabeledField fieldKey={fieldKey} label={label} hint={hint} />
      <DirAwareInput
        id={fieldKey}
        locale={locale}
        value={value}
        readOnly={!editable}
        onChange={(e) => {
          const next = e.target.value
            .split(/[\s,]+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          onField(fieldKey, next.length > 0 ? next : undefined);
        }}
        placeholder="#tag1 #tag2"
      />
      {editable ? (
        <>
          <PerFieldAiSuggest
            locale={locale}
            contentItemId={contentItemId}
            field={fieldKey as PerFieldAiField}
            currentValue={value}
            enabled={aiEnabled}
            onApply={(text, _mode, parsed) => {
              // For hashtags, `parsed` is the array the
              // route already split on the # boundary.
              if (parsed && parsed.length > 0) {
                onField(fieldKey, parsed);
                return;
              }
              // Fallback: parse the text.
              const next = text
                .split(/[\s,]+/)
                .map((s) => s.trim())
                .filter((s) => s.startsWith("#") && s.length > 1);
              if (next.length > 0) onField(fieldKey, next);
            }}
          />
          <TranslationPanel
            locale={locale}
            sourceLocale={getByCode(resolveLocale(locale).code).code}
            fieldKey={fieldKey}
            kind="tags"
            translations={readTranslationsFor(translations, fieldKey)}
            contentItemId={contentItemId}
            aiEnabled={aiEnabled}
            onChange={(next) => writeTranslationsFor(onTranslation, fieldKey, next)}
          />
        </>
      ) : null}
    </div>
  );
}

interface NumberFieldProps {
  fieldKey: string;
  label: string;
  hint?: string;
  min: number;
  max: number;
  payload: Record<string, unknown>;
  locale: string;
  editable: boolean;
  onField: (key: string, value: unknown) => void;
}

function NumberField({
  fieldKey,
  label,
  hint,
  min,
  max,
  payload,
  locale,
  editable,
  onField,
}: NumberFieldProps) {
  const value = typeof payload[fieldKey] === "number" ? String(payload[fieldKey]) : "";
  return (
    <div className="space-y-1.5">
      <LabeledField fieldKey={fieldKey} label={label} hint={hint} />
      <DirAwareInput
        id={fieldKey}
        locale={locale}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        readOnly={!editable}
        onChange={(e) => {
          const raw = e.target.value;
          if (!raw) {
            onField(fieldKey, undefined);
            return;
          }
          const n = Number(raw);
          if (Number.isFinite(n) && n >= min && n <= max) {
            onField(fieldKey, n);
          }
        }}
      />
    </div>
  );
}

interface LocationFieldProps {
  payload: Record<string, unknown>;
  locale: string;
  editable: boolean;
  onField: (key: string, value: unknown) => void;
}

function LocationField({ payload, locale, editable, onField }: LocationFieldProps) {
  const loc =
    payload.location && typeof payload.location === "object" && !Array.isArray(payload.location)
      ? (payload.location as Record<string, unknown>)
      : null;
  const name = typeof loc?.name === "string" ? loc.name : "";
  const externalId = typeof loc?.externalId === "string" ? loc.externalId : "";
  return (
    <fieldset className="space-y-1.5">
      <LabeledField fieldKey="location" label="Location" hint="Optional venue / city" />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <DirAwareInput
          id="location-name"
          locale={locale}
          value={name}
          readOnly={!editable}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (!v) {
              onField("location", undefined);
              return;
            }
            onField("location", { name: v, ...(externalId ? { externalId } : {}) });
          }}
          placeholder="Dubai Mall"
        />
        <DirAwareInput
          id="location-externalId"
          locale={locale}
          value={externalId}
          readOnly={!editable}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (!name) return;
            onField("location", v ? { name, externalId: v } : { name });
          }}
          placeholder="fb-123 (optional)"
        />
      </div>
    </fieldset>
  );
}

interface ReferencesFieldProps {
  payload: Record<string, unknown>;
  locale: string;
  editable: boolean;
  onField: (key: string, value: unknown) => void;
}

function ReferencesField({ payload, locale, editable, onField }: ReferencesFieldProps) {
  const arr = Array.isArray(payload.references) ? (payload.references as unknown[]) : [];
  const value = arr.filter((x): x is string => typeof x === "string").join("\n");
  return (
    <div className="space-y-1.5">
      <LabeledField fieldKey="references" label="References" hint="One URL per line" />
      <DirAwareTextarea
        id="references"
        locale={locale}
        value={value}
        readOnly={!editable}
        onChange={(e) => {
          const next = e.target.value
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          onField("references", next.length > 0 ? next : undefined);
        }}
        rows={Math.min(6, Math.max(2, value.split("\n").length + 1))}
        placeholder="https://…"
      />
    </div>
  );
}

function CommonObjectiveAudience({
  payload,
  locale,
  editable,
  onField,
}: {
  payload: Record<string, unknown>;
  locale: string;
  editable: boolean;
  onField: (key: string, value: unknown) => void;
}) {
  const objective = typeof payload.objective === "string" ? payload.objective : "";
  const audience = typeof payload.audience === "string" ? payload.audience : "";
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="space-y-1.5">
        <LabeledField
          fieldKey="objective"
          label="Objective"
          hint="awareness / consideration / conversion / retention"
        />
        <DirAwareInput
          id="objective"
          locale={locale}
          value={objective}
          readOnly={!editable}
          onChange={(e) => onField("objective", e.target.value || undefined)}
          placeholder="awareness"
        />
      </div>
      <div className="space-y-1.5">
        <LabeledField fieldKey="audience" label="Audience" />
        <DirAwareInput
          id="audience"
          locale={locale}
          value={audience}
          readOnly={!editable}
          onChange={(e) => onField("audience", e.target.value || undefined)}
          placeholder="Who is this for?"
        />
      </div>
    </div>
  );
}

function ScenesField({
  payload,
  locale,
  editable,
  onField,
}: {
  payload: Record<string, unknown>;
  locale: string;
  editable: boolean;
  onField: (key: string, value: unknown) => void;
}) {
  const scenes = Array.isArray(payload.scenes) ? (payload.scenes as unknown[]) : [];
  return (
    <NavigableArrayField
      fieldKey="scenes"
      label="Scenes"
      hint="Position · summary · duration (seconds)"
      rows={scenes}
      columns={[
        { key: "position", label: "#", kind: "number" },
        { key: "summary", label: "Summary", kind: "text" },
        { key: "durationSeconds", label: "Sec", kind: "number", optional: true },
      ]}
      locale={locale}
      editable={editable}
      layout="slider"
      entity="Scene"
      onField={onField}
    />
  );
}

function SlideOutlineField(props: {
  payload: Record<string, unknown>;
  locale: string;
  editable: boolean;
  onField: (key: string, value: unknown) => void;
}) {
  const slides = Array.isArray(props.payload.slideOutline)
    ? (props.payload.slideOutline as unknown[])
    : [];
  return (
    <NavigableArrayField
      fieldKey="slideOutline"
      label="Slide outline"
      hint="Position · summary · visual direction"
      rows={slides}
      columns={[
        { key: "position", label: "#", kind: "number" },
        { key: "summary", label: "Summary", kind: "text" },
        { key: "visual", label: "Visual", kind: "text", optional: true },
      ]}
      locale={props.locale}
      editable={props.editable}
      layout="slider"
      entity="Slide"
      onField={props.onField}
    />
  );
}

function VisualSlidesField(props: {
  payload: Record<string, unknown>;
  locale: string;
  editable: boolean;
  onField: (key: string, value: unknown) => void;
}) {
  const slides = Array.isArray(props.payload.visualSlides)
    ? (props.payload.visualSlides as unknown[])
    : [];
  return (
    <NavigableArrayField
      fieldKey="visualSlides"
      label="Visual slides"
      hint="Per-slide visual direction (single-image posts)"
      rows={slides}
      columns={[
        { key: "position", label: "#", kind: "number" },
        { key: "summary", label: "Summary", kind: "text" },
        { key: "visual", label: "Visual", kind: "text", optional: true },
      ]}
      locale={props.locale}
      editable={props.editable}
      layout="slider"
      entity="Slide"
      onField={props.onField}
    />
  );
}

function ChaptersField(props: {
  payload: Record<string, unknown>;
  locale: string;
  editable: boolean;
  onField: (key: string, value: unknown) => void;
}) {
  const rows = Array.isArray(props.payload.chapters) ? (props.payload.chapters as unknown[]) : [];
  return (
    <NavigableArrayField
      fieldKey="chapters"
      label="Chapters"
      hint="Position · title · starts at (seconds)"
      rows={rows}
      columns={[
        { key: "position", label: "#", kind: "number" },
        { key: "title", label: "Title", kind: "text" },
        { key: "startsAtSeconds", label: "Start (s)", kind: "number" },
      ]}
      locale={props.locale}
      editable={props.editable}
      layout="slider"
      entity="Chapter"
      onField={props.onField}
    />
  );
}

function OutlineField(props: {
  payload: Record<string, unknown>;
  locale: string;
  editable: boolean;
  onField: (key: string, value: unknown) => void;
}) {
  const rows = Array.isArray(props.payload.outline) ? (props.payload.outline as unknown[]) : [];
  return (
    <NavigableArrayField
      fieldKey="outline"
      label="Outline"
      hint="Heading level · title"
      rows={rows}
      columns={[
        { key: "level", label: "Level", kind: "number" },
        { key: "title", label: "Title", kind: "text" },
      ]}
      locale={props.locale}
      editable={props.editable}
      layout="list"
      onField={props.onField}
    />
  );
}

function GuestsField(props: {
  payload: Record<string, unknown>;
  locale: string;
  editable: boolean;
  onField: (key: string, value: unknown) => void;
}) {
  const rows = Array.isArray(props.payload.guests) ? (props.payload.guests as unknown[]) : [];
  return (
    <NavigableArrayField
      fieldKey="guests"
      label="Guests"
      hint="Name · role"
      rows={rows}
      columns={[
        { key: "name", label: "Name", kind: "text" },
        { key: "role", label: "Role", kind: "text" },
      ]}
      locale={props.locale}
      editable={props.editable}
      layout="list"
      entity="Guest"
      onField={props.onField}
    />
  );
}

function RunOfShowField(props: {
  payload: Record<string, unknown>;
  locale: string;
  editable: boolean;
  onField: (key: string, value: unknown) => void;
}) {
  const rows = Array.isArray(props.payload.runOfShow) ? (props.payload.runOfShow as unknown[]) : [];
  return (
    <NavigableArrayField
      fieldKey="runOfShow"
      label="Run of show"
      hint="Start (seconds) · topic"
      rows={rows}
      columns={[
        { key: "startsAtSeconds", label: "Start (s)", kind: "number" },
        { key: "topic", label: "Topic", kind: "text" },
      ]}
      locale={props.locale}
      editable={props.editable}
      layout="list"
      onField={props.onField}
    />
  );
}

// ─── Tiny utilities ────────────────────────────────────────────────

function stringField(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  return typeof v === "string" ? v : "";
}

function readTranslationsFor(
  translations: Record<string, Record<string, unknown>>,
  fieldKey: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [loc, fields] of Object.entries(translations)) {
    if (fields && typeof fields === "object") {
      const v = (fields as Record<string, unknown>)[fieldKey];
      if (typeof v === "string") out[loc] = v;
    }
  }
  return out;
}

function writeTranslationsFor(
  onTranslation: (key: string, locale: LocaleCode, value: string) => void,
  fieldKey: string,
  next: Record<string, string>,
) {
  for (const [loc, value] of Object.entries(next)) {
    onTranslation(fieldKey, loc as LocaleCode, value);
  }
}

function LabeledField({
  fieldKey,
  label,
  hint,
}: {
  fieldKey: string;
  label: string;
  hint?: string | undefined;
}) {
  return (
    <label htmlFor={fieldKey} className="text-body text-fg-primary block font-semibold">
      {label}
      {hint ? <span className="text-fg-muted text-label ml-2 font-normal">{hint}</span> : null}
    </label>
  );
}

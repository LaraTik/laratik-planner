"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle2, ChevronDown, Save, Loader2, ListChecks } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { updateFormatPayloadAction } from "@/app/(app)/app/w/[slug]/planning/actions";
import type { ContentFormat } from "@/lib/format-payload/schemas";
import {
  fieldsFor,
  ratioOptionsFor,
  splitByGroup,
  type FieldDef,
} from "./format-payload-field-set";
import {
  rendererFor,
  isObjectiveAudienceKey,
  type FieldRendererProps,
} from "./format-payload-field-renderers";
import { AdvancedDisclosure } from "./advanced-disclosure";

/**
 * `More details` editor for `content_item.format_payload`.
 *
 * The disclosure renders the per-format structured fields for
 * the active content item. Every field is optional (Quick
 * Create writes just `{ schemaVersion: 1 }`), the editor
 * normalises nulls on save, and the per-format Zod schema
 * (see `lib/format-payload/schemas.ts`) is the source of
 * truth for both validation and the field set.
 *
 * Information architecture (post-progressive-disclosure):
 *  - Outer Show/Hide (this component) hides the entire body
 *    by default; clicking reveals the editor.
 *  - Inside, fields are split into two tiers via the manifest
 *    (see `format-payload-field-set.ts`):
 *     - **essential** — always rendered.
 *     - **advanced** — hidden behind a disclosure by default;
 *       populated advanced fields auto-expand (rendered above
 *       the disclosure so the planner never loses visibility of
 *       their work); an "Always show" toggle persists via
 *       localStorage.
 *  - Each field shows a "Translations (N)" button instead of
 *    an inline sidecar; clicking opens a focused popover.
 *  - The header carries an "X / Y essential filled" hint next
 *    to the existing "X filled" badge so the planner knows
 *    when they're done with the essentials vs the full set.
 *
 * Localization (Phase 5b, 2026-09-01): the parent passes a
 * bound translator via the `t` prop. Field labels resolve
 * through `field.labelKey`; the editor chrome (title, badge
 * suffixes, Show / Hide, Save, read-only notice) resolves
 * through the `formatEditor.editor.*` keys. `splitByGroup`
 * is the same helper `format-payload-field-set.test.ts` locks.
 *
 * Save semantics: the editor holds the full `formatPayload`
 * in React state; on save it serialises to JSON, posts via
 * the `updateFormatPayloadAction` server action, and either
 * re-renders on success or surfaces the server error inline.
 */
export interface FormatPayloadEditorProps {
  /** Bound translator from `tForActive()`. Resolves the field's
   *  `labelKey` and the editor's chrome strings through the
   *  active message catalog. */
  t: (key: string, params?: Record<string, string | number>) => string;
  workspaceSlug: string;
  contentItemId: string;
  format: ContentFormat;
  initial: Record<string, unknown>;
  editable: boolean;
  locale: string;
  aiEnabled: boolean;
}

const initial: { error?: string; ok?: boolean } = {};

export function FormatPayloadEditor({
  t,
  workspaceSlug,
  contentItemId,
  format,
  initial: initialPayload,
  editable,
  locale,
  aiEnabled,
}: FormatPayloadEditorProps) {
  const [open, setOpen] = React.useState(false);
  const [payload, setPayload] = React.useState<Record<string, unknown>>(initialPayload);
  const initialJson = React.useMemo(() => JSON.stringify(initialPayload), [initialPayload]);
  // Reset the payload only when the initial changes (e.g. after
  // a re-render from a parent revalidation). We don't reset on
  // every render — the user is editing, we want to keep their
  // local state.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPayload(initialPayload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJson]);

  const boundAction = updateFormatPayloadAction.bind(null, workspaceSlug);
  const [state, formAction, pending] = useActionState(boundAction, initial);

  // Resolve the manifest. `fieldsFor` returns the same array
  // every render for a given format, so the downstream split is
  // cheap. The manifest is the single source of truth for
  // "which fields exist per format + which group they belong to".
  const fields = React.useMemo(() => fieldsFor(format), [format]);
  const { essential, advanced } = React.useMemo(() => splitByGroup(fields), [fields]);

  // "X filled" badge (existing behaviour) + "X / Y essential
  // filled" hint. The "essential" hint gives the planner a
  // concrete target ("done" with the essentials) without
  // pretending the advanced fields don't exist.
  const totalFilled = React.useMemo(() => {
    let n = 0;
    for (const [k, v] of Object.entries(payload)) {
      if (k === "schemaVersion" || k === "translations") continue;
      if (v === null || v === undefined) continue;
      if (typeof v === "string" && v.trim().length === 0) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (typeof v === "object" && Object.keys(v as object).length === 0) continue;
      n++;
    }
    return n;
  }, [payload]);

  const essentialFilled = React.useMemo(() => {
    let n = 0;
    for (const f of essential) {
      const v = payload[f.key];
      if (v === null || v === undefined) continue;
      if (typeof v === "string" && v.trim().length === 0) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (typeof v === "object" && Object.keys(v as object).length === 0) continue;
      n++;
    }
    return n;
  }, [essential, payload]);

  // The `translations` map is read separately because the
  // per-field renderer slices it. Storing it once at the parent
  // is cheaper than re-reading on every field.
  const translations =
    (payload.translations as Record<string, Record<string, unknown>> | undefined) ?? {};

  function setField(fieldKey: string, value: unknown) {
    setPayload((prev) => ({ ...prev, [fieldKey]: value }));
  }
  function setFieldTranslation(fieldKey: string, localeCode: string, value: string) {
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

  // Render a single field via the registry. The renderer
  // signature is `FieldRendererProps`, defined in
  // `format-payload-field-renderers.tsx`. The label is
  // resolved at the call site so the renderer stays
  // catalog-agnostic.
  const renderField = (field: FieldDef) => {
    const renderer = rendererFor(field.key);
    return renderer({
      fieldKey: field.key,
      label: t(field.labelKey),
      payload,
      translations,
      locale,
      editable,
      ...(field.key === "ratio" ? { enumValues: ratioOptionsFor(format) } : {}),
      ...(field.key === "durationSeconds" && format === "long_form_video"
        ? { numberMin: 30, numberMax: 3600 }
        : {}),
      aiEnabled,
      contentItemId,
      t,
      onField: setField,
      onTranslation: setFieldTranslation,
    } as FieldRendererProps);
  };

  // `objective` + `audience` are rendered as a side-by-side pair
  // in the original editor. The dispatch key for both is the
  // same renderer (`ObjectiveAudienceRenderer`) so the manifest
  // can list them as separate fields but the UI shows one row.
  // The pair is rendered when EITHER key is in the manifest.
  const renderObjectiveAudience = () => {
    const renderer = rendererFor("objective");
    return renderer({
      fieldKey: "objective",
      label: t("formatEditor.editor.goalAudience"),
      payload,
      translations,
      locale,
      editable,
      aiEnabled,
      contentItemId,
      t,
      onField: setField,
      onTranslation: setFieldTranslation,
    } as FieldRendererProps);
  };
  const hasObjectiveAudience =
    essential.some((f) => isObjectiveAudienceKey(f.key)) ||
    advanced.some((f) => isObjectiveAudienceKey(f.key));
  // Filter the objective+audience keys out of the per-field
  // lists so we don't render them twice.
  const essentialWithoutOA = essential.filter((f) => !isObjectiveAudienceKey(f.key));
  const advancedWithoutOA = advanced.filter((f) => !isObjectiveAudienceKey(f.key));

  return (
    <Card data-testid="format-payload-editor" data-format={format}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{t("formatEditor.editor.moreDetails")}</CardTitle>
            <span
              className="text-label text-fg-secondary border-border bg-surface-subtle inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold"
              data-testid="format-payload-completion-total"
              aria-label={t("formatEditor.editor.totalFilledAria", {
                filled: totalFilled,
                total: fields.length,
              })}
            >
              {totalFilled} / {fields.length} {t("formatEditor.editor.totalFilledSuffix")}
            </span>
            {essential.length > 0 ? (
              <span
                className="text-label text-fg-secondary border-primary/30 bg-primary-subtle inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold"
                data-testid="format-payload-completion-essential"
                aria-label={t("formatEditor.editor.essentialAria", {
                  filled: essentialFilled,
                  total: essential.length,
                })}
              >
                {essentialFilled} / {essential.length} {t("formatEditor.editor.essentialSuffix")}
              </span>
            ) : null}
          </div>
          <CardDescription>{t("formatEditor.editor.moreDetailsSubtitle")}</CardDescription>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="format-payload-editor-body"
          data-testid="format-payload-toggle"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
          {open ? t("formatEditor.editor.hide") : t("formatEditor.editor.show")}
        </Button>
      </div>

      {open ? (
        <div
          id="format-payload-editor-body"
          data-testid="format-payload-editor-body"
          className="mt-4 space-y-6"
        >
          {!editable ? (
            <p className="text-label text-fg-muted inline-flex items-center gap-1.5">
              <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
              {t("formatEditor.editor.readOnlyCreative")}
            </p>
          ) : null}
          {editable ? (
            <p
              id="format-payload-editor-guidance"
              className="border-border bg-surface-subtle text-label text-fg-secondary rounded-[var(--radius-control)] border px-3 py-2"
            >
              {t("formatEditor.editor.optionalGuidance")}
            </p>
          ) : null}

          {/* Essential tier. Rendered directly, no disclosure. */}
          <div className="space-y-6" data-testid="essential-tier">
            {hasObjectiveAudience ? renderObjectiveAudience() : null}
            {essentialWithoutOA.map((f) => (
              <div key={f.key} data-testid={`essential-field-${f.key}`}>
                {renderField(f)}
              </div>
            ))}
          </div>

          {/* Advanced tier. Behind a disclosure; populated fields
              auto-expand. The "Always show" preference lives in
              localStorage (per format). */}
          {advancedWithoutOA.length > 0 ? (
            <AdvancedDisclosure
              fields={advancedWithoutOA}
              format={format}
              payload={payload}
              renderField={(f) => (
                <div key={`adv-${f.key}`} data-testid={`advanced-tier-${f.key}`}>
                  {renderField(f)}
                </div>
              )}
            />
          ) : null}

          {/* Save button. Same shape as before — single client
              action, single submit. The hidden inputs carry the
              payload + the content item id. */}
          {editable ? (
            <form
              action={formAction}
              aria-describedby="format-payload-editor-guidance"
              className="flex flex-wrap items-center gap-2 pt-2"
            >
              <input type="hidden" name="contentItemId" value={contentItemId} />
              {/* The `format` hidden input is required by
                  `updateFormatPayloadFormSchema` in
                  `planning/actions.ts` — the Zod schema needs
                  the format enum to pick the right per-format
                  parser. `MessagesPanel` already includes this
                  field; the two content editors were missing
                  it, which made every save fail with a
                  `format` field error. */}
              <input type="hidden" name="format" value={format} />
              <input type="hidden" name="formatPayload" value={JSON.stringify(payload)} />
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {pending
                  ? t("formatEditor.editor.savePending")
                  : t("formatEditor.editor.saveCreative")}
              </Button>
              {state?.error ? (
                <p
                  role="alert"
                  aria-live="assertive"
                  data-testid="format-payload-save-error"
                  className="text-label text-danger font-semibold"
                >
                  {state.error}
                </p>
              ) : state?.ok ? (
                <p
                  className="text-label text-success inline-flex items-center gap-1 font-semibold"
                  data-testid="format-payload-save-confirmation"
                  aria-live="polite"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("formatEditor.editor.saveSuccess")}
                </p>
              ) : null}
            </form>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

// Re-export the manifest helpers for tests / callers that need
// to inspect the field set without importing the field-set file
// directly. `FIELDS_BY_FORMAT` is internal — callers should use
// `fieldsFor(format)` instead.
export { fieldsFor, splitByGroup, type FieldDef } from "./format-payload-field-set";

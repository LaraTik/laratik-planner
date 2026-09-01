"use client";

import * as React from "react";
import { Languages, Plus, X } from "lucide-react";
import { DirAwareInput, DirAwareTextarea } from "@/components/forms/dir-aware-textarea";
import { PerFieldAiSuggest, type PerFieldAiField } from "@/components/forms/per-field-ai-suggest";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getByCode,
  SUPPORTED_LOCALES,
  translationLocalesFor,
  type LocaleCode,
  type LocaleDescriptor,
} from "@/lib/i18n/locales";

/**
 * Per-field translations, condensed into a single "Translations (N)"
 * button. Clicking opens a focused popover with the per-locale
 * sub-inputs. Replaces the previous inline sidecar that
 * rendered one collapsible panel per field (the source of the
 * "large empty translation panel underneath every editable
 * field" complaint).
 *
 * Why a popover and not inline:
 *  - The N (count of non-empty translations) gives the planner a
 *    discoverable affordance without visual weight when the field
 *    has no translations.
 *  - Clicking expands a focused surface that's not tangled with
 *    the field's source input.
 *  - On mobile, the popover is full-width and dismissable, so the
 *    input doesn't have to compete for vertical space with the
 *    field.
 *
 * The component receives the per-locale map for the field
 * directly (not the global translations map). The parent editor
 * knows which key it's editing and slices the payload before
 * passing the value in. The `onChange` / `onRemove` callbacks
 * notify the parent of the new map shape.
 */

export type PerFieldTranslationKind = "text" | "long" | "tags";

export interface TranslationFieldButtonProps {
  /** Workspace locale — drives the fallback dir for each translation input. */
  locale?: string | undefined;
  /**
   * The source locale of the field. Used to exclude it from
   * the translation target list (you don't translate English
   * into English).
   */
  sourceLocale: LocaleCode;
  /** The field key (e.g. "caption", "hook", "visualDirection"). */
  fieldKey: string;
  /**
   * Field kind — drives which control renders (single-line
   * input, multi-line textarea, or chip list for tags like
   * hashtags). The AI button works the same way for all
   * three; only the input shape differs.
   */
  kind: PerFieldTranslationKind;
  /**
   * The current translations map for THIS field only. The
   * parent slices the global `payload.translations[locale][field]`
   * map before passing it in. Pass `{}` when no translations exist.
   */
  translations: Record<string, string>;
  /** Content item id — for the AI suggest button. */
  contentItemId: string;
  /** Whether the agency's `caption_drafts` capability is enabled. */
  aiEnabled?: boolean | undefined;
  /** Called when a translation value changes. */
  onChange: (next: Record<string, string>) => void;
  /**
   * Bound translator from the parent field renderer. Threaded
   * through to the per-row `<PerFieldAiSuggest>` so the AI
   * button chrome (Suggest / Drafting / Insert / Replace /
   * Try again / Dismiss + aria-labels) resolves through
   * `formatEditor.editor.ai.*` in the active catalog.
   * (The TranslationFieldButton's own chrome — the
   * "Translations" label, aria-label, and empty state —
   * stays English for now; that work belongs to a
   * dedicated translations-tab commit.)
   */
  t: (key: string, params?: Record<string, string | number>) => string;
}

function countFilledTranslations(translations: Record<string, string>): number {
  let n = 0;
  for (const v of Object.values(translations)) {
    if (typeof v === "string" && v.trim().length > 0) n++;
  }
  return n;
}

export function TranslationFieldButton({
  locale,
  sourceLocale,
  fieldKey,
  kind,
  translations,
  contentItemId,
  aiEnabled = true,
  onChange,
  t,
}: TranslationFieldButtonProps) {
  const [open, setOpen] = React.useState(false);
  // Locales the user has activated in this popover. Seeded from
  // the existing translations map so a previously-saved locale
  // remains visible on the next open.
  const [activeLocales, setActiveLocales] = React.useState<ReadonlyArray<LocaleCode>>(() => {
    const fromMap = Object.keys(translations).filter((k): k is LocaleCode =>
      SUPPORTED_LOCALES.some((l) => l.code === k),
    );
    return fromMap;
  });

  const targetLocales = translationLocalesFor(sourceLocale);
  const addableLocales = targetLocales.filter((l) => !activeLocales.includes(l.code));
  const count = countFilledTranslations(translations);

  function addLocale(code: LocaleCode) {
    setActiveLocales((prev) => (prev.includes(code) ? prev : [...prev, code]));
    onChange({ ...translations, [code]: translations[code] ?? "" });
  }

  function removeLocale(code: LocaleCode) {
    setActiveLocales((prev) => prev.filter((c) => c !== code));
    const next = { ...translations };
    delete next[code];
    onChange(next);
  }

  function setValue(code: LocaleCode, value: string) {
    onChange({ ...translations, [code]: value });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`${fieldKey} translations (${count} added)`}
          data-testid={`translation-button-${fieldKey}`}
          data-count={count}
          className="text-label text-fg-secondary"
        >
          <Languages className="h-3.5 w-3.5" aria-hidden="true" />
          Translations
          {count > 0 ? (
            <Badge variant="info" className="ms-1">
              {count}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="bg-surface border-border w-96 max-w-[calc(100vw-2rem)] space-y-3 rounded-[var(--radius-control)] border p-3 shadow-lg"
        data-testid={`translation-popover-${fieldKey}`}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-label text-fg-secondary inline-flex items-center gap-1.5 font-semibold">
            <Languages className="h-3.5 w-3.5" aria-hidden="true" />
            Translations · {fieldKey}
          </p>
          {addableLocales.length > 0 ? (
            <PopoverAddLocale addable={addableLocales} onAdd={addLocale} />
          ) : null}
        </div>

        {activeLocales.length === 0 ? (
          <p className="text-label text-fg-muted">
            No translations yet. Add one when this post will publish in a second language.
          </p>
        ) : null}

        {activeLocales.map((code) => {
          const desc = getByCode(code);
          const value = translations[code] ?? "";
          return (
            <TranslationFieldRow
              key={code}
              locale={locale}
              desc={desc}
              fieldKey={fieldKey}
              kind={kind}
              value={value}
              contentItemId={contentItemId}
              aiEnabled={aiEnabled}
              t={t}
              onChange={(v) => setValue(code, v)}
              onRemove={() => removeLocale(code)}
            />
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

function PopoverAddLocale({
  addable,
  onAdd,
}: {
  addable: ReadonlyArray<LocaleDescriptor>;
  onAdd: (code: LocaleCode) => void;
}) {
  // The popover header is too narrow to show every available
  // locale as a button. We collapse them into a single
  // "+ Add language" button that opens a small sub-list. This
  // is the "Add another language" pattern from the design.
  const [open, setOpen] = React.useState(false);
  if (addable.length === 0) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Add another language"
          data-testid="translation-add-language"
          className="text-label"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          Add language
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        className="bg-surface border-border w-56 rounded-[var(--radius-control)] border p-2 shadow-lg"
      >
        <ul className="max-h-64 overflow-y-auto">
          {addable.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                onClick={() => {
                  onAdd(l.code);
                  setOpen(false);
                }}
                className="text-body text-fg-primary hover:bg-surface-subtle flex w-full items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-start"
              >
                <span>{l.label}</span>
                <span className="text-label text-fg-muted" dir={l.dir}>
                  ({l.nativeLabel})
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function TranslationFieldRow({
  locale,
  desc,
  fieldKey,
  kind,
  value,
  contentItemId,
  aiEnabled,
  t,
  onChange,
  onRemove,
}: {
  locale?: string | undefined;
  desc: LocaleDescriptor;
  fieldKey: string;
  kind: PerFieldTranslationKind;
  value: string;
  contentItemId: string;
  aiEnabled: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  onChange: (next: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-1.5" data-testid={`translation-row-${fieldKey}-${desc.code}`}>
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={`${fieldKey}-${desc.code}`}
          className="text-label text-fg-primary inline-flex items-center gap-1.5 font-semibold"
        >
          <span>{desc.label}</span>
          <span className="text-fg-muted font-normal" dir={desc.dir}>
            ({desc.nativeLabel})
          </span>
        </label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onRemove}
          aria-label={`Remove ${desc.label} translation`}
          className="text-fg-muted hover:text-danger"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </Button>
      </div>
      {kind === "long" ? (
        <DirAwareTextarea
          id={`${fieldKey}-${desc.code}`}
          locale={locale}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={Math.min(6, Math.max(2, value.split("\n").length + 1))}
          placeholder={`${desc.label} translation…`}
        />
      ) : kind === "tags" ? (
        <DirAwareInput
          id={`${fieldKey}-${desc.code}`}
          locale={locale}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#tag1 #tag2"
        />
      ) : (
        <DirAwareInput
          id={`${fieldKey}-${desc.code}`}
          locale={locale}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <PerFieldAiSuggest
        locale={locale}
        contentItemId={contentItemId}
        field={fieldKey as PerFieldAiField}
        currentValue={value}
        contentLanguage={desc.code}
        enabled={aiEnabled}
        t={t}
        onApply={(text, mode, parsed) => {
          // The AI suggestion replaces or appends the
          // translation in *this* locale. Insert/Replace is
          // local to the translation panel — the source
          // value is untouched.
          if (mode === "replace") {
            onChange(parsed ? parsed.join(" ") : text);
            return;
          }
          const combined = [value, parsed ? parsed.join(" ") : text].filter(Boolean).join("\n");
          onChange(combined);
        }}
      />
    </div>
  );
}

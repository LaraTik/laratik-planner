"use client";

import * as React from "react";
import { Languages, Plus, X } from "lucide-react";

import { DirAwareInput, DirAwareTextarea } from "@/components/forms/dir-aware-textarea";
import { PerFieldAiSuggest, type PerFieldAiField } from "@/components/forms/per-field-ai-suggest";
import { Button } from "@/components/ui/button";
import {
  getByCode,
  SUPPORTED_LOCALES,
  translationLocalesFor,
  type LocaleCode,
  type LocaleDescriptor,
} from "@/lib/i18n/locales";

/**
 * Per-field translation sidecar. Renders one sub-input per
 * *target* locale (the field's source-locale is rendered by
 * the parent editor — this component is the translation-only
 * layer). The user can add / remove a translation for any
 * supported locale; the value is written to the parent's
 * `translations[localeCode]` map.
 *
 * Storage:
 *   The parent owns the `translations: Record<LocaleCode,
 *   Record<string, unknown>>` map. The component receives the
 *   current map + an `onChange` callback. Removing a locale
 *   deletes the key (the empty value is dropped on save by
 *   the service layer — no ghost keys in the JSONB).
 *
 * Why a per-field sidecar instead of one "Translations" page:
 *   The user request is "each text field would need in proper
 *   way another section to type the translations as well" —
 *   *each* field gets a translation surface, not a global
 *   one. The sidecar is collapsible so the field stays the
 *   primary visual; the sidecar is the row of small Locale
 *   chips the user expands when they need it.
 */
export type PerFieldTranslationKind = "text" | "long" | "tags";

export interface TranslationPanelProps {
  /** Workspace locale — drives the fallback dir for each translation input. */
  locale?: string | undefined;
  /**
   * The source locale of the field. Used to exclude it from
   * the translation target list (you don't translate English
   * into English).
   */
  sourceLocale: LocaleCode;
  /**
   * The field key (e.g. "caption", "hook", "visualDirection").
   * Passed to the AI suggest button so the per-field prompt
   * is correctly scoped. Also the key in the translations map.
   */
  fieldKey: string;
  /**
   * Field kind — drives which control renders (single-line
   * input, multi-line textarea, or chip list for tags like
   * hashtags). The AI button works the same way for all
   * three; only the input shape differs.
   */
  kind: PerFieldTranslationKind;
  /** Current translations map. Pass `{}` when no translations exist. */
  translations: Record<string, string>;
  /** Content item id — for the AI suggest button. */
  contentItemId: string;
  /** Whether the agency's `caption_drafts` capability is enabled. */
  aiEnabled?: boolean | undefined;
  /**
   * Called when a translation value changes. The parent
   * should update the translations map in its state.
   */
  onChange: (next: Record<string, string>) => void;
}

export function TranslationPanel({
  locale,
  sourceLocale,
  fieldKey,
  kind,
  translations,
  contentItemId,
  aiEnabled = true,
  onChange,
}: TranslationPanelProps) {
  // The locales that the user can still add (i.e. not the
  // source and not already-added). The user can add a locale,
  // write into it, and remove it; the sidecar is fully
  // user-managed.
  const [activeLocales, setActiveLocales] = React.useState<ReadonlyArray<LocaleCode>>(() => {
    const fromMap = Object.keys(translations).filter((k): k is LocaleCode =>
      SUPPORTED_LOCALES.some((l) => l.code === k),
    );
    return fromMap;
  });

  const targetLocales = translationLocalesFor(sourceLocale);
  const addableLocales = targetLocales.filter((l) => !activeLocales.includes(l.code));

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
    <div
      className="border-border bg-surface-subtle space-y-3 rounded-[var(--radius-control)] border p-3"
      data-testid={`translation-panel-${fieldKey}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-label text-fg-secondary inline-flex items-center gap-1.5 font-semibold">
          <Languages className="h-3.5 w-3.5" aria-hidden="true" />
          Translations
        </p>
        {addableLocales.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {addableLocales.map((l) => (
              <Button
                key={l.code}
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => addLocale(l.code)}
                aria-label={`Add ${l.label} translation`}
                className="text-label"
              >
                <Plus className="h-3 w-3" aria-hidden="true" /> {l.label}
              </Button>
            ))}
          </div>
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
          <TranslationField
            key={code}
            locale={locale}
            desc={desc}
            fieldKey={fieldKey}
            kind={kind}
            value={value}
            contentItemId={contentItemId}
            aiEnabled={aiEnabled}
            onChange={(v) => setValue(code, v)}
            onRemove={() => removeLocale(code)}
          />
        );
      })}
    </div>
  );
}

interface TranslationFieldProps {
  locale?: string | undefined;
  desc: LocaleDescriptor;
  fieldKey: string;
  kind: PerFieldTranslationKind;
  value: string;
  contentItemId: string;
  aiEnabled: boolean;
  onChange: (next: string) => void;
  onRemove: () => void;
}

function TranslationField({
  locale,
  desc,
  fieldKey,
  kind,
  value,
  contentItemId,
  aiEnabled,
  onChange,
  onRemove,
}: TranslationFieldProps) {
  return (
    <div className="space-y-1.5">
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

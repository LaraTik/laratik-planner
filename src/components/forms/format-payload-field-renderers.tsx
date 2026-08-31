"use client";

import * as React from "react";
import { DirAwareInput, DirAwareTextarea } from "@/components/forms/dir-aware-textarea";
import { PerFieldAiSuggest, type PerFieldAiField } from "@/components/forms/per-field-ai-suggest";
import { TranslationFieldButton } from "@/components/forms/translation-field-button";
import { NavigableArrayField } from "@/components/forms/navigable-array-field";
import { resolveLocale, getByCode, type LocaleCode } from "@/lib/i18n/locales";

/**
 * Field-renderer registry for the format-payload editor.
 *
 * Each renderer is a small component (or pair of components for
 * composite fields) that knows how to read / write one specific
 * payload key. The `dispatchFieldRenderer` function below maps a
 * manifest key to the right renderer, keeping the FormatFields
 * loop in `format-payload-editor.tsx` short.
 *
 * Why extract: the original editor was a single 1795-line
 * file with a 14-case `switch (format)` plus 11 sub-renderers.
 * After the manifest refactor, the FormatFields loop is just
 * `for (const field of fields) renderField(field)`, and the
 * sub-renderers live in this file. The manifest is the
 * contract (which fields exist per format + which group they
 * belong to); the renderers are the implementation (how to
 * render each one).
 *
 * Renderers are exported as a small `{ [key: string]: Renderer }`
 * map. New renderers (for new payload keys) plug in by adding an
 * entry to the map.
 */

export interface FieldRendererProps {
  fieldKey: string;
  label: string;
  hint?: string | undefined;
  payload: Record<string, unknown>;
  translations: Record<string, Record<string, unknown>>;
  locale: string;
  editable: boolean;
  aiEnabled: boolean;
  contentItemId: string;
  onField: (key: string, value: unknown) => void;
  onTranslation: (key: string, locale: LocaleCode, value: string) => void;
}

export type FieldRenderer = (props: FieldRendererProps) => React.ReactNode;
/** A field renderer that may carry a `displayName` (used by the
 *  dev-time fallback to make the React DevTools label useful). */
type NamedFieldRenderer = FieldRenderer & { displayName?: string };

// ─── Helpers ────────────────────────────────────────────────────────

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
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={fieldKey} className="text-body text-fg-primary block font-semibold">
        {label}
        {hint ? <span className="text-fg-muted text-label ms-2 font-normal">{hint}</span> : null}
      </label>
    </div>
  );
}

// ─── Per-kind renderers ────────────────────────────────────────────

/** Single-line text input (max 220 chars). AI + translations. */
function TextFieldRenderer({
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
}: FieldRendererProps) {
  const value = stringField(payload, fieldKey);
  const sourceLocale = getByCode(resolveLocale(locale).code).code;
  return (
    <div className="space-y-1.5" data-testid={`field-${fieldKey}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LabeledField fieldKey={fieldKey} label={label} hint={hint} />
        {editable ? (
          <TranslationFieldButton
            locale={locale}
            sourceLocale={sourceLocale}
            fieldKey={fieldKey}
            kind="text"
            translations={readTranslationsFor(translations, fieldKey)}
            contentItemId={contentItemId}
            aiEnabled={aiEnabled}
            onChange={(next) => writeTranslationsFor(onTranslation, fieldKey, next)}
          />
        ) : null}
      </div>
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
      ) : null}
    </div>
  );
}

/** Long-form text (max 2200 chars). AI + translations. */
function LongTextFieldRenderer({
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
}: FieldRendererProps) {
  const value = stringField(payload, fieldKey);
  const sourceLocale = getByCode(resolveLocale(locale).code).code;
  return (
    <div className="space-y-1.5" data-testid={`field-${fieldKey}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LabeledField fieldKey={fieldKey} label={label} hint={hint} />
        {editable ? (
          <TranslationFieldButton
            locale={locale}
            sourceLocale={sourceLocale}
            fieldKey={fieldKey}
            kind="long"
            translations={readTranslationsFor(translations, fieldKey)}
            contentItemId={contentItemId}
            aiEnabled={aiEnabled}
            onChange={(next) => writeTranslationsFor(onTranslation, fieldKey, next)}
          />
        ) : null}
      </div>
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
      ) : null}
    </div>
  );
}

/** Hashtag-style space/comma-separated input. AI + translations. */
function TagFieldRenderer({
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
}: FieldRendererProps) {
  const arr = Array.isArray(payload[fieldKey]) ? (payload[fieldKey] as unknown[]) : [];
  const value = arr.filter((x): x is string => typeof x === "string").join(" ");
  const sourceLocale = getByCode(resolveLocale(locale).code).code;
  return (
    <div className="space-y-1.5" data-testid={`field-${fieldKey}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LabeledField fieldKey={fieldKey} label={label} hint={hint} />
        {editable ? (
          <TranslationFieldButton
            locale={locale}
            sourceLocale={sourceLocale}
            fieldKey={fieldKey}
            kind="tags"
            translations={readTranslationsFor(translations, fieldKey)}
            contentItemId={contentItemId}
            aiEnabled={aiEnabled}
            onChange={(next) => writeTranslationsFor(onTranslation, fieldKey, next)}
          />
        ) : null}
      </div>
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
        <PerFieldAiSuggest
          locale={locale}
          contentItemId={contentItemId}
          field={fieldKey as PerFieldAiField}
          currentValue={value}
          enabled={aiEnabled}
          onApply={(text, _mode, parsed) => {
            if (parsed && parsed.length > 0) {
              onField(fieldKey, parsed);
              return;
            }
            const next = text
              .split(/[\s,]+/)
              .map((s) => s.trim())
              .filter((s) => s.startsWith("#") && s.length > 1);
            if (next.length > 0) onField(fieldKey, next);
          }}
        />
      ) : null}
    </div>
  );
}

/** Plain text input — no AI, no translations. For enums/URLs. */
function PlainTextFieldRenderer({
  fieldKey,
  label,
  hint,
  payload,
  locale,
  editable,
  onField,
}: FieldRendererProps) {
  const value = stringField(payload, fieldKey);
  return (
    <div className="space-y-1.5" data-testid={`field-${fieldKey}`}>
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

/** Selectable enum input (no AI, no translations). */
function EnumFieldRenderer({
  fieldKey,
  label,
  hint,
  payload,
  editable,
  onField,
  enumValues,
}: FieldRendererProps & { enumValues: ReadonlyArray<string> }) {
  const value = stringField(payload, fieldKey);
  return (
    <div className="space-y-1.5" data-testid={`field-${fieldKey}`}>
      <LabeledField fieldKey={fieldKey} label={label} hint={hint} />
      <select
        id={fieldKey}
        value={value}
        disabled={!editable}
        onChange={(e) => onField(fieldKey, e.target.value || undefined)}
        className="border-border bg-surface text-fg-primary text-body focus-visible:ring-focus-ring flex h-10 w-full rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
      >
        <option value="">—</option>
        {enumValues.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Number input with min/max. No AI / translations. */
function NumberFieldRenderer({
  fieldKey,
  label,
  hint,
  payload,
  locale,
  editable,
  onField,
  min,
  max,
}: FieldRendererProps & { min: number; max: number }) {
  const value = typeof payload[fieldKey] === "number" ? String(payload[fieldKey]) : "";
  return (
    <div className="space-y-1.5" data-testid={`field-${fieldKey}`}>
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

// ─── Composite / array fields ──────────────────────────────────────

function ScenesFieldRenderer({ payload, locale, editable, onField }: FieldRendererProps) {
  const scenes = Array.isArray(payload.scenes) ? (payload.scenes as unknown[]) : [];
  return (
    <div data-testid="field-scenes">
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
    </div>
  );
}

function SlideOutlineFieldRenderer({ payload, locale, editable, onField }: FieldRendererProps) {
  const slides = Array.isArray(payload.slideOutline) ? (payload.slideOutline as unknown[]) : [];
  return (
    <div data-testid="field-slideOutline">
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
        locale={locale}
        editable={editable}
        layout="slider"
        entity="Slide"
        onField={onField}
      />
    </div>
  );
}

function VisualSlidesFieldRenderer({ payload, locale, editable, onField }: FieldRendererProps) {
  const slides = Array.isArray(payload.visualSlides) ? (payload.visualSlides as unknown[]) : [];
  return (
    <div data-testid="field-visualSlides">
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
        locale={locale}
        editable={editable}
        layout="slider"
        entity="Slide"
        onField={onField}
      />
    </div>
  );
}

function ChaptersFieldRenderer({ payload, locale, editable, onField }: FieldRendererProps) {
  const rows = Array.isArray(payload.chapters) ? (payload.chapters as unknown[]) : [];
  return (
    <div data-testid="field-chapters">
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
        locale={locale}
        editable={editable}
        layout="slider"
        entity="Chapter"
        onField={onField}
      />
    </div>
  );
}

function OutlineFieldRenderer({ payload, locale, editable, onField }: FieldRendererProps) {
  const rows = Array.isArray(payload.outline) ? (payload.outline as unknown[]) : [];
  return (
    <div data-testid="field-outline">
      <NavigableArrayField
        fieldKey="outline"
        label="Outline"
        hint="Heading level · title"
        rows={rows}
        columns={[
          { key: "level", label: "Level", kind: "number" },
          { key: "title", label: "Title", kind: "text" },
        ]}
        locale={locale}
        editable={editable}
        layout="list"
        onField={onField}
      />
    </div>
  );
}

function KeyTakeawaysFieldRenderer({ payload, locale, editable, onField }: FieldRendererProps) {
  const arr = Array.isArray(payload.keyTakeaways) ? (payload.keyTakeaways as unknown[]) : [];
  const value = arr.filter((x): x is string => typeof x === "string").join("\n");
  return (
    <div className="space-y-1.5" data-testid="field-keyTakeaways">
      <LabeledField fieldKey="keyTakeaways" label="Key takeaways" hint="One per line" />
      <DirAwareTextarea
        id="keyTakeaways"
        locale={locale}
        value={value}
        readOnly={!editable}
        onChange={(e) => {
          const next = e.target.value
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          onField("keyTakeaways", next.length > 0 ? next : undefined);
        }}
        rows={Math.min(8, Math.max(2, value.split("\n").length + 1))}
        placeholder="3-5 takeaways"
      />
    </div>
  );
}

function TalkingPointsFieldRenderer({ payload, locale, editable, onField }: FieldRendererProps) {
  const arr = Array.isArray(payload.talkingPoints) ? (payload.talkingPoints as unknown[]) : [];
  const value = arr.filter((x): x is string => typeof x === "string").join("\n");
  return (
    <div className="space-y-1.5" data-testid="field-talkingPoints">
      <LabeledField fieldKey="talkingPoints" label="Talking points" hint="One per line" />
      <DirAwareTextarea
        id="talkingPoints"
        locale={locale}
        value={value}
        readOnly={!editable}
        onChange={(e) => {
          const next = e.target.value
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          onField("talkingPoints", next.length > 0 ? next : undefined);
        }}
        rows={Math.min(8, Math.max(2, value.split("\n").length + 1))}
        placeholder="3-7 talking points"
      />
    </div>
  );
}

function QaPromptsFieldRenderer({ payload, locale, editable, onField }: FieldRendererProps) {
  const arr = Array.isArray(payload.qaPrompts) ? (payload.qaPrompts as unknown[]) : [];
  const value = arr.filter((x): x is string => typeof x === "string").join("\n");
  return (
    <div className="space-y-1.5" data-testid="field-qaPrompts">
      <LabeledField fieldKey="qaPrompts" label="Q&A prompts" hint="One per line" />
      <DirAwareTextarea
        id="qaPrompts"
        locale={locale}
        value={value}
        readOnly={!editable}
        onChange={(e) => {
          const next = e.target.value
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          onField("qaPrompts", next.length > 0 ? next : undefined);
        }}
        rows={Math.min(6, Math.max(2, value.split("\n").length + 1))}
        placeholder="Open the floor with..."
      />
    </div>
  );
}

function ScheduledStartFieldRenderer({ payload, locale, editable, onField }: FieldRendererProps) {
  const v = payload.scheduledStart;
  const value =
    typeof v === "string" ? v.slice(0, 16) : v instanceof Date ? v.toISOString().slice(0, 16) : "";
  return (
    <div className="space-y-1.5" data-testid="field-scheduledStart">
      <LabeledField fieldKey="scheduledStart" label="Scheduled start" hint="Local time" />
      <DirAwareInput
        id="scheduledStart"
        locale={locale}
        type="datetime-local"
        value={value}
        readOnly={!editable}
        onChange={(e) => onField("scheduledStart", e.target.value || undefined)}
      />
    </div>
  );
}

function ReferencesFieldRenderer({ payload, locale, editable, onField }: FieldRendererProps) {
  const arr = Array.isArray(payload.references) ? (payload.references as unknown[]) : [];
  const value = arr.filter((x): x is string => typeof x === "string").join("\n");
  return (
    <div className="space-y-1.5" data-testid="field-references">
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

function LocationFieldRenderer({ payload, locale, editable, onField }: FieldRendererProps) {
  const loc =
    payload.location && typeof payload.location === "object" && !Array.isArray(payload.location)
      ? (payload.location as Record<string, unknown>)
      : null;
  const name = typeof loc?.name === "string" ? loc.name : "";
  const externalId = typeof loc?.externalId === "string" ? loc.externalId : "";
  return (
    <fieldset className="space-y-1.5" data-testid="field-location">
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

function ObjectiveAudienceRenderer({ payload, locale, editable, onField }: FieldRendererProps) {
  const objective = typeof payload.objective === "string" ? payload.objective : "";
  const audience = typeof payload.audience === "string" ? payload.audience : "";
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="field-objective-audience">
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

// ─── Dispatch ───────────────────────────────────────────────────────

/**
 * Map a manifest key to its renderer. The dispatch is keyed by
 * the canonical payload key (`caption`, `scenes`, etc.) so the
 * manifest only needs to know "which key for which format + group",
 * not "how to render this key". The renderer registry is the
 * single source of truth for the rendering shape of each key.
 *
 * Adding a new field is a two-step process:
 *  1. Add the key to the Zod schema in `lib/format-payload/schemas.ts`.
 *  2. Add the key to the relevant formats' manifest in
 *     `format-payload-field-set.ts` and a renderer entry below
 *     (or reuse an existing one).
 */
export const RENDERERS: Record<string, FieldRenderer> = {
  caption: TextFieldRenderer,
  hashtags: TagFieldRenderer,
  hook: TextFieldRenderer,
  mainMessage: TextFieldRenderer,
  callToAction: TextFieldRenderer,
  firstComment: TextFieldRenderer,
  visualDirection: LongTextFieldRenderer,
  additionalNotes: LongTextFieldRenderer,
  description: LongTextFieldRenderer,
  onScreenText: LongTextFieldRenderer,
  voiceOverNotes: LongTextFieldRenderer,
  audioReference: PlainTextFieldRenderer,
  coverDirection: PlainTextFieldRenderer,
  thumbnailDirection: PlainTextFieldRenderer,
  transcriptNotes: LongTextFieldRenderer,
  // Enums — values are passed via `enumValues` on the manifest entry.
  ratio: (props) => (
    <EnumFieldRenderer
      {...props}
      enumValues={(props as unknown as { enumValues?: readonly string[] }).enumValues ?? []}
    />
  ),
  // `objective` and `audience` are rendered side-by-side as a
  // single grid (a "common objective + audience" header that
  // every format shares). The editor keys the lookup off
  // `objective`; the manifest still lists the two fields as
  // separate entries so the essential/advanced grouping works.
  objective: ObjectiveAudienceRenderer,
  audience: ObjectiveAudienceRenderer,
  // Composite / array fields.
  location: LocationFieldRenderer,
  references: ReferencesFieldRenderer,
  visualSlides: VisualSlidesFieldRenderer,
  scenes: ScenesFieldRenderer,
  slideOutline: SlideOutlineFieldRenderer,
  chapters: ChaptersFieldRenderer,
  outline: OutlineFieldRenderer,
  keyTakeaways: KeyTakeawaysFieldRenderer,
  talkingPoints: TalkingPointsFieldRenderer,
  qaPrompts: QaPromptsFieldRenderer,
  scheduledStart: ScheduledStartFieldRenderer,
  // Numeric fields.
  durationSeconds: (props) => <NumberFieldRenderer {...props} min={1} max={3600} />,
  expectedDurationMinutes: (props) => <NumberFieldRenderer {...props} min={1} max={600} />,
  frameCount: (props) => <NumberFieldRenderer {...props} min={1} max={5} />,
  slideCount: (props) => <NumberFieldRenderer {...props} min={2} max={10} />,
  wordCount: (props) => <NumberFieldRenderer {...props} min={1} max={50000} />,
};

/**
 * `objective` and `audience` are rendered together in a
 * side-by-side grid in the original editor. The dispatch
 * function handles this pair explicitly so the manifest can
 * still list them as separate fields.
 */
export function isObjectiveAudienceKey(key: string): boolean {
  return key === "objective" || key === "audience";
}

/** Lookup a renderer for a key; returns a fallback that warns in dev. */
export function rendererFor(key: string): FieldRenderer {
  const r = RENDERERS[key];
  if (!r) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[format-payload-field-renderers] no renderer for key: ${key}`);
    }
    const FallbackField: NamedFieldRenderer = ({
      fieldKey,
      label,
      payload,
      locale,
      editable,
      onField,
    }) => (
      <div className="space-y-1.5" data-testid={`field-${fieldKey}-fallback`}>
        <LabeledField fieldKey={fieldKey} label={label} />
        <DirAwareInput
          id={fieldKey}
          locale={locale}
          value={typeof payload[fieldKey] === "string" ? (payload[fieldKey] as string) : ""}
          readOnly={!editable}
          onChange={(e) => onField(fieldKey, e.target.value || undefined)}
        />
      </div>
    );
    FallbackField.displayName = "FallbackField";
    return FallbackField;
  }
  return r;
}

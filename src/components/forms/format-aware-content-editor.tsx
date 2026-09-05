"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle2, Compass, Loader2, MessageSquareText, Palette, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { updateFormatPayloadAction } from "@/app/(app)/app/w/[slug]/planning/actions";
import { NavigableArrayField } from "@/components/forms/navigable-array-field";
import { useBeforeunloadDirtyGuard } from "@/lib/forms/use-beforeunload-dirty-guard";
import { useNavigationDirtyGuard } from "@/lib/forms/use-navigation-dirty-guard";
import { fieldsFor, ratioOptionsFor, type FieldDef } from "./format-payload-field-set";
import {
  rendererFor,
  isObjectiveAudienceKey,
  type FieldRendererProps,
} from "./format-payload-field-renderers";
import type { ContentFormat } from "@/lib/format-payload/schemas";
import { humanFormat } from "@/lib/content/status";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { isAudienceCopyKey } from "@/lib/content/audience-copy";

/**
 * FormatAwareContentEditor — sectioned, format-aware
 * rewrite of `FormatPayloadEditor` for Phase 2 of the
 * planning-workspace-v2 refactor (2026-08-30).
 *
 * The previous editor dumped every per-format field into a
 * single two-tier (essential / advanced) list. That worked
 * for power users but overwhelmed first-timers: 13 fields
 * on a static post, with no visual separation between
 * "strategy intent" and "ready-to-publish copy". This
 * component splits the same payload into three conceptual
 * groups, so the planner always knows which question each
 * field is answering:
 *
 *   1. **Strategy** — why are we publishing this? (objective,
 *      audience, key message, hook, main message)
 *   2. **Creative** — what does the visual look like? Audience-facing
 *      copy is intentionally omitted here and edited in the Copy tab.
 *      Format-specific:
 *        - Static Post → visual direction, visual slides,
 *          references, design notes
 *        - Carousel → slide outline (with full add / duplicate /
 *          delete / reorder / drag / keyboard support)
 *        - Reel → scenes, cover direction, on-screen text,
 *          voice-over notes, audio reference
 *
 * The data model is unchanged. The component still writes
 * the creative subset of `formatPayload` via the existing server
 * action; canonical audience copy is written by the Copy tab.
 *
 * Localization (Phase 5b, 2026-09-01): section titles,
 * section descriptions, and field labels are resolved
 * through the active message catalog at render time. The
 * parent passes a bound translator via the `t` prop. Per-
 * format description overrides (carousel slide manager,
 * reel scene manager) live in `descriptionFallback` so the
 * editor can keep the per-format copy without bloating the
 * catalog with format-specific keys in v1.
 *
 * Backwards compatibility: `FormatPayloadEditor` is still
 * exported and the planning detail page's "Creative brief"
 * section continues to work. The new `FormatAwareContentEditor`
 * is mounted in the Content tab so planners see the
 * sectioned view by default.
 */

const initial: { error?: string; ok?: boolean } = {};

export interface FormatAwareContentEditorProps {
  /** Bound translator from `tForActive()`. Resolves the field's
   *  `labelKey` and the section's `titleKey` / `descriptionKey`
   *  through the active message catalog. */
  t?: (key: string, params?: Record<string, string | number>) => string;
  workspaceSlug: string;
  contentItemId: string;
  format: ContentFormat;
  initial: Record<string, unknown>;
  editable: boolean;
  /** When set, only these production fields are editable (designer mode). */
  editableFields?: ReadonlyArray<string>;
  locale: string;
  aiEnabled: boolean;
}

/**
 * Group definitions per format. Each group is a list of
 * field keys; the renderer walks the manifest and matches
 * by `key`. Unknown / future keys fall into the "Creative"
 * bucket as a safe default.
 */
interface SectionDef {
  id: "strategy" | "copy" | "creative";
  titleKey: string;
  descriptionKey: string;
  /** Optional per-format description override; falls back to
   *  the descriptionKey when omitted. The carousel "Slides"
   *  section uses this for the per-format "Add, reorder…" copy
   *  that lives outside the catalog for now (a future
   *  per-format catalog key can promote it). */
  descriptionFallback?: string;
  icon: React.ComponentType<{ className?: string }>;
  keys: ReadonlyArray<string>;
}

const SECTIONS_BY_FORMAT: Record<ContentFormat, ReadonlyArray<SectionDef>> = {
  static_post: [
    {
      id: "strategy",
      titleKey: "formatEditor.sections.strategy.title",
      descriptionKey: "formatEditor.sections.strategy.description",
      icon: Compass,
      keys: ["objective", "audience", "hook", "mainMessage", "callToAction"],
    },
    {
      id: "copy",
      titleKey: "formatEditor.sections.copy.title",
      descriptionKey: "formatEditor.sections.copy.description",
      icon: MessageSquareText,
      keys: ["caption", "hashtags", "firstComment"],
    },
    {
      id: "creative",
      titleKey: "formatEditor.sections.creative.title",
      descriptionKey: "formatEditor.sections.creative.description",
      icon: Palette,
      keys: ["visualDirection", "visualSlides", "references", "location", "additionalNotes"],
    },
  ],
  carousel: [
    {
      id: "strategy",
      titleKey: "formatEditor.sections.strategy.title",
      descriptionKey: "formatEditor.sections.strategy.description",
      icon: Compass,
      keys: ["objective", "audience", "hook", "mainMessage", "callToAction"],
    },
    {
      id: "copy",
      titleKey: "formatEditor.sections.copy.title",
      descriptionKey: "formatEditor.sections.copy.description",
      icon: MessageSquareText,
      keys: ["caption", "hashtags", "firstComment"],
    },
    {
      id: "creative",
      titleKey: "formatEditor.sections.creative.title",
      descriptionKey: "formatEditor.sections.creative.description",
      descriptionFallback:
        "Add, reorder, and edit each slide. Drag chips or use Alt + ↑ / ↓ to reorder; ⌘D to duplicate.",
      icon: Palette,
      // The slide outline gets first-class treatment; we
      // render the structured array field directly, with
      // the full add/duplicate/delete/reorder UI. The
      // remaining creative-direction fields fall after it.
      keys: ["slideOutline", "visualDirection", "references", "additionalNotes"],
    },
  ],
  short_form_video: [
    {
      id: "strategy",
      titleKey: "formatEditor.sections.strategy.title",
      descriptionKey: "formatEditor.sections.strategy.description",
      icon: Compass,
      keys: ["objective", "audience", "hook", "mainMessage", "callToAction"],
    },
    {
      id: "copy",
      titleKey: "formatEditor.sections.copy.title",
      descriptionKey: "formatEditor.sections.copy.description",
      icon: MessageSquareText,
      keys: ["caption", "hashtags", "firstComment"],
    },
    {
      id: "creative",
      titleKey: "formatEditor.sections.creativeDirection.title",
      descriptionKey: "formatEditor.sections.creativeDirection.description",
      descriptionFallback:
        "Scenes, cover, on-screen text, voice-over and audio reference. Use Alt + ↑ / ↓ to reorder scenes.",
      icon: Palette,
      keys: [
        "ratio",
        "durationSeconds",
        "scenes",
        "onScreenText",
        "voiceOverNotes",
        "audioReference",
        "coverDirection",
        "visualDirection",
        "references",
        "additionalNotes",
      ],
    },
  ],
  // Other formats reuse the static_post layout. The
  // sectioned UX is a nice-to-have; v1 ships the
  // sectioned view for the three flagship formats and
  // a flat fallback for everything else.
  story: [
    {
      id: "strategy",
      titleKey: "formatEditor.sections.strategy.title",
      descriptionKey: "formatEditor.sections.strategy.description",
      icon: Compass,
      keys: ["objective", "audience", "hook", "callToAction"],
    },
    {
      id: "copy",
      titleKey: "formatEditor.sections.copy.title",
      descriptionKey: "formatEditor.sections.copy.description",
      icon: MessageSquareText,
      keys: ["caption", "hashtags"],
    },
    {
      id: "creative",
      titleKey: "formatEditor.sections.creative.title",
      descriptionKey: "formatEditor.sections.creative.description",
      icon: Palette,
      keys: ["frameCount", "visualDirection", "additionalNotes"],
    },
  ],
  long_form_video: [
    {
      id: "strategy",
      titleKey: "formatEditor.sections.strategy.title",
      descriptionKey: "formatEditor.sections.strategy.description",
      icon: Compass,
      keys: ["objective", "audience", "hook", "mainMessage", "callToAction"],
    },
    {
      id: "copy",
      titleKey: "formatEditor.sections.copy.title",
      descriptionKey: "formatEditor.sections.copy.description",
      icon: MessageSquareText,
      keys: ["caption", "hashtags", "firstComment"],
    },
    {
      id: "creative",
      titleKey: "formatEditor.sections.creative.title",
      descriptionKey: "formatEditor.sections.creative.description",
      icon: Palette,
      keys: [
        "ratio",
        "durationSeconds",
        "scriptOutline",
        "chapters",
        "visualDirection",
        "references",
        "additionalNotes",
      ],
    },
  ],
  article: [
    {
      id: "strategy",
      titleKey: "formatEditor.sections.strategy.title",
      descriptionKey: "formatEditor.sections.strategy.description",
      icon: Compass,
      keys: ["objective", "audience", "mainMessage", "callToAction"],
    },
    {
      id: "copy",
      titleKey: "formatEditor.sections.copy.title",
      descriptionKey: "formatEditor.sections.copy.description",
      icon: MessageSquareText,
      keys: ["headline", "summary", "body", "hashtags"],
    },
    {
      id: "creative",
      titleKey: "formatEditor.sections.creative.title",
      descriptionKey: "formatEditor.sections.creative.description",
      icon: Palette,
      keys: ["outline", "references", "additionalNotes"],
    },
  ],
  live_content: [
    {
      id: "strategy",
      titleKey: "formatEditor.sections.strategy.title",
      descriptionKey: "formatEditor.sections.strategy.description",
      icon: Compass,
      keys: ["objective", "audience", "hook", "mainMessage"],
    },
    {
      id: "copy",
      titleKey: "formatEditor.sections.copy.title",
      descriptionKey: "formatEditor.sections.copy.description",
      icon: MessageSquareText,
      keys: ["preShowCaption", "postShowCaption", "hashtags"],
    },
    {
      id: "creative",
      titleKey: "formatEditor.sections.creative.title",
      descriptionKey: "formatEditor.sections.creative.description",
      icon: Palette,
      keys: ["runOfShow", "guests", "expectedDurationSeconds", "references", "additionalNotes"],
    },
  ],
  other: [
    {
      id: "strategy",
      titleKey: "formatEditor.sections.strategy.title",
      descriptionKey: "formatEditor.sections.strategy.description",
      icon: Compass,
      keys: ["objective", "audience", "mainMessage"],
    },
    {
      id: "copy",
      titleKey: "formatEditor.sections.copy.title",
      descriptionKey: "formatEditor.sections.copy.description",
      icon: MessageSquareText,
      keys: ["caption", "hashtags"],
    },
    {
      id: "creative",
      titleKey: "formatEditor.sections.creative.title",
      descriptionKey: "formatEditor.sections.creative.description",
      icon: Palette,
      keys: ["visualDirection", "references", "additionalNotes"],
    },
  ],
};

export function FormatAwareContentEditor({
  t: tProp,
  workspaceSlug,
  contentItemId,
  format,
  initial: initialPayload,
  editable,
  editableFields,
  locale,
  aiEnabled,
}: FormatAwareContentEditorProps) {
  const localeT = useLocaleT();
  const t = tProp ?? localeT;
  const [payload, setPayload] = React.useState<Record<string, unknown>>(initialPayload);
  const initialJson = React.useMemo(() => JSON.stringify(initialPayload), [initialPayload]);
  // Reset the payload only when the initial changes (e.g.
  // after a re-render from a parent revalidation).
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPayload(initialPayload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJson]);

  const boundAction = updateFormatPayloadAction.bind(null, workspaceSlug);
  const [state, formAction, pending] = useActionState(boundAction, initial);
  // Ref used by the navigation dirty guard. The Messages
  // panel has its own form ref; the format-aware editor
  // mirrors the same pattern so the beforeunload and
  // in-app navigation prompts cover the Content tab too.
  const formRef = React.useRef<HTMLFormElement | null>(null);
  // After a successful save the form is "clean" — the
  // dirty guards suppress their prompt until the user
  // makes another edit.
  const isClean = state?.ok === true;
  useBeforeunloadDirtyGuard(formRef, isClean);
  useNavigationDirtyGuard({
    formRef,
    isClean,
    confirmMessage: t("formatEditor.editor.unsavedGuard"),
  });

  const fields = React.useMemo(() => fieldsFor(format), [format]);
  const sections = SECTIONS_BY_FORMAT[format] ?? SECTIONS_BY_FORMAT.static_post!;

  function setField(key: string, value: unknown) {
    setPayload((prev) => ({ ...prev, [key]: value }));
  }
  function setFieldTranslation(key: string, localeCode: string, value: string) {
    setPayload((prev) => {
      const current =
        (prev.translations as Record<string, Record<string, string>> | undefined) ?? {};
      const fieldMap = current[localeCode] ?? {};
      const next = {
        ...current,
        [localeCode]: { ...fieldMap, [key]: value },
      };
      return { ...prev, translations: next };
    });
  }

  const isFieldEditable = (fieldKey: string) =>
    editable && (editableFields === undefined || editableFields.includes(fieldKey));

  const translations =
    (payload.translations as Record<string, Record<string, unknown>> | undefined) ?? {};

  // Resolve a section description: prefer the per-format
  // `descriptionFallback` when present, otherwise the
  // catalog's `descriptionKey`. The fallback is English-only
  // in v1 (noted limitation; future pass moves per-format
  // copy to the catalog).
  function resolveDescription(section: SectionDef): string {
    if (section.descriptionFallback) return section.descriptionFallback;
    return t(section.descriptionKey);
  }

  // Render a single field via the existing renderer registry.
  const renderField = (field: FieldDef) => {
    const renderer = rendererFor(field.key);
    return renderer({
      fieldKey: field.key,
      // Resolve the field's catalog key to a localized label at
      // the call site. The renderer only sees the resolved string,
      // so it doesn't need to know about the catalog.
      label: t(field.labelKey),
      payload,
      translations,
      locale,
      editable: isFieldEditable(field.key),
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

  // Carousel slide outline + Reel scenes get first-class
  // treatment: full add/duplicate/delete/reorder UI via
  // `NavigableArrayField`. We hand the data straight to
  // that component because the structured array shape
  // (position / summary / …) is exactly what it expects.
  function renderStructuredArray(
    sectionId: "creative",
    fieldKey: string,
    label: string,
    entity: string,
    columns: Array<{ key: string; label: string; kind: "text" | "number"; optional?: boolean }>,
  ) {
    const arr = Array.isArray(payload[fieldKey]) ? (payload[fieldKey] as unknown[]) : [];
    return (
      <NavigableArrayField
        key={fieldKey}
        fieldKey={fieldKey}
        label={label}
        hint={t("formatEditor.editor.structuredArrayHint")}
        rows={arr}
        columns={columns}
        locale={locale}
        editable={isFieldEditable(fieldKey)}
        layout="slider"
        entity={entity}
        onField={setField}
      />
    );
  }

  return (
    <Card data-testid="format-aware-content-editor" data-format={format}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>
            {t("formatEditor.editor.creativeBriefTitle", { format: humanFormat(format) })}
          </CardTitle>
          <CardDescription>{t("formatEditor.editor.creativeBriefDescription")}</CardDescription>
        </div>
        <span
          className="text-label text-fg-secondary border-border bg-surface-subtle inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold"
          data-testid="format-aware-format-pill"
        >
          {humanFormat(format)}
        </span>
      </div>

      {editableFields ? (
        <p
          className="border-border bg-surface-subtle text-label text-fg-secondary mt-4 rounded-[var(--radius-control)] border px-3 py-2"
          data-testid="designer-production-guidance"
        >
          {t("formatEditor.editor.designerGuidance")}
        </p>
      ) : null}

      <div className="mt-5 space-y-5" data-testid="format-aware-sections">
        {sections.map((section) => {
          // Audience-facing fields have one canonical owner: the Copy tab.
          // Keep strategy fields such as Hook and Main message here, but do
          // not render a second editable caption/CTA/hashtag surface.
          if (section.id === "copy") return null;
          const Icon = section.icon;
          // Map the section's declared keys back to the manifest
          // entries. We render in manifest order so the planner
          // always sees the same fields in the same place.
          const sectionFields = fields.filter(
            (f) =>
              section.keys.includes(f.key) &&
              !isAudienceCopyKey(f.key) &&
              // objective/audience are rendered as a pair by
              // their own renderer; pick one entry to drive
              // the render and skip the other.
              !isObjectiveAudienceKey(f.key),
          );
          const hasObjectiveAudience = section.keys.some((k) => isObjectiveAudienceKey(k));
          return (
            <section
              key={section.id}
              className="border-border bg-surface rounded-[var(--radius-control)] border p-4"
              data-testid={`format-section-${section.id}`}
            >
              <header className="mb-3 flex items-baseline gap-2">
                <Icon className="text-fg-muted h-4 w-4" aria-hidden="true" />
                <h3 className="text-body text-fg-primary font-semibold">{t(section.titleKey)}</h3>
              </header>
              <p className="text-label text-fg-muted mb-3">{resolveDescription(section)}</p>
              <div className="space-y-4">
                {/* The objective+audience pair is rendered as one
                    composite block via its dedicated renderer. */}
                {hasObjectiveAudience ? (
                  <div data-testid={`format-section-${section.id}-objective-audience`}>
                    {(() => {
                      const renderer = rendererFor("objective");
                      return renderer({
                        fieldKey: "objective",
                        label: t("formatEditor.editor.goalAudience"),
                        payload,
                        translations,
                        locale,
                        editable: isFieldEditable("objective") && isFieldEditable("audience"),
                        aiEnabled,
                        contentItemId,
                        t,
                        onField: setField,
                        onTranslation: setFieldTranslation,
                      } as FieldRendererProps);
                    })()}
                  </div>
                ) : null}
                {sectionFields.map((f) => {
                  // Carousel slide outline → dedicated array manager
                  if (format === "carousel" && f.key === "slideOutline") {
                    return (
                      <div key={f.key} data-testid={`format-section-${section.id}-${f.key}`}>
                        {renderStructuredArray(
                          "creative",
                          "slideOutline",
                          t("formatEditor.editor.structuredArraySlideOutline"),
                          t("formatEditor.editor.structuredArraySlideEntity"),
                          [
                            {
                              key: "position",
                              label: t("formatEditor.fields.positionTag"),
                              kind: "number",
                            },
                            {
                              key: "summary",
                              label: t("formatEditor.fields.summary"),
                              kind: "text",
                            },
                            {
                              key: "visual",
                              label: t("formatEditor.fields.visual"),
                              kind: "text",
                              optional: true,
                            },
                          ],
                        )}
                      </div>
                    );
                  }
                  // Reel scenes → dedicated array manager
                  if (format === "short_form_video" && f.key === "scenes") {
                    return (
                      <div key={f.key} data-testid={`format-section-${section.id}-${f.key}`}>
                        {renderStructuredArray(
                          "creative",
                          "scenes",
                          t("formatEditor.editor.structuredArrayScenes"),
                          t("formatEditor.editor.structuredArraySceneEntity"),
                          [
                            {
                              key: "position",
                              label: t("formatEditor.fields.scenePosition"),
                              kind: "number",
                            },
                            {
                              key: "summary",
                              label: t("formatEditor.fields.summary"),
                              kind: "text",
                            },
                            {
                              key: "durationSeconds",
                              label: t("formatEditor.fields.durationSeconds"),
                              kind: "number",
                              optional: true,
                            },
                          ],
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={f.key} data-testid={`format-section-${section.id}-${f.key}`}>
                      {renderField(f)}
                    </div>
                  );
                })}
                {sectionFields.length === 0 && !hasObjectiveAudience ? (
                  <p
                    className="text-label text-fg-muted"
                    data-testid={`format-section-${section.id}-empty`}
                  >
                    {t("formatEditor.editor.emptySection", { format: humanFormat(format) })}
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      {editable ? (
        <form ref={formRef} action={formAction} className="mt-5 flex flex-wrap items-center gap-2">
          <input type="hidden" name="contentItemId" value={contentItemId} />
          {/* The `format` hidden input is required by
              `updateFormatPayloadFormSchema` in
              `planning/actions.ts` — the Zod schema needs the
              format enum to pick the right per-format parser.
              `MessagesPanel` already includes this field; the
              two content editors were missing it, which made
              every save fail with a `format` field error. */}
          <input type="hidden" name="format" value={format} />
          <input type="hidden" name="formatPayload" value={JSON.stringify(payload)} />
          <Button type="submit" size="sm" disabled={pending} data-testid="format-aware-save">
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {pending ? t("formatEditor.editor.savePending") : t("formatEditor.editor.save")}
          </Button>
          {pending ? (
            <p
              className="text-label text-fg-muted inline-flex items-center gap-1"
              data-testid="format-aware-saving"
              aria-live="polite"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              {t("formatEditor.editor.savePending")}
            </p>
          ) : state?.error ? (
            <p
              role="alert"
              aria-live="assertive"
              className="text-label text-danger"
              data-testid="format-aware-save-error"
            >
              {state.error}
            </p>
          ) : state?.ok ? (
            <p
              className="text-label text-success inline-flex items-center gap-1"
              data-testid="format-aware-save-confirmation"
              aria-live="polite"
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t("formatEditor.editor.saveSuccess")}
            </p>
          ) : null}
        </form>
      ) : (
        <p className="text-label text-fg-muted mt-3 inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          {t("formatEditor.editor.readOnly")}
        </p>
      )}
    </Card>
  );
}

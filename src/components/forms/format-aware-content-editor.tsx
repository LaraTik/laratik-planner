"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle2, Compass, Loader2, MessageSquareText, Palette, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { updateFormatPayloadAction } from "@/app/(app)/app/w/[slug]/planning/actions";
import { NavigableArrayField } from "@/components/forms/navigable-array-field";
import { fieldsFor, type FieldDef } from "./format-payload-field-set";
import {
  rendererFor,
  isObjectiveAudienceKey,
  type FieldRendererProps,
} from "./format-payload-field-renderers";
import type { ContentFormat } from "@/lib/format-payload/schemas";
import { humanFormat } from "@/lib/content/status";

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
 *      audience, key message, hook, main message, CTA)
 *   2. **Copy** — what gets posted? (caption, hashtags, first
 *      comment, translations)
 *   3. **Creative** — what does the visual look like?
 *      Format-specific:
 *        - Static Post → visual direction, visual slides,
 *          references, design notes
 *        - Carousel → slide outline (with full add / duplicate /
 *          delete / reorder / drag / keyboard support)
 *        - Reel → scenes, cover direction, on-screen text,
 *          voice-over notes, audio reference
 *
 * The data model is unchanged. The component still writes
 * the full `formatPayload` via the existing server action;
 * the sectioning is purely presentational.
 *
 * Backwards compatibility: `FormatPayloadEditor` is still
 * exported and the planning detail page's "Creative brief"
 * section continues to work. The new `FormatAwareContentEditor`
 * is mounted in the Content tab so planners see the
 * sectioned view by default.
 */

const initial: { error?: string } = {};

export interface FormatAwareContentEditorProps {
  workspaceSlug: string;
  contentItemId: string;
  format: ContentFormat;
  initial: Record<string, unknown>;
  editable: boolean;
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
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  keys: ReadonlyArray<string>;
}

const SECTIONS_BY_FORMAT: Record<ContentFormat, ReadonlyArray<SectionDef>> = {
  static_post: [
    {
      id: "strategy",
      title: "Strategy",
      description: "Why are we publishing this post?",
      icon: Compass,
      keys: ["objective", "audience", "hook", "mainMessage", "callToAction"],
    },
    {
      id: "copy",
      title: "Copy",
      description: "Caption, hashtags, first comment.",
      icon: MessageSquareText,
      keys: ["caption", "hashtags", "firstComment"],
    },
    {
      id: "creative",
      title: "Creative",
      description: "Visual direction, references, design notes.",
      icon: Palette,
      keys: ["visualDirection", "visualSlides", "references", "location", "additionalNotes"],
    },
  ],
  carousel: [
    {
      id: "strategy",
      title: "Strategy",
      description: "Why are we publishing this carousel?",
      icon: Compass,
      keys: ["objective", "audience", "hook", "mainMessage", "callToAction"],
    },
    {
      id: "copy",
      title: "Copy",
      description: "Post-level caption, hashtags, first comment.",
      icon: MessageSquareText,
      keys: ["caption", "hashtags", "firstComment"],
    },
    {
      id: "creative",
      title: "Slides",
      description:
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
      title: "Strategy",
      description: "Why are we publishing this Reel?",
      icon: Compass,
      keys: ["objective", "audience", "hook", "mainMessage", "callToAction"],
    },
    {
      id: "copy",
      title: "Copy",
      description: "Caption, hashtags, first comment.",
      icon: MessageSquareText,
      keys: ["caption", "hashtags", "firstComment"],
    },
    {
      id: "creative",
      title: "Creative direction",
      description:
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
      title: "Strategy",
      description: "Why are we publishing this story?",
      icon: Compass,
      keys: ["objective", "audience", "hook", "callToAction"],
    },
    {
      id: "copy",
      title: "Copy",
      description: "Caption and hashtags.",
      icon: MessageSquareText,
      keys: ["caption", "hashtags"],
    },
    {
      id: "creative",
      title: "Creative",
      description: "Visual direction and design notes.",
      icon: Palette,
      keys: ["frameCount", "visualDirection", "additionalNotes"],
    },
  ],
  long_form_video: [
    {
      id: "strategy",
      title: "Strategy",
      description: "Why are we publishing this long-form video?",
      icon: Compass,
      keys: ["objective", "audience", "hook", "mainMessage", "callToAction"],
    },
    {
      id: "copy",
      title: "Copy",
      description: "Caption, hashtags, first comment.",
      icon: MessageSquareText,
      keys: ["caption", "hashtags", "firstComment"],
    },
    {
      id: "creative",
      title: "Creative",
      description: "Script outline, visual direction, references.",
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
      title: "Strategy",
      description: "Why are we publishing this article?",
      icon: Compass,
      keys: ["objective", "audience", "mainMessage", "callToAction"],
    },
    {
      id: "copy",
      title: "Copy",
      description: "Title, summary, body.",
      icon: MessageSquareText,
      keys: ["headline", "summary", "body", "hashtags"],
    },
    {
      id: "creative",
      title: "Creative",
      description: "Outline, references, design notes.",
      icon: Palette,
      keys: ["outline", "references", "additionalNotes"],
    },
  ],
  live_content: [
    {
      id: "strategy",
      title: "Strategy",
      description: "Why are we going live?",
      icon: Compass,
      keys: ["objective", "audience", "hook", "mainMessage"],
    },
    {
      id: "copy",
      title: "Copy",
      description: "Pre / post captions and hashtags.",
      icon: MessageSquareText,
      keys: ["preShowCaption", "postShowCaption", "hashtags"],
    },
    {
      id: "creative",
      title: "Creative",
      description: "Run-of-show, guests, references.",
      icon: Palette,
      keys: ["runOfShow", "guests", "expectedDurationSeconds", "references", "additionalNotes"],
    },
  ],
  other: [
    {
      id: "strategy",
      title: "Strategy",
      description: "Why are we publishing this?",
      icon: Compass,
      keys: ["objective", "audience", "mainMessage"],
    },
    {
      id: "copy",
      title: "Copy",
      description: "Caption, hashtags.",
      icon: MessageSquareText,
      keys: ["caption", "hashtags"],
    },
    {
      id: "creative",
      title: "Creative",
      description: "Visual direction and notes.",
      icon: Palette,
      keys: ["visualDirection", "references", "additionalNotes"],
    },
  ],
};

export function FormatAwareContentEditor({
  workspaceSlug,
  contentItemId,
  format,
  initial: initialPayload,
  editable,
  locale,
  aiEnabled,
}: FormatAwareContentEditorProps) {
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

  const translations =
    (payload.translations as Record<string, Record<string, unknown>> | undefined) ?? {};

  // Render a single field via the existing renderer registry.
  const renderField = (field: FieldDef) => {
    const renderer = rendererFor(field.key);
    return renderer({
      fieldKey: field.key,
      label: field.label,
      payload,
      translations,
      locale,
      editable,
      aiEnabled,
      contentItemId,
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
        hint="Drag chips to reorder, or focus and press Alt + ↑ / ↓. ⌘D duplicates, Delete removes."
        rows={arr}
        columns={columns}
        locale={locale}
        editable={editable}
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
          <CardTitle>{humanFormat(format)} content</CardTitle>
          <CardDescription>
            Strategy, copy, and creative sections. Fields persist via the Save button below.
          </CardDescription>
        </div>
        <span
          className="text-label text-fg-secondary border-border bg-surface-subtle inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold"
          data-testid="format-aware-format-pill"
        >
          {humanFormat(format)}
        </span>
      </div>

      <div className="mt-5 space-y-5" data-testid="format-aware-sections">
        {sections.map((section) => {
          const Icon = section.icon;
          // Map the section's declared keys back to the manifest
          // entries. We render in manifest order so the planner
          // always sees the same fields in the same place.
          const sectionFields = fields.filter(
            (f) =>
              section.keys.includes(f.key) &&
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
                <h3 className="text-body text-fg-primary font-semibold">{section.title}</h3>
              </header>
              <p className="text-label text-fg-muted mb-3">{section.description}</p>
              <div className="space-y-4">
                {/* The objective+audience pair is rendered as one
                    composite block via its dedicated renderer. */}
                {hasObjectiveAudience ? (
                  <div data-testid={`format-section-${section.id}-objective-audience`}>
                    {(() => {
                      const renderer = rendererFor("objective");
                      return renderer({
                        fieldKey: "objective",
                        label: "Goal & audience",
                        payload,
                        translations,
                        locale,
                        editable,
                        aiEnabled,
                        contentItemId,
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
                        {renderStructuredArray("creative", "slideOutline", "Slides", "Slide", [
                          { key: "position", label: "#", kind: "number" },
                          { key: "summary", label: "Summary", kind: "text" },
                          { key: "visual", label: "Visual", kind: "text", optional: true },
                        ])}
                      </div>
                    );
                  }
                  // Reel scenes → dedicated array manager
                  if (format === "short_form_video" && f.key === "scenes") {
                    return (
                      <div key={f.key} data-testid={`format-section-${section.id}-${f.key}`}>
                        {renderStructuredArray("creative", "scenes", "Scenes", "Scene", [
                          { key: "position", label: "#", kind: "number" },
                          { key: "summary", label: "Summary", kind: "text" },
                          { key: "durationSeconds", label: "Sec", kind: "number", optional: true },
                        ])}
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
                    No fields in this section for {humanFormat(format)}.
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      {editable ? (
        <form action={formAction} className="mt-5 flex flex-wrap items-center gap-2">
          <input type="hidden" name="contentItemId" value={contentItemId} />
          <input type="hidden" name="formatPayload" value={JSON.stringify(payload)} />
          <Button type="submit" size="sm" disabled={pending} data-testid="format-aware-save">
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {pending ? "Saving…" : "Save content details"}
          </Button>
          {state?.error ? (
            <p role="alert" className="text-label text-danger">
              {state.error}
            </p>
          ) : null}
        </form>
      ) : (
        <p className="text-label text-fg-muted mt-3 inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Read-only — this item is past the editable window.
        </p>
      )}
    </Card>
  );
}

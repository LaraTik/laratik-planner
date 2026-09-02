"use client";

import * as React from "react";
import { AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * FormSummary — top-of-form error card.
 *
 * Web Interface Guidelines §Forms: "Errors inline next to fields;
 * focus first error on submit." The card is the WIG-prescribed
 * summary that lists each failed field by its label and links
 * to the field's id. Screen-reader users get a single
 * `role="alert"` announcement; sighted users see a danger-tinted
 * card with a list of anchor links they can click to land on
 * the offender.
 *
 * Usage:
 *   <FormSummary
 *     error={state?.error}
 *     fieldErrors={state?.fieldErrors}
 *     fieldLabels={{ title: "Title", brief: "Brief", … }}
 *   />
 *
 * The component does NOT call `focusFirstInvalid` itself — the
 * form's submit handler does. The summary is the visual surface
 * that announces the errors; the focus helper is the keyboard
 * affordance.
 */
export interface FormSummaryProps {
  /** Top-level error string. Rendered as the card title when present. */
  error?: string;
  /**
   * Per-field error map from the Server Action. Keys are field
   * names (e.g. `title`, `brief`, `channelIds`). Values are the
   * user-facing messages — already localised at the call site
   * or via the Zod schema.
   */
  fieldErrors?: Record<string, string | undefined>;
  /**
   * Map of field-name → human label. Used to render the
   * clickable link text (e.g. "Title" instead of "title").
   * If a field has an error but no label, the card falls back
   * to the field name with the first letter capitalised.
   */
  fieldLabels?: Record<string, string>;
  /**
   * Field-id prefix. Useful when a form renders multiple
   * sub-forms (e.g. the publish-package-form has one section
   * per channel). When set, each anchor link is
   * `#${fieldIdPrefix}-${fieldName}`.
   */
  fieldIdPrefix?: string;
  className?: string;
}

export function FormSummary({
  error,
  fieldErrors,
  fieldLabels,
  fieldIdPrefix,
  className,
}: FormSummaryProps) {
  const t = useLocaleT();
  const tr = (key: string, fallback: string) => (t(key) === key ? fallback : t(key));

  // Don't render an empty card.
  const fields = fieldErrors ? Object.entries(fieldErrors).filter(([, v]) => Boolean(v)) : [];
  if (!error && fields.length === 0) return null;

  const summaryTitle = tr("forms.errorSummary.title", "Please fix the highlighted fields");
  const summaryDescription = tr(
    "forms.errorSummary.description",
    "We couldn't save the form because of the following issue(s):",
  );

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="form-summary"
      className={cn(
        "border-danger/30 bg-danger-subtle text-label text-danger space-y-2 rounded-[var(--radius-control)] border p-3",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertOctagon className="h-4 w-4 shrink-0 translate-y-px" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-body text-danger font-semibold">{summaryTitle}</p>
          {error ? <p className="text-fg-secondary">{error}</p> : null}
          {fields.length > 0 ? <p className="text-fg-secondary">{summaryDescription}</p> : null}
          {fields.length > 0 ? (
            <ul className="text-fg-secondary list-disc space-y-0.5 ps-5">
              {fields.map(([field, message]) => {
                const id = fieldIdPrefix ? `${fieldIdPrefix}-${field}` : field;
                const label = fieldLabels?.[field] ?? capitalise(field);
                return (
                  <li key={field} data-testid={`form-summary-field-${field}`}>
                    <a
                      href={`#${id}`}
                      className="text-danger focus-visible:ring-focus-ring underline underline-offset-2 hover:opacity-80 focus:outline-none focus-visible:ring-2"
                      onClick={(e) => {
                        // Smooth scroll is handled by the focus helper on
                        // submit; here we just let the browser jump. We
                        // call preventDefault on Cmd/Ctrl-click so the
                        // middle-click "open in new tab" gesture still
                        // works on the anchor.
                        if (!e.metaKey && !e.ctrlKey) {
                          // Default behaviour is fine.
                        }
                      }}
                    >
                      {label}
                    </a>
                    {message ? <span className="text-fg-muted"> — {message}</span> : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function capitalise(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/i18n/format-locale";
import { useLocaleCode } from "@/components/i18n/locale-provider";

/**
 * CaptionField — shared audience-facing caption composer.
 *
 * Plan §3: the caption is the heart of the post's audience-facing
 * copy. The textarea now has 8 rows (was 4) and is `resize-y`
 * so a long caption can be expanded without scrolling the page.
 * A live `aria-live="polite"` character counter goes warning at
 * 90% and danger at 100% of the schema cap (2 200 chars per
 * `src/lib/format-payload/schemas.ts:84`).
 *
 * Used by three surfaces:
 *   1. The new Messages tab on the planning detail page
 *      (`src/components/planning/messages-panel.tsx`) — the
 *      primary editor.
 *   2. The Format-Aware Content Editor
 *      (`src/components/forms/format-aware-content-editor.tsx`)
 *      — for the planner's working draft.
 *   3. The PublishPackageForm
 *      (`src/app/(app)/app/w/[slug]/planning/[id]/publish/publish-package-form.tsx`)
 *      — per-platform adaptation.
 *
 * The shared component is the single source of truth for the
 * 8-row + 2 200 cap + live counter UX. A future refactor
 * (e.g. adding an emoji picker) lands in one place.
 */
export const CAPTION_MAX = 2_200;
const CAPTION_WARN = Math.floor(CAPTION_MAX * 0.9); // 1 980

export interface CaptionFieldProps {
  /** Visible field label rendered above the textarea. */
  label: string;
  /** The textarea's `name` attribute (form field name). */
  name: string;
  /** Unique id used by the form summary card's anchor link. */
  id: string;
  /** Controlled value. */
  value: string;
  /** Controlled onChange. */
  onChange: (next: string) => void;
  /** Optional placeholder. */
  placeholder?: string;
  /** Optional inline error from the form. */
  error?: string;
  /** Optional helper text under the textarea. */
  hint?: string;
  /** Disable the field (e.g. while submitting). */
  disabled?: boolean;
  /** Tailwind additions. */
  className?: string;
  /** data-testid override. */
  testId?: string;
  /** Optional a11y label override. */
  ariaLabel?: string;
}

export function CaptionField({
  label,
  name,
  id,
  value,
  onChange,
  placeholder = "What do you want to say?",
  error,
  hint,
  disabled,
  className,
  testId = "caption-field",
  ariaLabel,
}: CaptionFieldProps) {
  const locale = useLocaleCode();
  const len = value.length;
  const overWarn = len >= CAPTION_WARN;
  const atMax = len >= CAPTION_MAX;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-body text-fg-primary font-semibold">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        maxLength={CAPTION_MAX}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel ?? label}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={cn(
          error ? `${id}-error ` : "",
          hint ? `${id}-hint ` : "",
          `${id}-counter`,
        ).trim()}
        data-testid={testId}
        className={cn(
          "border-border bg-surface text-fg-primary text-body placeholder:text-fg-muted focus-visible:ring-focus-ring w-full resize-y rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none",
          error && "border-danger focus-visible:ring-danger",
        )}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          {hint ? (
            <p id={`${id}-hint`} className="text-label text-fg-muted">
              {hint}
            </p>
          ) : null}
          {error ? (
            <p id={`${id}-error`} role="alert" className="text-label text-danger font-semibold">
              {error}
            </p>
          ) : null}
        </div>
        <p
          id={`${id}-counter`}
          aria-live="polite"
          data-testid={`${testId}-counter`}
          className={cn(
            "text-label text-fg-muted shrink-0 text-end font-mono tabular-nums",
            overWarn && !atMax && "text-warning",
            atMax && "text-danger font-semibold",
          )}
        >
          {formatNumber(len, locale)} / {formatNumber(CAPTION_MAX, locale)}
        </p>
      </div>
    </div>
  );
}

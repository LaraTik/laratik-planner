"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * HashtagEditor — chip-style composer for the post's hashtags.
 *
 * Plan §3: the audience-facing hashtags are editable in three
 * places (Format-Aware Content Editor, Messages tab,
 * PublishPackageForm). Lifting them into a single component
 * gives the user a consistent UX and a single place to evolve
 * the chip semantics (e.g. adding an autocomplete from a
 * recent-tag list).
 *
 * Cap matches the schema: 30 tags, each ≤ 60 chars
 * (`src/lib/format-payload/schemas.ts:84`). Tags are
 * normalized: trimmed, leading `#` stripped, lowercased
 * NOT applied (the user may want #SpringDrop with that
 * casing).
 */
export const HASHTAG_MAX = 30;
export const HASHTAG_TAG_MAX = 60;

export interface HashtagEditorProps {
  label: string;
  id: string;
  name: string;
  value: string[];
  onChange: (next: string[]) => void;
  /** Optional helper text under the input. */
  hint?: string;
  /** Optional inline error from the form. */
  error?: string;
  disabled?: boolean;
  className?: string;
  testId?: string;
}

export function HashtagEditor({
  label,
  id,
  name,
  value,
  onChange,
  hint,
  error,
  disabled,
  className,
  testId = "hashtag-editor",
}: HashtagEditorProps) {
  const [draft, setDraft] = React.useState("");
  const [warning, setWarning] = React.useState<string | null>(null);
  const atMax = value.length >= HASHTAG_MAX;

  function commit(raw: string) {
    const cleaned = raw.trim().replace(/^#+/, "").slice(0, HASHTAG_TAG_MAX);
    if (!cleaned) return;
    if (atMax) {
      setWarning(`Up to ${HASHTAG_MAX} hashtags.`);
      return;
    }
    if (value.includes(cleaned)) {
      setWarning("That hashtag is already on the list.");
      return;
    }
    onChange([...value, cleaned]);
    setDraft("");
    setWarning(null);
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      // Backspace on an empty input pops the last chip —
      // standard chip-editor UX.
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-body text-fg-primary font-semibold">
        {label}
      </label>
      <div
        className={cn(
          "border-border bg-surface flex flex-wrap items-center gap-1.5 rounded-[var(--radius-control)] border px-2 py-1.5",
          "focus-within:ring-focus-ring focus-within:ring-2 focus-within:ring-offset-1",
          error && "border-danger focus-within:ring-danger",
        )}
        data-testid={testId}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="border-border bg-surface-container text-label text-fg-primary inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
            data-testid={`${testId}-chip`}
          >
            <span aria-hidden="true">#</span>
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              disabled={disabled}
              aria-label={`Remove ${tag}`}
              className="text-fg-muted hover:text-danger focus-visible:ring-focus-ring rounded-full p-0.5 focus:outline-none focus-visible:ring-2"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setWarning(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (draft.trim()) commit(draft);
          }}
          disabled={disabled}
          placeholder={
            value.length === 0
              ? "spring drop, sale, brandvoice (Enter to add)"
              : atMax
                ? `Maximum ${HASHTAG_MAX} hashtags`
                : "Add another…"
          }
          aria-label={label}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={
            cn(error ? `${id}-error ` : "", hint ? `${id}-hint ` : "").trim() || undefined
          }
          className="text-body text-fg-primary placeholder:text-fg-muted min-w-[10ch] flex-1 bg-transparent focus:outline-none"
          data-testid={`${testId}-input`}
        />
        {/* Hidden field so the form's FormData carries the
            serialised list even when no chip has been added
            (the parent also has a hidden `formatPayload`
            field on the Messages tab — both stay in sync). */}
        <input type="hidden" name={name} value={value.join(" ")} />
      </div>
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
          {warning ? (
            <p className="text-label text-warning" role="status">
              {warning}
            </p>
          ) : null}
        </div>
        <p
          className="text-label text-fg-muted shrink-0 text-end font-mono tabular-nums"
          aria-live="polite"
          data-testid={`${testId}-counter`}
        >
          {value.length} / {HASHTAG_MAX}
        </p>
      </div>
    </div>
  );
}

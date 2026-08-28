"use client";

import * as React from "react";

import { detectDir } from "@/lib/i18n/dir";
import { resolveLocale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

import { Textarea } from "@/components/ui/textarea";

/**
 * A Textarea that auto-switches its `dir` attribute based on the
 * content of the field. The `dir` is *content direction*, not
 * document direction — a planner writing English inside an
 * Arabic-locale workspace still gets LTR alignment, caret
 * behaviour, and bidi punctuation in the input.
 *
 * The detection runs on every render against the *current* value
 * (controlled) or the field's *current* value (uncontrolled —
 * read via the ref). The recompute is cheap (64-char scan, see
 * `lib/i18n/dir.ts`) so it doesn't need `useDeferredValue`. The
 * default fallback is the workspace's preferred direction so an
 * empty field still flows the right way.
 *
 * Tailwind 4 + shadcn — the classNames use `text-start` /
 * `text-end` (logical properties) so the same component
 * mirrors correctly when the form is wrapped in an RTL context.
 */
export interface DirAwareTextareaProps extends Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "dir"
> {
  /** The active workspace / form locale. Drives the fallback dir. */
  locale?: string | undefined;
  /**
   * Optional override for the dir the textarea should use when
   * the field is empty. Default: derived from `locale` (or
   * `ltr` if no locale is given).
   */
  defaultDirFallback?: "ltr" | "rtl" | undefined;
}

export const DirAwareTextarea = React.forwardRef<HTMLTextAreaElement, DirAwareTextareaProps>(
  ({ locale, defaultDirFallback, value, defaultValue, onChange, className, ...props }, ref) => {
    // Resolve the workspace fallback dir. The locale is passed
    // in by the caller (the editor sets it from the active
    // agency / user locale); we don't read it from the URL.
    const fallback: "ltr" | "rtl" = defaultDirFallback ?? resolveLocale(locale).dir;

    // Read the *current* value. For controlled inputs use the
    // value prop; for uncontrolled, the uncontrolled value is
    // not directly readable here without an effect + state. We
    // bias toward the controlled path (the editor always passes
    // value) and fall back to the uncontrolled initial value
    // when value is undefined.
    const current =
      typeof value === "string" ? value : typeof defaultValue === "string" ? defaultValue : "";
    const dir = detectDir(current, fallback);

    return (
      <Textarea
        ref={ref}
        dir={dir}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        className={cn(
          // Logical properties: text-start/text-end align with
          // the input's own `dir` so the caret + scrollbar
          // mirror correctly when dir flips mid-keystroke.
          dir === "rtl" ? "text-end" : "text-start",
          className,
        )}
        {...props}
      />
    );
  },
);
DirAwareTextarea.displayName = "DirAwareTextarea";

/**
 * Single-line equivalent. Same auto-dir behaviour, no rows.
 */
export interface DirAwareInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "dir"
> {
  locale?: string | undefined;
  defaultDirFallback?: "ltr" | "rtl" | undefined;
}

export const DirAwareInput = React.forwardRef<HTMLInputElement, DirAwareInputProps>(
  ({ locale, defaultDirFallback, value, defaultValue, onChange, className, ...props }, ref) => {
    const fallback: "ltr" | "rtl" = defaultDirFallback ?? resolveLocale(locale).dir;
    const current =
      typeof value === "string" ? value : typeof defaultValue === "string" ? defaultValue : "";
    const dir = detectDir(current, fallback);

    return (
      <input
        ref={ref}
        dir={dir}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        className={cn(
          "border-border bg-surface text-body text-fg-primary flex h-10 w-full rounded-[var(--radius-control)] border px-3 py-2",
          "placeholder:text-fg-muted",
          "focus-visible:ring-focus-ring focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          dir === "rtl" ? "text-end" : "text-start",
          className,
        )}
        {...props}
      />
    );
  },
);
DirAwareInput.displayName = "DirAwareInput";

"use client";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * CharacterCountInput — Input or Textarea with a live character
 * counter and the correct a11y wiring for the count to be announced
 * alongside the field.
 *
 * Why a shared component: every brand-kit form has a maxLength and
 * the user has no idea they're close to the limit. The counter
 * ("120 / 280") is rendered in a muted style and switches to a
 * warning colour when the user is within 10% of the cap.
 *
 * Behaviour:
 *   - Controlled (`value`) and uncontrolled (`defaultValue`) modes
 *     both supported. Same as the underlying Input.
 *   - Counter is `aria-describedby`-linked so screen readers
 *     announce "120 of 280 characters" after the label.
 *   - No state-in-effect: the counter is derived from the value on
 *     every render.
 *
 * Round 5 (rebuild, 2026-08-26) — first introduced for the brand
 * kit rebuild. Lives in `components/workspace/` (not
 * `components/brand/`) so future surfaces (Channels, Settings,
 * Library) can adopt the same pattern.
 */
export interface CharacterCountInputProps {
  as?: "input" | "textarea";
  name: string;
  maxLength: number;
  value?: string;
  defaultValue?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  placeholder?: string;
  required?: boolean;
  rows?: number;
  className?: string;
  /** Accessible label id (provided by the wrapping FormField). */
  id?: string;
  /** Optional id used for the counter element (provided by the wrapping FormField). */
  "aria-describedby"?: string;
}

export function CharacterCountInput({
  as = "input",
  name,
  maxLength,
  value,
  defaultValue,
  onChange,
  placeholder,
  required,
  rows = 3,
  className,
  id,
  ...rest
}: CharacterCountInputProps) {
  // For controlled mode, read from value; for uncontrolled, the
  // browser's input is the source of truth (the counter is only
  // visible on user interaction in that case — we still want a
  // counter for the "0 of N" baseline).
  const currentValue = value ?? defaultValue ?? "";
  const count = currentValue.length;
  const warning = count >= maxLength * 0.9;
  const exceeded = count > maxLength;
  const counterId = id ? `${id}-counter` : `${name}-counter`;

  const counterClass = cn(
    "text-label tabular-nums",
    exceeded
      ? "text-danger font-semibold"
      : warning
        ? "text-warning font-semibold"
        : "text-fg-muted",
  );

  const counter = (
    <span id={counterId} className={counterClass} aria-live="polite">
      {count} / {maxLength}
    </span>
  );

  if (as === "textarea") {
    return (
      <div className="grid gap-1">
        <textarea
          id={id}
          name={name}
          required={required}
          maxLength={maxLength}
          rows={rows}
          placeholder={placeholder}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          aria-describedby={cn(rest["aria-describedby"], counterId).trim() || undefined}
          className={cn(
            "border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring block min-h-[44px] w-full rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none",
            className,
          )}
        />
        <div className="flex justify-end">{counter}</div>
      </div>
    );
  }

  return (
    <div className="grid gap-1">
      <Input
        id={id}
        name={name}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        aria-describedby={cn(rest["aria-describedby"], counterId).trim() || undefined}
        className={cn("min-h-[44px]", className)}
      />
      <div className="flex justify-end">{counter}</div>
    </div>
  );
}

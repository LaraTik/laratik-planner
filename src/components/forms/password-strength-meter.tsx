"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * 4-bar password strength meter. The qualitative score (`score` 0..4)
 * drives the bar fill; the colour tone (`tone`) drives the palette.
 *
 * The component is purely presentational — the parent owns the
 * strength calculation (`passwordStrength()` from
 * `@/lib/auth/user-create-command`) and decides whether the form
 * should block submission on a weak value. The meter itself
 * NEVER gates anything; the server is the source of truth.
 *
 * Accessibility:
 *  - `aria-live="polite"` on the label so screen readers announce
 *    the qualitative change ("Weak" → "Strong") without stealing
 *    focus.
 *  - The bar <span>s are `aria-hidden` — the label is the source
 *    of truth for AT users.
 *  - `data-strength` exposes the qualitative label to E2E
 *    selectors (e.g. `toHaveAttribute("data-strength", "Strong")`).
 */
export type PasswordStrengthTone = "empty" | "danger" | "warning" | "success";

export interface PasswordStrengthMeterProps {
  /** Qualitative score from `passwordStrength().score` (0..4). */
  score: 0 | 1 | 2 | 3 | 4;
  /** Qualitative tone from `passwordStrength().tone`. */
  tone: PasswordStrengthTone;
  /** Qualitative label from `passwordStrength().label`. */
  label: string;
  /** When provided, the bars use this id for the input's `aria-describedby`. */
  describedById?: string;
  /** Optional testid override (E2E selectors). */
  testId?: string;
}

const TONE_CLASS: Record<PasswordStrengthTone, string> = {
  empty: "bg-border",
  danger: "bg-danger",
  warning: "bg-warning",
  success: "bg-success",
};

export function PasswordStrengthMeter({
  score,
  tone,
  label,
  describedById,
  testId,
}: PasswordStrengthMeterProps) {
  const filled = Math.min(4, score);
  return (
    <div
      id={describedById}
      className="flex items-center gap-2"
      data-testid={testId}
      data-strength={label}
    >
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1 w-8 rounded-[var(--radius-control)] transition-colors duration-200",
              i < filled ? TONE_CLASS[tone] : TONE_CLASS.empty,
            )}
          />
        ))}
      </div>
      <span className="text-fg-muted text-label" aria-live="polite" aria-atomic="true">
        {label}
      </span>
    </div>
  );
}

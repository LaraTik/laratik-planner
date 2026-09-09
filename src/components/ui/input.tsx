import * as React from "react";
import { cn } from "@/lib/utils";

// Values such as email addresses, URLs, dates, and numbers are
// intrinsically LTR even when the surrounding interface is Arabic.
const INTRINSIC_LTR_INPUT_TYPES = new Set([
  "color",
  "date",
  "datetime-local",
  "email",
  "month",
  "number",
  "password",
  "range",
  "tel",
  "time",
  "url",
  "week",
]);

/**
 * shadcn/ui Input — 40px standard, 8px radius, accessible by default.
 * Text values use `dir="auto"` so names, labels, and other user-entered
 * copy follow their first strong character. Technical values keep LTR.
 */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, dir, ...props }, ref) => {
    return (
      <input
        type={type}
        dir={dir ?? (type && INTRINSIC_LTR_INPUT_TYPES.has(type) ? "ltr" : "auto")}
        className={cn(
          "border-border bg-surface text-body text-fg-primary flex h-10 w-full rounded-[var(--radius-control)] border px-3 py-2 text-start",
          "placeholder:text-fg-muted",
          "focus-visible:ring-focus-ring focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "file:text-body file:border-0 file:bg-transparent file:font-semibold",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Textarea — shadcn-style styled multi-line text input.
 * Re-uses the input classNames so the focus ring, error
 * border, and disabled state all match the single-line input.
 */
export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "border-border bg-surface text-fg-primary placeholder:text-fg-muted focus-visible:ring-focus-ring min-h-11 w-full rounded-[var(--radius-control)] border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

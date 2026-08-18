import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Input — 40px standard, 8px radius, accessible by default.
 */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "border-border bg-surface text-body text-fg-primary flex h-10 w-full rounded-[var(--radius-control)] border px-3 py-2",
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

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card — the base surface unit (master prompt §3 "Surfaces").
 *
 * Border + radius + padding are token-driven. All StudioFlow screens
 * that draw a bordered white card should use <Card> so the visual
 * language stays consistent. The card is responsive by default — the
 * default padding is 20px on mobile and 24px on >= sm.
 *
 * Variants:
 *   - default:   bordered white surface
 *   - subtle:    surface-subtle (used for nested groupings like board columns)
 *   - flat:      no border, surface background (for tightly nested content)
 *   - dashed:    dashed border for empty / drop zones
 */
const cardVariants = {
  default: "border border-border bg-surface",
  subtle: "border border-border bg-surface-subtle",
  flat: "bg-surface",
  dashed: "border border-dashed border-border bg-surface",
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof cardVariants;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingClasses = {
  none: "",
  sm: "p-3 sm:p-4",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-6",
} as const;

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant = "default", padding = "md", ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-[var(--radius-card)]",
        cardVariants[variant],
        paddingClasses[padding],
        className,
      )}
      {...props}
    />
  );
});

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: "between" | "start";
}

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(function CardHeader(
  { className, align = "between", ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "mb-3 flex flex-wrap items-center gap-2",
        align === "between" ? "justify-between" : "justify-start",
        className,
      )}
      {...props}
    />
  );
});

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(function CardTitle({ className, ...props }, ref) {
  return (
    <h2
      ref={ref}
      className={cn("text-title-card text-fg-primary font-semibold", className)}
      {...props}
    />
  );
});

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return <p ref={ref} className={cn("text-body text-fg-secondary mt-1", className)} {...props} />;
});

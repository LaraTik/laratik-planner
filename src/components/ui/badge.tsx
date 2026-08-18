import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Badge — pill-shaped status indicators.
 * Statuses follow the master prompt §3: status always uses text + icon, never
 * color alone. Pair the color with an icon and a text label.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-label font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-border bg-surface text-fg-primary",
        primary: "border-primary/20 bg-primary-subtle text-primary",
        success: "border-success/20 bg-success-subtle text-success",
        warning: "border-warning/20 bg-warning-subtle text-warning",
        danger: "border-danger/20 bg-danger-subtle text-danger",
        info: "border-info/20 bg-info-subtle text-info",
        outline: "border-border bg-transparent text-fg-secondary",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

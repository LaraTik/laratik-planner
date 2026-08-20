import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * IconTile — a square coloured tile that holds a single character or icon
 * (used for workspace avatars, user initials, etc.). Centralised so the
 * sizes, colours and radii stay consistent.
 */
export interface IconTileProps {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  tone?: "primary" | "neutral" | "active";
  /** Decorative — set to `false` when the content is meaningful (e.g. user initial). */
  "aria-hidden"?: boolean | "true" | "false";
  className?: string;
}

const sizeClasses = {
  sm: "h-8 w-8 text-label",
  md: "h-9 w-9 text-body",
  lg: "h-10 w-10 text-body",
} as const;

const toneClasses = {
  primary: "bg-primary-subtle text-primary",
  neutral: "border border-border bg-surface-subtle text-fg-primary",
  active: "bg-primary text-white",
} as const;

export function IconTile({
  children,
  size = "md",
  tone = "primary",
  className,
  ...props
}: IconTileProps) {
  return (
    <span
      {...props}
      className={cn(
        "flex items-center justify-center rounded-[var(--radius-control)] font-semibold",
        sizeClasses[size],
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

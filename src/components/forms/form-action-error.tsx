import * as React from "react";
import { cn } from "@/lib/utils";

export interface FormActionErrorProps {
  children: React.ReactNode;
  className?: string;
  /** Set only where the existing form contract explicitly uses polite announcements. */
  ariaLive?: "polite";
}

/** Shared accessible presentation for errors returned by a form action. */
export function FormActionError({ children, className, ariaLive }: FormActionErrorProps) {
  return (
    <p role="alert" aria-live={ariaLive} className={cn("text-label text-danger", className)}>
      {children}
    </p>
  );
}

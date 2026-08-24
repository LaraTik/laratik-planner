import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * PageHeader — the eyebrow + title + description + action block that opens
 * every screen. Replaces inline `<header>...title...{action}</header>`
 * patterns and the older `ScreenHeading` component. Wraps on small
 * viewports so the action button never overflows.
 *
 * Use this for top-level screen headers. For section headers inside a
 * card (e.g. "Recent items"), use `SectionHeader` instead.
 */
export interface PageHeaderProps {
  /** Small uppercase / muted label above the title (e.g. workspace name). */
  eyebrow?: string;
  /** Main title — 28/36 semibold per design tokens. Accepts a React
   *  node so the title row can host inline accents (e.g. a month
   *  selector pill, as in the Stitch Workspace Overview). */
  title: React.ReactNode;
  /** Supporting description — 14/21 secondary. */
  description?: React.ReactNode;
  /** Action area (Button group) — wraps below the title on mobile. */
  action?: React.ReactNode;
  /** Optional id for the title (useful for aria-labelledby on a parent section). */
  titleId?: string;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  titleId,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="text-label text-fg-muted">{eyebrow}</p> : null}
        <h1
          id={titleId}
          className="text-title-page text-fg-primary font-semibold text-balance break-words"
        >
          {title}
        </h1>
        {description ? (
          <p className="text-body text-fg-secondary mt-1 max-w-3xl text-pretty">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
          {action}
        </div>
      ) : null}
    </header>
  );
}

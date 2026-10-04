"use client";

/*
 * The blocker list is the only part of the publishing command center
 * that needs client state, so it lives in its own `"use client"` module
 * and the command center itself stays a Server Component.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocaleT } from "@/components/i18n/locale-provider";
import {
  isManualDispatchBlocker,
  readinessAnchorForPath as resolveReadinessAnchor,
} from "@/lib/publishing/blocker-targets";
import type { ReadinessIssue } from "@/lib/publishing/readiness";

/**
 * The blocker list, collapsed by default. It is the command center's
 * body rather than a separate full-width block, so the count appears
 * once and the list only costs space when there is something to do.
 *
 * Uncontrolled open state: the operator's toggle survives the
 * `router.refresh()` that follows a server action, which a
 * server-derived `open` attribute would not.
 */
export function PublishingBlockers({ issues }: { issues: ReadinessIssue[] }) {
  /*
   * Read the translator from the client locale context rather than
   * receiving it as a prop: a function cannot cross the Server →
   * Client boundary, and `rsc-translator-boundary.test.ts` enforces
   * that the command center (a Server Component) never serializes one
   * into here.
   */
  const t = useLocaleT();
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3" data-testid="publishing-command-center-blockers">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        aria-controls="publishing-blocker-list"
        className="text-label text-fg-primary focus-visible:ring-focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-1 font-semibold focus-visible:ring-2 focus-visible:outline-none"
      >
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
        {open
          ? t("contentDetail.publishReadiness.hideBlockers")
          : t("contentDetail.publishReadiness.viewAllBlockers")}
      </button>
      {open ? (
        <ul
          id="publishing-blocker-list"
          className="text-label mt-2 space-y-2"
          data-testid="publishing-blocker-list"
        >
          {issues.map((issue, index) => (
            <li key={`${issue.code}-${index}`} className="flex flex-wrap items-start gap-2">
              <span className="min-w-0 flex-1">
                {readinessIssueText(t, issue.code, issue.message)}
              </span>
              <BlockerFixAction issue={issue} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * One issue's fix affordance. A `manual` target has no control anywhere
 * in the product, so it renders an explicit state instead of a link that
 * would dead-end.
 */
function BlockerFixAction({ issue }: { issue: ReadinessIssue }) {
  const t = useLocaleT();
  const anchor = resolveReadinessAnchor(issue.path);
  const label = isManualDispatchBlocker(issue.path)
    ? t("contentDetail.publishReadiness.manualDispatch")
    : anchor === "#assets-versions"
      ? t("contentDetail.publishReadiness.fixInAssets")
      : anchor === "#workflow"
        ? t("contentDetail.publishReadiness.fixInWorkflow")
        : t("contentDetail.publishReadiness.fixInPackage");
  if (!anchor) {
    return (
      <span
        className="text-label text-fg-muted shrink-0 rounded-[var(--radius-control)] px-2 py-1"
        data-testid={`publishing-blocker-manual-${issue.code}`}
      >
        {label}
      </span>
    );
  }
  return (
    <a
      href={anchor}
      className="text-label text-primary shrink-0 rounded-[var(--radius-control)] px-2 py-1 font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
      data-testid={`publishing-blocker-fix-${issue.code}`}
    >
      {label}
    </a>
  );
}

/**
 * Resolve an issue's code through the catalog, falling back to the
 * service's own already-human message. The key check mirrors the form's
 * helper so an untranslated code never leaks a dotted key to the user.
 */
function readinessIssueText(
  t: (key: string, params?: Record<string, string | number>) => string,
  code: string,
  fallback: string,
): string {
  const key = `contentDetail.publishReadiness.${code}`;
  const localized = t(key);
  return localized.startsWith("contentDetail.publishReadiness.") ? fallback : localized;
}

import * as React from "react";
import { ExternalLink, Folder } from "lucide-react";
import type { BrandLinkedResourceRow } from "@/lib/brand/service";
import { safeHref } from "@/lib/utils/safe-href";
import { ArchiveWithUndo } from "./archive-with-undo";
import { archiveLinkedResourceAction, restoreLinkedResourceAction } from "./actions";
import { SectionEmptyState } from "@/components/workspace/section-empty-state";

/**
 * LinkedResourceList — the row-5 "Linked Resources" section.
 *
 * Round 4 adds:
 *   - A uniform `<EmptyState>` (replaces a `<p>No linked resources
 *     yet…</p>`).
 *   - `ArchiveWithUndo` for the destructive action.
 *   - `safeHref` defensive guard on the external link so a
 *     `javascript:` URL can never reach the rendered DOM. The Zod
 *     schema already enforces HTTPS, but defence in depth is cheap.
 *   - A `target="_blank" rel="noreferrer"` pair with an explicit
 *     `aria-label` on the link so screen readers announce both the
 *     resource name and the fact that it opens in a new tab.
 */
export interface LinkedResourceListProps {
  slug: string;
  canManage: boolean;
  resources: BrandLinkedResourceRow[];
  /**
   * Optional translator. When provided, the empty state title +
   * description render from `brandKit.empty.{linkedTitle,linkedDescription}`;
   * when omitted, the hard-coded English copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
}

const PROVIDER_LABEL: Record<string, string> = {
  google_drive: "Google Drive",
  figma: "Figma",
  canva: "Canva",
  dropbox: "Dropbox",
  other: "Other",
};

export function LinkedResourceList({ slug, canManage, resources, t }: LinkedResourceListProps) {
  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);
  if (resources.length === 0) {
    return (
      <SectionEmptyState
        icon={Folder}
        title={tr("brandKit.empty.linkedTitle", "No linked resources yet")}
        description={tr(
          "brandKit.empty.linkedDescription",
          "Link a Google Drive, Figma, Canva, or Dropbox library so the team knows where to source on-brand material.",
        )}
        testId="brand-kit-empty-linked"
      />
    );
  }
  return (
    <ul className="space-y-2" data-testid="brand-kit-linked-resources">
      {resources.map((resource) => {
        const provider = PROVIDER_LABEL[resource.provider] ?? "Other";
        const safe = safeHref(resource.url);
        return (
          <li
            key={resource.id}
            data-testid={`brand-linked-resource-${resource.id}`}
            className="bg-surface-subtle flex flex-col gap-1 rounded-[var(--radius-control)] p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-label text-fg-muted font-semibold tracking-wider uppercase">
                  {provider}
                </span>
                <a
                  href={safe.href}
                  target={safe.href.startsWith("http") ? "_blank" : undefined}
                  rel="noreferrer"
                  aria-label={`Open ${resource.name} on ${provider} in a new tab`}
                  data-testid={`brand-linked-resource-link-${resource.id}`}
                  data-warning={safe.warning || undefined}
                  className="text-body text-primary inline-flex items-center gap-1 font-semibold break-all hover:underline"
                >
                  {resource.name}
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </a>
              </div>
              {canManage ? (
                <ArchiveWithUndo
                  slug={slug}
                  id={resource.id}
                  label="linked resource"
                  name={resource.name}
                  archiveAction={archiveLinkedResourceAction}
                  restoreAction={restoreLinkedResourceAction}
                  data-testid={`brand-linked-resource-archive-${resource.id}`}
                />
              ) : null}
            </div>
            {resource.description ? (
              <p className="text-body text-fg-secondary whitespace-pre-line">
                {resource.description}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

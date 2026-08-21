"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Eye } from "lucide-react";
import { humanize } from "@/lib/content/status";

/**
 * DeliveryVersionList — the immutable history of past delivery
 * submissions, rendered above the submit form on the content
 * detail page.
 *
 * Extracted from the inlined `DeliveryRow` block in
 * `delivery-section.tsx`. The list takes pre-projected versions
 * (from the `listDeliveryVersionsForItem` server function) so the
 * client-safe redaction is enforced in the data layer, not in the
 * view. The component still applies a defensive fallback: when
 * `viewerIsClient` is true, the designer note and the submitter
 * name are never rendered regardless of what the server returns.
 */

export type DeliveryVersion = {
  id: string;
  versionNumber: number;
  description: string;
  designerNote: string | null;
  submittedAt: string;
  isFinalApproved: boolean;
  submittedBy: { id: string; name: string };
  links: {
    id: string;
    provider: string;
    label: string;
    url: string;
    isPreview: boolean;
  }[];
};

export interface DeliveryVersionListProps {
  versions: DeliveryVersion[];
  /**
   * When true, internal-only fields (designer note, submitter name)
   * are never rendered, even if the server projection forgot to
   * redact them.
   */
  viewerIsClient?: boolean;
}

export function DeliveryVersionList({
  versions,
  viewerIsClient = false,
}: DeliveryVersionListProps) {
  if (versions.length === 0) {
    return (
      <p className="text-body text-fg-muted italic" data-testid="delivery-version-list-empty">
        No deliveries yet.
      </p>
    );
  }

  return (
    <ul className="space-y-3" data-testid="delivery-version-list">
      {versions.map((d) => (
        <DeliveryRow key={d.id} delivery={d} viewerIsClient={viewerIsClient} />
      ))}
    </ul>
  );
}

function DeliveryRow({
  delivery,
  viewerIsClient,
}: {
  delivery: DeliveryVersion;
  viewerIsClient: boolean;
}) {
  const [expanded, setExpanded] = useState(delivery.isFinalApproved);
  const isV1 = delivery.versionNumber === 1;
  return (
    <li
      className="border-border bg-surface-subtle rounded-[var(--radius-control)] border"
      data-testid={`delivery-version-${delivery.versionNumber}`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="text-body text-fg-primary hover:bg-surface focus-visible:ring-focus-ring flex w-full items-center justify-between gap-2 rounded-[var(--radius-control)] px-3 py-2 text-left font-semibold focus:outline-none focus-visible:ring-2"
        data-testid={`delivery-version-toggle-${delivery.versionNumber}`}
      >
        <span className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="text-fg-secondary h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="text-fg-secondary h-4 w-4" aria-hidden="true" />
          )}
          V{delivery.versionNumber}
          <span className="text-fg-muted font-normal">— {delivery.description}</span>
          {delivery.isFinalApproved ? (
            <span className="text-label text-success ml-2 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold">
              Final approved
            </span>
          ) : null}
        </span>
        {!viewerIsClient && delivery.submittedBy.name ? (
          <span className="text-label text-fg-muted font-normal">
            {delivery.submittedBy.name} ·{" "}
            {new Date(delivery.submittedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        ) : (
          <span className="text-label text-fg-muted font-normal">
            {new Date(delivery.submittedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        )}
      </button>

      {expanded ? (
        <div className="border-border space-y-3 border-t px-3 pt-3 pb-3">
          {!viewerIsClient && delivery.designerNote ? (
            <p className="text-body text-fg-secondary whitespace-pre-wrap">
              <span className="text-label text-fg-muted block">Designer note</span>
              {delivery.designerNote}
            </p>
          ) : null}

          {delivery.links.length > 0 ? (
            <ul className="space-y-1.5" data-testid={`delivery-links-${delivery.versionNumber}`}>
              {delivery.links.map((l) => (
                <li
                  key={l.id}
                  className="text-body text-fg-primary flex flex-wrap items-center gap-2"
                >
                  <span className="text-label text-fg-muted bg-surface rounded-[var(--radius-control)] px-2 py-0.5 font-semibold">
                    {humanize(l.provider)}
                  </span>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline"
                  >
                    {l.label}
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                  {l.isPreview ? (
                    <span className="text-label text-fg-muted inline-flex items-center gap-1 font-semibold">
                      <Eye className="h-3 w-3" aria-hidden="true" /> Preview
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-fg-muted italic">No links on this version.</p>
          )}

          {!isV1 ? null : (
            <p className="text-label text-fg-muted">First delivery for this content item.</p>
          )}
        </div>
      ) : null}
    </li>
  );
}

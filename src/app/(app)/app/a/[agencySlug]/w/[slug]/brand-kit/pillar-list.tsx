import * as React from "react";
import { Tag } from "lucide-react";
import type { ContentPillarSummary } from "@/lib/brand/service";
import { ArchiveWithUndo } from "./archive-with-undo";
import { archivePillarAction, restorePillarAction } from "./actions";
import { SectionEmptyState } from "@/components/workspace/section-empty-state";

/**
 * PillarList — the brand-kit Pillars list (Phase 8 / C-5.4).
 *
 * Each row shows the pillar name + a small color chip + a one-
 * line description. The archive control is the same ArchiveWithUndo
 * used by the other brand-kit sections so a destructive action
 * always ships with a 5s Sonner undo toast.
 */
export interface PillarListProps {
  slug: string;
  canManage: boolean;
  pillars: ContentPillarSummary[];
  /**
   * Optional translator. When provided, the empty state title +
   * description render from `brandKit.empty.{pillarsTitle,pillarsDescription}`;
   * when omitted, the hard-coded English copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
}

export function PillarList({ slug, canManage, pillars, t }: PillarListProps) {
  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);
  if (pillars.length === 0) {
    return (
      <SectionEmptyState
        icon={Tag}
        title={tr("brandKit.empty.pillarsTitle", "No content pillars yet")}
        description={tr(
          "brandKit.empty.pillarsDescription",
          "Pillars are the recurring topics every plan and post should align to. The AI uses pillar names + blurbs as context for caption drafts.",
        )}
        testId="brand-kit-empty-pillars"
      />
    );
  }
  return (
    <ul className="divide-border divide-y" data-testid="brand-kit-pillars-list">
      {pillars.map((pillar) => (
        <li
          key={pillar.id}
          className="flex items-center justify-between gap-3 py-3"
          data-testid={`brand-pillar-${pillar.id}`}
        >
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {pillar.color ? (
              <span
                className="border-border h-5 w-5 shrink-0 rounded-full border"
                style={{ backgroundColor: pillar.color }}
                aria-hidden="true"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-body text-fg-primary font-semibold">{pillar.name}</p>
              {pillar.description ? (
                <p className="text-label text-fg-muted line-clamp-2">{pillar.description}</p>
              ) : null}
            </div>
          </div>
          {canManage ? (
            <ArchiveWithUndo
              slug={slug}
              id={pillar.id}
              label="pillar"
              name={pillar.name}
              archiveAction={archivePillarAction}
              restoreAction={restorePillarAction}
              data-testid={`brand-pillar-archive-${pillar.id}`}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

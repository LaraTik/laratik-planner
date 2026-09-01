import * as React from "react";
import type { BrandAssetRow } from "@/lib/brand/service";
import { getSignedDownloadUrl } from "@/lib/storage";
import { ArchiveWithUndo } from "./archive-with-undo";
import { archiveLogoAssetAction, restoreLogoAssetAction } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionEmptyState } from "@/components/workspace/section-empty-state";
import { ImageIcon } from "lucide-react";

/**
 * LogoGrid — the visual upgrade for the Logo Assets section.
 *
 * Round 4 (visual fidelity) replaces the previous vertical list of
 * 40×40 thumbnail rows with a 2-up (sm) / 3-up (lg) / 1-up (mobile)
 * grid of larger preview tiles. Each tile shows:
 *   - A 96×96 light-background preview of the logo (uploaded file
 *     or external URL), so the user can read the artwork at a
 *     glance.
 *   - The asset name, truncated to one line.
 *   - A small "Uploaded" / "External" / "Reference" badge so the
 *     source is unambiguous.
 *   - The archive-with-undo button, top-right of the tile.
 *
 * Why a grid: the Stitch design and the dominant brand-guide
 * reference (Frontify, Brandfolder) both show logos as a tile grid,
 * not a list. The grid is also more scannable — a workspace
 * manager looking for "the dark on transparent version" can compare
 * candidates at the same time instead of reading 40-pixel rows.
 *
 * The archive button keeps the same data-testid pattern as the
 * previous list so existing Playwright selectors continue to work.
 */
export interface LogoGridProps {
  slug: string;
  canManage: boolean;
  assets: BrandAssetRow[];
  /**
   * Optional translator. When provided, the empty state title +
   * description render from `brandKit.empty.{logosTitle,logosDescription}`;
   * when omitted, the hard-coded English copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
}

function sourceLabel(asset: BrandAssetRow): string {
  if (asset.storagePath) return "Uploaded";
  if (asset.externalUrl) return "External";
  return "Reference";
}

export function LogoGrid({ slug, canManage, assets, t }: LogoGridProps) {
  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);
  if (assets.length === 0) {
    return (
      <SectionEmptyState
        icon={ImageIcon}
        title={tr("brandKit.empty.logosTitle", "No logo assets yet")}
        description={tr(
          "brandKit.empty.logosDescription",
          "Upload a PNG, JPG, or SVG — or paste an external URL — so every planner, designer, and reviewer has the same starting point.",
        )}
        testId="brand-kit-empty-logo"
      />
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="brand-kit-logo-grid">
      {assets.map((asset) => {
        const previewSrc = asset.storagePath
          ? getSignedDownloadUrl(asset.storagePath)
          : asset.externalUrl;
        return (
          <li key={asset.id} data-testid={`brand-asset-${asset.id}`} className="flex">
            <Card padding="sm" className="bg-surface-subtle relative flex w-full flex-col gap-2">
              <div className="border-border bg-surface flex aspect-square w-full items-center justify-center overflow-hidden rounded-[var(--radius-control)] border">
                {previewSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewSrc} alt={asset.name} className="h-full w-full object-contain" />
                ) : (
                  <ImageIcon className="text-fg-muted h-10 w-10" aria-hidden="true" />
                )}
              </div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-body text-fg-primary truncate font-semibold">{asset.name}</p>
                  <Badge variant="outline" className="mt-1">
                    {sourceLabel(asset)}
                  </Badge>
                </div>
                {canManage ? (
                  <ArchiveWithUndo
                    slug={slug}
                    id={asset.id}
                    label="logo"
                    name={asset.name}
                    archiveAction={archiveLogoAssetAction}
                    restoreAction={restoreLogoAssetAction}
                    data-testid={`brand-asset-archive-${asset.id}`}
                  />
                ) : null}
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

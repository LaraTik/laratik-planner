import * as React from "react";
import type { BrandAssetRow } from "@/lib/brand/service";
import { ArchiveWithUndo } from "./archive-with-undo";
import { archiveColorAssetAction, restoreColorAssetAction } from "./actions";
import { CopyHexButton } from "./copy-hex-button";
import { Card } from "@/components/ui/card";
import { SectionEmptyState } from "@/components/workspace/section-empty-state";
import { Palette } from "lucide-react";

/**
 * ColorSwatchGrid — visual upgrade for the Color Palette section.
 *
 * Round 4 replaces the previous list of `[swatch] [name + hex]
 * [archive]` rows with a 2-up (sm) / 3-up (lg) grid of swatch tiles.
 * Each tile shows:
 *   - A 64px-tall full-width swatch in the brand colour.
 *   - The asset name (bold, truncate).
 *   - A click-to-copy hex pill (the most common action on a brand
 *     colour — designers grab the hex and paste it into Figma).
 *   - The archive-with-undo button on hover (and always on touch).
 *
 * Why a grid + copy button: a list of 20 rows is hard to scan when
 * the user is looking for "the right blue". A grid presents all the
 * colours at the same visual weight, and the inline copy button
 * turns the section into a working palette rather than a reference
 * card. The copy button also gives the page a clear "this is what
 * the colour is" affordance — the hex is always one click away.
 */
export interface ColorSwatchGridProps {
  slug: string;
  canManage: boolean;
  assets: BrandAssetRow[];
}

function readHex(asset: BrandAssetRow): string {
  const v = (asset.value ?? {}) as Record<string, unknown>;
  const candidate =
    (typeof v.hex === "string" && v.hex) ||
    (typeof v.color === "string" && v.color) ||
    (typeof v.value === "string" && v.value);
  if (candidate && /^#[0-9a-fA-F]{6}$/.test(candidate)) return candidate.toUpperCase();
  return "#E5E7EB";
}

export function ColorSwatchGrid({ slug, canManage, assets }: ColorSwatchGridProps) {
  if (assets.length === 0) {
    return (
      <SectionEmptyState
        icon={Palette}
        title="No color tokens yet"
        description="Add the brand's primary, secondary, and accent hexes. Designers and copywriters can grab the hex with one click."
        testId="brand-kit-empty-color"
      />
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2" data-testid="brand-kit-color-grid">
      {assets.map((asset) => {
        const hex = readHex(asset);
        return (
          <li key={asset.id} data-testid={`brand-color-${asset.id}`} className="flex">
            <Card padding="sm" className="bg-surface-subtle flex w-full flex-col gap-2">
              <div
                className="border-border h-16 w-full rounded-[var(--radius-control)] border"
                style={{ backgroundColor: hex }}
                aria-hidden="true"
              />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-body text-fg-primary truncate font-bold">{asset.name}</p>
                  <CopyHexButton hex={hex} className="mt-1" />
                </div>
                {canManage ? (
                  <ArchiveWithUndo
                    slug={slug}
                    id={asset.id}
                    label="color"
                    name={asset.name}
                    archiveAction={archiveColorAssetAction}
                    restoreAction={restoreColorAssetAction}
                    data-testid={`brand-color-archive-${asset.id}`}
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

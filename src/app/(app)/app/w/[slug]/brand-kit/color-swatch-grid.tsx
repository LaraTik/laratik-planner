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
 * Round 4 (rebuild) replaced the previous list of `[swatch] [name + hex]
 * [archive]` rows with a 2-up (sm) / 3-up (lg) grid of swatch tiles.
 *
 * Phase 8 (2026-08-28) groups the swatches by role (primary,
 * secondary, accent, neutral, plus an "Uncategorised" group for
 * legacy rows that pre-date the `color_role` column). Each group
 * has its own heading; within a group, the swatches render in the
 * same 2-up / 3-up grid. The grouping drives the colors page KPI
 * and the Brand Kit Health card coverage indicator.
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

type ColorRole = "primary" | "secondary" | "accent" | "neutral";

const ROLE_ORDER: ColorRole[] = ["primary", "secondary", "accent", "neutral"];

const ROLE_LABEL: Record<ColorRole, string> = {
  primary: "Primary",
  secondary: "Secondary",
  accent: "Accent",
  neutral: "Neutral",
};

const ROLE_DESCRIPTION: Record<ColorRole, string> = {
  primary: "The dominant brand colour (CTAs, headlines, hero panels).",
  secondary: "A supporting brand colour (sub-heads, badges, secondary surfaces).",
  accent: "A highlight colour (links, call-outs, hover states).",
  neutral: "Background, surface, and text gray.",
};

function readHex(asset: BrandAssetRow): string {
  const v = (asset.value ?? {}) as Record<string, unknown>;
  const candidate =
    (typeof v.hex === "string" && v.hex) ||
    (typeof v.color === "string" && v.color) ||
    (typeof v.value === "string" && v.value);
  if (candidate && /^#[0-9a-fA-F]{6}$/.test(candidate)) return candidate.toUpperCase();
  return "#E5E7EB";
}

/**
 * Read the color role from the column (preferred) or the jsonb value
 * (legacy fallback). Returns null when neither is set.
 */
function readRole(asset: BrandAssetRow): ColorRole | null {
  // The Drizzle row has the `colorRole` column from Phase 8.
  // We read it via the JSONB fallback for the older pre-Phase-8
  // rows that stored the role inside the `value` jsonb.
  const column = (asset as unknown as { colorRole?: unknown }).colorRole;
  if (typeof column === "string") {
    if (
      column === "primary" ||
      column === "secondary" ||
      column === "accent" ||
      column === "neutral"
    ) {
      return column;
    }
  }
  const v = (asset.value ?? {}) as Record<string, unknown>;
  const jsonb = v.role ?? v.colorRole;
  if (jsonb === "primary" || jsonb === "secondary" || jsonb === "accent" || jsonb === "neutral") {
    return jsonb;
  }
  return null;
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

  // Bucket the assets by role. The "uncategorised" group catches
  // legacy rows whose role was never set.
  const groups: Record<ColorRole, BrandAssetRow[]> = {
    primary: [],
    secondary: [],
    accent: [],
    neutral: [],
  };
  const ungrouped: BrandAssetRow[] = [];
  for (const asset of assets) {
    const role = readRole(asset);
    if (role) groups[role].push(asset);
    else ungrouped.push(asset);
  }

  return (
    <div className="space-y-6" data-testid="brand-kit-color-grid">
      {ROLE_ORDER.map((role) => {
        const items = groups[role];
        if (items.length === 0) return null;
        return (
          <ColorGroup
            key={role}
            role={role}
            label={ROLE_LABEL[role]}
            description={ROLE_DESCRIPTION[role]}
            items={items}
            slug={slug}
            canManage={canManage}
          />
        );
      })}
      {ungrouped.length > 0 ? (
        <ColorGroup
          role={null}
          label="Uncategorised"
          description="Older colors without a role. Edit each tile to assign a role."
          items={ungrouped}
          slug={slug}
          canManage={canManage}
        />
      ) : null}
    </div>
  );
}

function ColorGroup({
  role,
  label,
  description,
  items,
  slug,
  canManage,
}: {
  role: ColorRole | null;
  label: string;
  description: string;
  items: BrandAssetRow[];
  slug: string;
  canManage: boolean;
}) {
  return (
    <section
      className="space-y-2"
      aria-label={label}
      data-testid={role ? `brand-kit-color-group-${role}` : "brand-kit-color-group-uncategorised"}
    >
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
        <h3 className="text-section-title text-fg-primary font-semibold">{label}</h3>
        <span className="text-label text-fg-muted font-semibold">({items.length})</span>
        <p className="text-label text-fg-muted basis-full">{description}</p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((asset) => {
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
    </section>
  );
}

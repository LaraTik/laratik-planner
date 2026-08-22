import * as React from "react";
import type { BrandAssetRow } from "@/lib/brand/service";
import { ArchiveWithUndo } from "./archive-with-undo";
import { archiveFontAssetAction, restoreFontAssetAction } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { Type } from "lucide-react";

/**
 * TypographyCards — visual upgrade for the Typography section.
 *
 * Round 4 (visual fidelity) replaces the previous 2-up grid of
 * plain `<p>` samples with full-bleed cards that show:
 *   - The role badge ("Headline" / "Body" / "Accent" / "Mono") with
 *     a colour that matches the role's intent.
 *   - A two-line sample ("The quick brown fox…" + a 0-1 mix of
 *     numbers / capitals) rendered in the asset's actual family
 *     and weight, so the user sees the typography in use.
 *   - The asset name, family, and weight in a small caption row.
 *   - The archive-with-undo button, top-right.
 *
 * Why two samples: a single sentence doesn't show the font's
 * numerals or capital height, which is what designers compare
 * when picking a body face. The two-line sample is the same
 * "Hamburgefonts" pattern used by Google Fonts' specimen page.
 */
export interface TypographyCardsProps {
  slug: string;
  canManage: boolean;
  assets: BrandAssetRow[];
}

type Role = "headline" | "body" | "accent" | "mono";

function readTypography(asset: BrandAssetRow): {
  family: string;
  weight: number;
  role: Role;
} {
  const v = (asset.value ?? {}) as Record<string, unknown>;
  const family =
    (typeof v.family === "string" && v.family) || (typeof v.name === "string" && v.name) || "Inter";
  const weight =
    typeof v.weight === "number"
      ? v.weight
      : typeof v.weight === "string"
        ? Number(v.weight) || 400
        : 400;
  const role = (typeof v.role === "string" ? v.role.toLowerCase() : "body") as Role;
  return { family, weight, role };
}

const ROLE_VARIANT: Record<Role, "primary" | "info" | "warning" | "default"> = {
  headline: "primary",
  body: "default",
  accent: "warning",
  mono: "info",
};

const SAMPLE_TEXT_PRIMARY = "The quick brown fox jumps over the lazy dog";
const SAMPLE_TEXT_NUMERIC = "0123456789  $1,234.56  100%";

export function TypographyCards({ slug, canManage, assets }: TypographyCardsProps) {
  if (assets.length === 0) {
    return (
      <EmptyState
        icon={<Type className="h-7 w-7" aria-hidden="true" />}
        title="No fonts catalogued yet"
        description="Document the headline, body, and accent faces so designers ship in one voice. Each entry gets a live sample."
      />
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2" data-testid="brand-kit-typography-grid">
      {assets.map((asset) => {
        const { family, weight, role } = readTypography(asset);
        const sampleSize = role === "headline" ? 32 : role === "accent" ? 24 : 18;
        return (
          <li key={asset.id} data-testid={`brand-font-${asset.id}`} className="contents">
            <Card padding="md" className="bg-surface-subtle flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <p className="text-body text-fg-primary truncate font-semibold">{asset.name}</p>
                  <p className="text-label text-fg-muted">
                    {family} · {weight}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={ROLE_VARIANT[role]} className="capitalize">
                    {role}
                  </Badge>
                  {canManage ? (
                    <ArchiveWithUndo
                      slug={slug}
                      id={asset.id}
                      label="font"
                      name={asset.name}
                      archiveAction={archiveFontAssetAction}
                      restoreAction={restoreFontAssetAction}
                      data-testid={`brand-font-archive-${asset.id}`}
                    />
                  ) : null}
                </div>
              </div>
              <div
                className="border-border bg-surface rounded-[var(--radius-control)] border p-3"
                style={{
                  fontFamily: `"${family}", system-ui, sans-serif`,
                  fontWeight: weight,
                }}
              >
                <p
                  className="text-fg-primary truncate"
                  style={{ fontSize: `${sampleSize}px`, lineHeight: 1.2 }}
                >
                  {SAMPLE_TEXT_PRIMARY}
                </p>
                <p
                  className="text-fg-secondary mt-1 truncate"
                  style={{ fontSize: `${Math.max(12, sampleSize - 8)}px`, lineHeight: 1.3 }}
                >
                  {SAMPLE_TEXT_NUMERIC}
                </p>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

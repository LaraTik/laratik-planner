import * as React from "react";
import { Clock, History, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import { cn } from "@/lib/utils";

/**
 * BrandIdentityHero — the row-1 "Brand identity" card on the brand-kit
 * page. Round 4 (visual fidelity) replaces the previous static `Palette`
 * icon placeholder with a real logo preview: if the workspace has at
 * least one logo asset, the hero shows a 96×96 square render of the
 * most recent logo; otherwise it falls back to a 1-letter monogram
 * derived from the workspace name so the card never looks broken.
 *
 * Round 5 (rebuild, 2026-08-26) — honesty pass:
 *   - Drops the meaningless "Primary Brand" badge. There is no
 *     `isPrimary` field on `brand_assets`; the badge was always shown
 *     and never gated. A "Latest logo" badge is shown when there is
 *     at least one logo, mirroring the actual selection logic.
 *   - Replaces the "Recently active" / "No activity yet" fake stat
 *     with a real CTA when the workspace has no assets yet (so new
 *     workspaces see a clear "Add your first asset" affordance).
 *   - Monogram is now Unicode-aware (`Array.from(name)[0]`) so a
 *     workspace called "Café" or "スタジオ" shows the correct letter
 *     instead of `"?"` or the leading non-ASCII byte.
 *
 * Accessibility:
 *   - The logo image is decorative (`alt=""`) because the workspace
 *     name is right next to it; the fallback monogram is wrapped in
 *     `aria-hidden` for the same reason.
 *   - The timezone pill is a real `<span>` with text, not a
 *     background-coloured `<div>`, so it is announced by screen
 *     readers.
 */
export interface BrandIdentityHeroProps {
  workspace: { name: string; timezone: string };
  logoSrc?: string | null;
  logoAlt?: string | undefined;
  assetCount: number;
  /** Number of logo assets in the workspace; gates the "Latest logo" badge. */
  logoCount: number;
  /** Most recent brand-kit update timestamp; null when the workspace has no activity. */
  lastUpdatedAt?: Date | null;
  /** Callback fired when the empty-state CTA is clicked. */
  onAddFirstAsset?: () => void;
}

function monogramOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  // Array.from splits by code points, not UTF-16 code units, so
  // a name like "Café" or "スタジオ" yields the first user-perceived
  // character instead of a lone surrogate or `?`.
  const first = Array.from(trimmed)[0] ?? "";
  return first.toUpperCase() || "?";
}

export function BrandIdentityHero({
  workspace,
  logoSrc,
  logoAlt,
  assetCount,
  logoCount,
  lastUpdatedAt,
  onAddFirstAsset,
}: BrandIdentityHeroProps) {
  return (
    <Card
      id="overview"
      className="scroll-mt-20 lg:col-span-12"
      aria-label="Brand identity"
      data-testid="brand-kit-hero"
    >
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        {logoSrc ? (
          <div
            className="border-border bg-surface-subtle flex h-24 w-24 shrink-0 items-center justify-center rounded-[var(--radius-control)] border p-2 sm:h-32 sm:w-32"
            aria-hidden="true"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoSrc}
              alt={logoAlt ?? ""}
              width={128}
              height={128}
              className="h-full w-full object-contain"
            />
          </div>
        ) : (
          <div
            className={cn(
              "border-border bg-primary-subtle text-primary flex h-24 w-24 shrink-0 items-center justify-center rounded-[var(--radius-control)] border text-[44px] font-bold sm:h-32 sm:w-32",
            )}
            aria-hidden="true"
          >
            {monogramOf(workspace.name)}
          </div>
        )}
        <div className="flex-1">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <CardTitle>{workspace.name}</CardTitle>
            <div className="flex flex-wrap gap-2">
              {logoCount > 0 ? (
                <Badge variant="primary" data-testid="brand-kit-hero-latest-logo">
                  Latest logo
                </Badge>
              ) : null}
              {assetCount > 0 ? (
                <Badge variant="outline">
                  {assetCount} {assetCount === 1 ? "asset" : "assets"}
                </Badge>
              ) : null}
            </div>
          </div>
          <p className="text-body text-fg-secondary mb-4 max-w-2xl">
            The shared source for visual assets and writing guidance. Update the logo, color
            palette, and typography so every planner, designer, and reviewer ships in one voice.
          </p>
          {assetCount === 0 ? (
            <div
              className="border-border bg-surface-subtle mb-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border border-dashed p-4"
              data-testid="brand-kit-hero-empty-cta"
            >
              <Sparkles className="text-primary h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-body text-fg-primary font-semibold">
                  No assets yet — start with a logo
                </p>
                <p className="text-label text-fg-muted">
                  The hero preview, the Add menu, and the brand identity card all show your first
                  logo once it is uploaded.
                </p>
              </div>
              {onAddFirstAsset ? (
                <Button type="button" size="sm" onClick={onAddFirstAsset} variant="default">
                  Add your first logo
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-6">
            <div className="flex flex-col gap-1">
              <span className="text-label text-fg-muted font-semibold tracking-wider uppercase">
                Timezone
              </span>
              <span className="text-body text-fg-primary inline-flex items-center gap-1 font-semibold">
                <Clock className="text-fg-muted h-4 w-4" aria-hidden="true" />
                {workspace.timezone}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-label text-fg-muted font-semibold tracking-wider uppercase">
                Last updated
              </span>
              {lastUpdatedAt ? (
                <span
                  className="text-body text-fg-primary inline-flex items-center gap-1 font-semibold"
                  data-testid="brand-kit-hero-last-updated"
                >
                  <History className="text-fg-muted h-4 w-4" aria-hidden="true" />
                  <time dateTime={lastUpdatedAt.toISOString()}>
                    {formatRelativeDate(lastUpdatedAt)}
                  </time>
                </span>
              ) : (
                <span
                  className="text-body text-fg-muted inline-flex items-center gap-1 font-semibold"
                  data-testid="brand-kit-hero-last-updated-empty"
                >
                  <History className="text-fg-muted h-4 w-4" aria-hidden="true" />
                  No activity yet
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Re-export the EmptyState so page.tsx can render section-level
 * empty states without importing from `components/feedback`. */
export { EmptyState };

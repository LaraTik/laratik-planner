import * as React from "react";
import { Clock, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { cn } from "@/lib/utils";

/**
 * BrandIdentityHero — the row-1 "Brand identity" card on the brand-kit
 * page. Round 4 (visual fidelity) replaces the previous static `Palette`
 * icon placeholder with a real logo preview: if the workspace has at
 * least one logo asset, the hero shows a 96×96 square render of the
 * most recent logo; otherwise it falls back to a 1-letter monogram
 * derived from the workspace name so the card never looks broken.
 *
 * Why a hero (not a section card): this is the first thing a user
 * sees on the brand kit. It needs to feel like a "cover" — the
 * workspace avatar, its display name, the timezone pill, and a
 * short positioning sentence. The previous implementation put a
 * `<Palette>` icon and the workspace name in a row with a "Primary
 * Brand" badge; the new version keeps that layout but elevates the
 * logo to the visual centre and tightens the spacing.
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
}

function monogramOf(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  return first || "?";
}

export function BrandIdentityHero({
  workspace,
  logoSrc,
  logoAlt,
  assetCount,
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
              <Badge variant="primary">Primary Brand</Badge>
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
              <span className="text-body text-fg-primary inline-flex items-center gap-1 font-semibold">
                <Globe className="text-fg-muted h-4 w-4" aria-hidden="true" />
                {assetCount > 0 ? "Recently active" : "No activity yet"}
              </span>
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

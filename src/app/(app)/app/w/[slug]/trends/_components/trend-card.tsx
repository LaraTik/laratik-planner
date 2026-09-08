"use client";

import { ArrowUpRight, FileText, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { getSourceDefinition } from "@/lib/trends/source-catalog";

type TrendSignal = {
  id: string;
  sourceKey: string;
  platform: string;
  label: string;
  sourceUrl: string | null;
  velocity: number;
  lifecycle: string;
  score: number;
  vertical: string[];
  fetchedAt: string;
};

/**
 * Single trend card. Renders:
 *   - The source label + lifecycle pill.
 *   - The trend label (testid `trend-label`).
 *   - Velocity + score chips.
 *   - "Use in brief" CTA + optional external link.
 *
 * The card is `data-platform` so the e2e suite can filter on it.
 */
export function TrendCard({
  signal,
  onUseInBrief,
}: {
  signal: TrendSignal;
  onUseInBrief: () => void;
}) {
  const t = useLocaleT();
  const def = getSourceDefinition(signal.sourceKey);
  const displayName = def?.displayName ?? signal.sourceKey;
  const primaryVertical = signal.vertical?.[0] ?? null;

  return (
    <article
      data-testid="trend-card"
      data-platform={signal.platform}
      data-source-key={signal.sourceKey}
      className="border-border bg-surface-card focus-within:ring-focus-ring flex h-full flex-col gap-3 rounded-[var(--radius-card)] border p-4 shadow-xs transition-shadow duration-200 focus-within:ring-2 hover:shadow-md"
    >
      <header className="flex items-center justify-between gap-2">
        <span className="text-label text-fg-muted font-semibold tracking-wide uppercase">
          {displayName}
        </span>
        <span
          className="border-border bg-surface-subtle text-fg-secondary rounded-full border px-2 py-0.5 text-xs"
          data-testid="trend-lifecycle"
        >
          {signal.lifecycle}
        </span>
      </header>

      <h3
        className="text-title-card text-fg-primary line-clamp-2 font-semibold"
        data-testid="trend-label"
      >
        {signal.label}
      </h3>

      <div className="text-label text-fg-muted flex flex-wrap items-center gap-2 text-xs">
        <span data-testid="trend-velocity">
          {t("trends.card.velocity", { value: signal.velocity.toFixed(2) }) ||
            `Velocity ${signal.velocity.toFixed(2)}`}
        </span>
        <span aria-hidden="true">·</span>
        <span data-testid="trend-score">
          {t("trends.card.score", { score: Math.round(signal.score * 100) }) ||
            `Score ${Math.round(signal.score * 100)}%`}
        </span>
        {primaryVertical ? (
          <>
            <span aria-hidden="true">·</span>
            <span data-testid="trend-vertical">{primaryVertical}</span>
          </>
        ) : null}
        {def?.tosClass === "grey" ? (
          <span
            className="text-warning flex items-center gap-1"
            data-testid="trend-tos-warning"
            title={t("trends.card.tosWarning") || "Unofficial source — ToS acknowledgement on file"}
          >
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            {t("trends.card.tosShort") || "TOS"}
          </span>
        ) : null}
      </div>

      <footer className="mt-auto flex items-center gap-2">
        <Button type="button" size="sm" onClick={onUseInBrief} data-testid="trend-use-in-brief">
          <FileText className="h-4 w-4" aria-hidden="true" />
          {t("trends.card.useInBrief") || "Use in brief"}
        </Button>
        {signal.sourceUrl ? (
          <Button asChild variant="ghost" size="sm">
            <a
              href={signal.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="trend-source-link"
            >
              {t("trends.card.openSource") || "Open source"}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </Button>
        ) : null}
      </footer>
    </article>
  );
}

"use client";

import * as React from "react";
import { ArrowUpRight, BookmarkPlus, Check, FileText, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { getSourceDefinition } from "@/lib/trends/source-catalog";
import { formatTrendFreshness, trendLifecycleMessageKey } from "@/lib/trends/presentation";

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
  sourceCount?: number;
};

type Board = { id: string; name: string; description: string | null };

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
  workspaceSlug,
  boards = [],
}: {
  signal: TrendSignal;
  onUseInBrief: () => void;
  workspaceSlug: string;
  boards?: Board[];
}) {
  const t = useLocaleT();
  const locale = typeof document !== "undefined" ? document.documentElement.lang || "en" : "en";
  const def = getSourceDefinition(signal.sourceKey);
  const displayName =
    t(`trends.sources.${signal.sourceKey}`) || def?.displayName || signal.sourceKey;
  const platformLabel = t(`trends.platforms.${signal.platform}`) || signal.platform;
  const primaryVertical = signal.vertical?.[0] ?? null;
  const lifecycle = t(trendLifecycleMessageKey(signal.lifecycle)) || signal.lifecycle;
  const [savingBoardId, setSavingBoardId] = React.useState<string | null>(null);
  const [savedBoardId, setSavedBoardId] = React.useState<string | null>(null);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);

  async function saveToBoard(board: Board) {
    setSavingBoardId(board.id);
    setSaveMessage(null);
    try {
      const response = await fetch("/api/trends/boards/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceSlug, boardId: board.id, signalId: signal.id }),
      });
      if (!response.ok) throw new Error("save_failed");
      setSavedBoardId(board.id);
      setSaveMessage(t("trends.card.saveSuccess", { board: board.name }));
    } catch {
      setSaveMessage(t("trends.card.saveError") || "Could not save this trend.");
    } finally {
      setSavingBoardId(null);
    }
  }

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
          {lifecycle}
        </span>
      </header>

      <h3
        className="text-title-card text-fg-primary line-clamp-2 font-semibold"
        data-testid="trend-label"
      >
        {signal.label}
      </h3>

      <div className="text-label text-fg-muted flex flex-wrap items-center gap-2 text-xs">
        <span
          className="border-primary-subtle bg-primary-subtle text-fg-primary rounded-full border px-2 py-0.5 font-semibold"
          data-testid="trend-fit"
        >
          {t("trends.card.fit", { score: Math.round(signal.score * 100) }) ||
            `Fit ${Math.round(signal.score * 100)}%`}
        </span>
        <span data-testid="trend-freshness">
          {t("trends.card.freshness", { value: formatTrendFreshness(signal.fetchedAt, locale) }) ||
            `Updated ${formatTrendFreshness(signal.fetchedAt, locale)}`}
        </span>
        <span aria-hidden="true">·</span>
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
            <span data-testid="trend-vertical">
              <bdi dir="auto">{t(`trends.verticals.${primaryVertical}`) || primaryVertical}</bdi>
            </span>
          </>
        ) : null}
        <span aria-hidden="true">·</span>
        <span data-testid="trend-platform">
          <bdi dir="auto">{platformLabel}</bdi>
        </span>
        <span aria-hidden="true">·</span>
        <span data-testid="trend-source-count">
          {t("trends.card.sourceCount", { count: signal.sourceCount ?? 1 }) ||
            `${signal.sourceCount ?? 1} sources`}
        </span>
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

      <p className="text-body text-fg-secondary line-clamp-2">
        {t("trends.card.whyFit", { reason: primaryVertical ?? displayName }) ||
          `Why this matters: ${primaryVertical ?? displayName}`}
      </p>

      {saveMessage ? (
        <p className="text-label text-success" role="status" aria-live="polite">
          {saveMessage}
        </p>
      ) : null}

      <footer className="mt-auto flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="min-h-11"
          onClick={onUseInBrief}
          data-testid="trend-use-in-brief"
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          {t("trends.card.useInBrief") || "Use in brief"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={boards.length === 0}
            >
              {savedBoardId ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
              )}
              {t("trends.card.save") || "Save to board"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {boards.length === 0 ? (
              <DropdownMenuItem disabled>
                {t("trends.card.saveNoBoards") || "Create a board first"}
              </DropdownMenuItem>
            ) : (
              boards.map((board) => (
                <DropdownMenuItem
                  key={board.id}
                  disabled={savingBoardId === board.id}
                  onSelect={() => void saveToBoard(board)}
                >
                  {savingBoardId === board.id ? t("trends.card.saving") || "Saving…" : board.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {signal.sourceUrl ? (
          <Button asChild variant="ghost" size="sm" className="min-h-11">
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

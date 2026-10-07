"use client";

import * as React from "react";
import Link from "next/link";
import { FileText, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TrendCard } from "./trend-card";
import { useLocaleT } from "@/components/i18n/locale-provider";

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

type Optout = {
  sourceKey: string;
  optedOutAt: string;
  reason: string | null;
};

/**
 * Explore-tab feed. Renders the trend cards, the empty state, and
 * the per-workspace opt-out badges.
 */
export function TrendFeed({
  workspaceSlug,
  signals,
  optouts,
  onUseInBrief,
  isEmpty,
  vertical,
  enabledSourceKeys: _enabledSourceKeys,
  boards = [],
}: {
  workspaceSlug: string;
  signals: TrendSignal[];
  optouts: Optout[];
  onUseInBrief: (trend: TrendSignal) => void;
  isEmpty: boolean;
  vertical: string;
  enabledSourceKeys: string[];
  boards?: Array<{ id: string; name: string; description: string | null }>;
}) {
  const t = useLocaleT();
  void _enabledSourceKeys;

  if (isEmpty) {
    return (
      <div data-testid="trends-feed" className="space-y-3">
        <div
          data-testid="trends-empty-state"
          role="status"
          className="border-border bg-surface-subtle rounded-[var(--radius-card)] border p-6 text-center sm:p-8"
        >
          <TrendingUp className="text-fg-muted mx-auto h-10 w-10" aria-hidden="true" />
          <h2 className="text-title-card text-fg-primary mt-3 font-semibold">
            {t("trends.empty.title") || "No trends yet"}
          </h2>
          <p className="text-body text-fg-secondary mx-auto mt-2 max-w-md">
            {t("trends.empty.body") ||
              "Once your sources sync, fresh signals appear here. Most sources run on a 6–24h cadence."}
          </p>
          {optouts.length > 0 ? (
            <div
              className="mt-4 flex flex-wrap justify-center gap-2"
              data-testid="trends-optout-badges"
              aria-label={t("trends.optoutBadge") || "Opted out sources"}
            >
              {optouts.map((o) => (
                <span
                  key={o.sourceKey}
                  data-testid={`trends-optout-badge-${o.sourceKey}`}
                  className="border-border bg-surface-subtle text-fg-secondary rounded-full border px-3 py-1 text-xs"
                >
                  {o.sourceKey} · {t("trends.optoutBadge") || "opted out"}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row sm:flex-wrap">
            <Button asChild variant="outline">
              <Link href="/app/agency-settings/trend-sources">
                {t("trends.empty.manageSources") || "Manage sources"}
              </Link>
            </Button>
            <Button asChild data-testid="trends-empty-create">
              <Link href={`/app/w/${workspaceSlug}/planning/new`}>
                <FileText className="h-4 w-4" aria-hidden="true" />
                {t("trends.empty.createBrief") || "Start a brief"}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const visibleSignals =
    vertical === "all" ? signals : signals.filter((signal) => signal.vertical.includes(vertical));

  return (
    <div data-testid="trends-feed" className="space-y-3">
      {optouts.length > 0 ? (
        <div
          className="flex flex-wrap gap-2"
          data-testid="trends-optout-badges"
          aria-label={t("trends.optoutBadge") || "Opted out sources"}
        >
          {optouts.map((o) => (
            <span
              key={o.sourceKey}
              data-testid={`trends-optout-badge-${o.sourceKey}`}
              className="border-border bg-surface-subtle text-fg-secondary rounded-full border px-3 py-1 text-xs"
            >
              {o.sourceKey} · {t("trends.optoutBadge") || "opted out"}
            </span>
          ))}
        </div>
      ) : null}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleSignals.map((signal) => (
          <li key={signal.id}>
            <TrendCard
              signal={signal}
              workspaceSlug={workspaceSlug}
              boards={boards}
              onUseInBrief={() => onUseInBrief(signal)}
            />
          </li>
        ))}
      </ul>
      {visibleSignals.length === 0 ? (
        <p className="text-body text-fg-secondary rounded-[var(--radius-card)] border p-6 text-center">
          {t("trends.filters.noMatches") || "No trends match this filter."}
        </p>
      ) : null}
    </div>
  );
}

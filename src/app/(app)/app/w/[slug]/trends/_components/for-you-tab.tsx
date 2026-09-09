"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { TrendCard } from "./trend-card";

/**
 * "For you" tab. v1 ships as a stable shell that will be filled in
 * once the Fit-score model is trained on real feedback events. The
 * empty state explains the current "training in progress" posture.
 */
type Signal = React.ComponentProps<typeof TrendCard>["signal"];

export function TrendsForYouTab({
  signals,
  onUseInBrief,
  workspaceSlug,
  boards = [],
}: {
  signals: Signal[];
  onUseInBrief: (signal: Signal) => void;
  workspaceSlug: string;
  boards?: Array<{ id: string; name: string; description: string | null }>;
}) {
  const t = useLocaleT();
  const ranked = [...signals]
    .sort((a, b) => b.score + b.velocity * 0.1 - (a.score + a.velocity * 0.1))
    .slice(0, 12);
  return (
    <div
      data-testid="trends-for-you"
      className="border-border bg-surface-subtle rounded-[var(--radius-card)] border p-8 text-center"
    >
      <Sparkles className="text-accent mx-auto h-10 w-10" aria-hidden="true" />
      <h2 className="text-title-card text-fg-primary mt-3 font-semibold">
        {t("trends.forYou.title") || "Personalized for you"}
      </h2>
      {ranked.length === 0 ? (
        <p className="text-body text-fg-secondary mx-auto mt-2 max-w-md">
          {t("trends.forYou.body") ||
            "Your highest-signal trends will appear here after the next source sync."}
        </p>
      ) : (
        <>
          <p className="text-body text-fg-secondary mx-auto mt-2 max-w-md">
            {t("trends.forYou.body") || "Ranked by current score and velocity for this workspace."}
          </p>
          <div className="mt-5 grid grid-cols-1 gap-3 text-start md:grid-cols-2 xl:grid-cols-3">
            {ranked.map((signal) => (
              <TrendCard
                key={signal.id}
                signal={signal}
                workspaceSlug={workspaceSlug}
                boards={boards}
                onUseInBrief={() => onUseInBrief(signal)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

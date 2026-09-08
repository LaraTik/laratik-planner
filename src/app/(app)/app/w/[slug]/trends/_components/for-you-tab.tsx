"use client";

import { Sparkles } from "lucide-react";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * "For you" tab. v1 ships as a stable shell that will be filled in
 * once the Fit-score model is trained on real feedback events. The
 * empty state explains the current "training in progress" posture.
 */
export function TrendsForYouTab() {
  const t = useLocaleT();
  return (
    <div
      data-testid="trends-for-you"
      className="border-border bg-surface-subtle rounded-[var(--radius-card)] border p-8 text-center"
    >
      <Sparkles className="text-accent mx-auto h-10 w-10" aria-hidden="true" />
      <h2 className="text-title-card text-fg-primary mt-3 font-semibold">
        {t("trends.forYou.title") || "Personalized for you"}
      </h2>
      <p className="text-body text-fg-secondary mx-auto mt-2 max-w-md">
        {t("trends.forYou.body") ||
          "Once you've saved a few trends to boards and used them in briefs, the Fit score will learn what you actually publish and surface the highest-signal matches here."}
      </p>
    </div>
  );
}

"use client";

import { FileText } from "lucide-react";
import { useLocaleT } from "@/components/i18n/locale-provider";

export function TrendsBriefsTab({ workspaceSlug: _workspaceSlug }: { workspaceSlug: string }) {
  void _workspaceSlug;
  const t = useLocaleT();
  return (
    <div
      data-testid="trends-briefs"
      className="border-border bg-surface-subtle rounded-[var(--radius-card)] border p-8 text-center"
    >
      <FileText className="text-fg-muted mx-auto h-10 w-10" aria-hidden="true" />
      <h2 className="text-title-card text-fg-primary mt-3 font-semibold">
        {t("trends.briefs.title") || "Closed-loop briefs"}
      </h2>
      <p className="text-body text-fg-secondary mx-auto mt-2 max-w-md">
        {t("trends.briefs.body") ||
          "Briefs that started from a trend, with their published performance, will appear here once you create one with 'Use in brief'."}
      </p>
    </div>
  );
}

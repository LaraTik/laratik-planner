"use client";

import { LayoutGrid } from "lucide-react";
import { useLocaleT } from "@/components/i18n/locale-provider";

export function TrendsBoardsTab({ workspaceSlug: _workspaceSlug }: { workspaceSlug: string }) {
  void _workspaceSlug;
  const t = useLocaleT();
  return (
    <div
      data-testid="trends-boards"
      className="border-border bg-surface-subtle rounded-[var(--radius-card)] border p-8 text-center"
    >
      <LayoutGrid className="text-fg-muted mx-auto h-10 w-10" aria-hidden="true" />
      <h2 className="text-title-card text-fg-primary mt-3 font-semibold">
        {t("trends.boards.title") || "Boards"}
      </h2>
      <p className="text-body text-fg-secondary mx-auto mt-2 max-w-md">
        {t("trends.boards.body") ||
          "Group trends into boards to plan campaigns, pitch ideas, and share with clients. Coming next sprint."}
      </p>
    </div>
  );
}

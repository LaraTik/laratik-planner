"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export type WorkspaceSocialRefreshAction = (
  slug: string,
) => Promise<{ error?: string; synced?: number; failed?: number }>;

type CommandCenterRefreshLabels = {
  refresh: string;
  refreshing: string;
  success: string;
  partial: string;
  error: string;
};

function countCopy(template: string, synced: number, failed: number): string {
  return template.replace("{synced}", String(synced)).replace("{failed}", String(failed));
}

export function CommandCenterRefresh({
  slug,
  labels,
  refreshAction,
}: {
  slug: string;
  labels: CommandCenterRefreshLabels;
  refreshAction: WorkspaceSocialRefreshAction;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function refresh() {
    setStatus(null);
    startTransition(async () => {
      const result = await refreshAction(slug);
      if ("error" in result && result.error) {
        setStatus(labels.error);
        return;
      }
      const synced = result.synced ?? 0;
      const failed = result.failed ?? 0;
      router.refresh();
      setStatus(
        failed > 0
          ? countCopy(labels.partial, synced, failed)
          : countCopy(labels.success, synced, failed),
      );
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={refresh}
        disabled={pending}
        aria-busy={pending}
        data-testid="command-center-refresh"
      >
        <RefreshCw className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
        {pending ? labels.refreshing : labels.refresh}
      </Button>
      {status ? (
        <span className="text-label text-fg-muted" role="status" aria-live="polite">
          {status}
        </span>
      ) : null}
    </div>
  );
}

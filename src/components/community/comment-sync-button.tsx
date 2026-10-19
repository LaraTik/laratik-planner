"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { classifyCommunitySyncResult } from "@/lib/community/sync-state";
import { Button } from "@/components/ui/button";
import { syncCommunityCommentsAction } from "@/lib/community/comment-sync-actions";

export function CommentSyncButton({
  agencySlug,
  workspaceSlug,
  canManage,
  available,
  unavailableLabel,
  label,
  pendingLabel,
  successLabel,
  failureLabel,
  partialLabel,
}: {
  agencySlug: string;
  workspaceSlug: string;
  canManage: boolean;
  available: boolean;
  unavailableLabel: string;
  label: string;
  pendingLabel: string;
  successLabel: string;
  failureLabel: string;
  partialLabel: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "success" | "partial" | "failure">("idle");
  const router = useRouter();
  return (
    <div className="flex max-w-full min-w-0 flex-col items-start gap-2">
      <Button
        type="button"
        variant="secondary"
        disabled={!canManage || !available || isPending}
        onClick={() => {
          setStatus("idle");
          startTransition(async () => {
            const result = await syncCommunityCommentsAction(agencySlug, workspaceSlug);
            setStatus(classifyCommunitySyncResult(result));
            if (result.ok) router.refresh();
          });
        }}
      >
        <RefreshCw className={isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
        {isPending ? pendingLabel : label}
      </Button>
      {!available ? <p className="text-label text-fg-muted max-w-xs">{unavailableLabel}</p> : null}
      {status === "success" ? <p className="text-label text-success">{successLabel}</p> : null}
      {status === "partial" ? (
        <p className="text-label text-warning" role="status">
          {partialLabel}
        </p>
      ) : null}
      {status === "failure" ? <p className="text-label text-danger">{failureLabel}</p> : null}
    </div>
  );
}

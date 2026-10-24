"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { classifyCommunitySyncResult } from "@/lib/community/sync-state";
import { Button } from "@/components/ui/button";
import { syncCommunityPrivateMessagesAction } from "@/lib/community/comment-sync-actions";

export function PrivateMessageSyncButton({
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
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "success" | "partial" | "failure">("idle");
  const router = useRouter();
  return (
    <div className="flex max-w-full min-w-0 flex-col items-start gap-2">
      <Button
        type="button"
        variant="secondary"
        disabled={!canManage || !available || pending}
        onClick={() => {
          setStatus("idle");
          startTransition(async () => {
            const result = await syncCommunityPrivateMessagesAction(agencySlug, workspaceSlug);
            setStatus(classifyCommunitySyncResult(result));
            if (result.ok) router.refresh();
          });
        }}
      >
        <RefreshCw className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
        {pending ? pendingLabel : label}
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

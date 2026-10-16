"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncCommunityCommentsAction } from "@/lib/community/comment-sync-actions";

export function CommentSyncButton({
  agencySlug,
  workspaceSlug,
  canManage,
  label,
  pendingLabel,
  successLabel,
  failureLabel,
}: {
  agencySlug: string;
  workspaceSlug: string;
  canManage: boolean;
  label: string;
  pendingLabel: string;
  successLabel: string;
  failureLabel: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "success" | "failure">("idle");
  const router = useRouter();
  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        variant="secondary"
        disabled={!canManage || isPending}
        onClick={() => {
          setStatus("idle");
          startTransition(async () => {
            const result = await syncCommunityCommentsAction(agencySlug, workspaceSlug);
            setStatus(result.ok ? "success" : "failure");
            if (result.ok) router.refresh();
          });
        }}
      >
        <RefreshCw className={isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
        {isPending ? pendingLabel : label}
      </Button>
      {status === "success" ? <p className="text-label text-success">{successLabel}</p> : null}
      {status === "failure" ? <p className="text-label text-danger">{failureLabel}</p> : null}
    </div>
  );
}

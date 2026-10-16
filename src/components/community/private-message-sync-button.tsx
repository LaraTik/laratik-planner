"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncCommunityPrivateMessagesAction } from "@/lib/community/comment-sync-actions";

export function PrivateMessageSyncButton({
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
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "success" | "failure">("idle");
  const router = useRouter();
  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        variant="secondary"
        disabled={!canManage || pending}
        onClick={() => {
          setStatus("idle");
          startTransition(async () => {
            const result = await syncCommunityPrivateMessagesAction(agencySlug, workspaceSlug);
            setStatus(result.ok ? "success" : "failure");
            if (result.ok) router.refresh();
          });
        }}
      >
        <RefreshCw className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
        {pending ? pendingLabel : label}
      </Button>
      {status === "success" ? <p className="text-label text-success">{successLabel}</p> : null}
      {status === "failure" ? <p className="text-label text-danger">{failureLabel}</p> : null}
    </div>
  );
}

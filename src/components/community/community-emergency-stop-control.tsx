"use client";

import { useState, useTransition } from "react";
import { PauseCircle, PlayCircle } from "lucide-react";
import { setCommunityEmergencyStopAction } from "@/lib/community/safety-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function CommunityEmergencyStopControl({
  agencySlug,
  workspaceSlug,
  emergencyStop,
  canManage,
  stopLabel,
  resumeLabel,
  stoppedLabel,
  runningLabel,
  stopTitle,
  stopDescription,
  resumeTitle,
  resumeDescription,
  confirmLabel,
  cancelLabel,
  closeLabel,
  successLabel,
  failureLabel,
}: {
  agencySlug: string;
  workspaceSlug: string;
  emergencyStop: boolean;
  canManage: boolean;
  stopLabel: string;
  resumeLabel: string;
  stoppedLabel: string;
  runningLabel: string;
  stopTitle: string;
  stopDescription: string;
  resumeTitle: string;
  resumeDescription: string;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  successLabel: string;
  failureLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<"success" | "failure" | null>(null);
  const [pending, startTransition] = useTransition();
  const nextEmergencyStop = !emergencyStop;

  function confirmChange() {
    setFeedback(null);
    startTransition(async () => {
      const result = await setCommunityEmergencyStopAction(
        agencySlug,
        workspaceSlug,
        nextEmergencyStop,
      );
      if (result.ok) {
        setFeedback("success");
        setOpen(false);
      } else {
        setFeedback("failure");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          className="text-body text-fg-primary font-medium"
          data-testid="community-emergency-stop-status"
        >
          {emergencyStop ? stoppedLabel : runningLabel}
        </p>
        {canManage ? (
          <Button
            type="button"
            variant={emergencyStop ? "default" : "destructive"}
            disabled={pending}
            data-testid="community-emergency-stop-toggle"
            onClick={() => setOpen(true)}
          >
            {emergencyStop ? (
              <PlayCircle className="h-4 w-4" aria-hidden="true" />
            ) : (
              <PauseCircle className="h-4 w-4" aria-hidden="true" />
            )}
            {emergencyStop ? resumeLabel : stopLabel}
          </Button>
        ) : null}
      </div>
      {feedback === "success" ? (
        <p className="text-label text-success" role="status">
          {successLabel}
        </p>
      ) : null}
      {feedback === "failure" ? (
        <p className="text-label text-danger" role="alert">
          {failureLabel}
        </p>
      ) : null}
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent closeAriaLabel={closeLabel} data-testid="community-emergency-stop-dialog">
          <DialogHeader>
            <DialogTitle>{nextEmergencyStop ? stopTitle : resumeTitle}</DialogTitle>
            <DialogDescription>
              {nextEmergencyStop ? stopDescription : resumeDescription}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={nextEmergencyStop ? "destructive" : "default"}
              disabled={pending}
              data-testid="community-emergency-stop-confirm"
              onClick={confirmChange}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

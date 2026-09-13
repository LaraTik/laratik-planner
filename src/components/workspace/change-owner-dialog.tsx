"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { changeContentOwnerAction } from "@/app/(app)/app/w/[slug]/planning/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { getErrorMessage } from "@/lib/utils/error";

export interface PlanningOwnerOption {
  id: string;
  label: string;
}

interface ChangeOwnerDialogProps {
  workspaceSlug: string;
  itemId: string;
  itemTitle: string;
  currentOwnerId: string | null;
  ownerOptions: PlanningOwnerOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangeOwnerDialog({
  workspaceSlug,
  itemId,
  itemTitle,
  currentOwnerId,
  ownerOptions,
  open,
  onOpenChange,
}: ChangeOwnerDialogProps) {
  const t = useLocaleT();
  const router = useRouter();
  const [draftOwnerId, setDraftOwnerId] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const selectedOwnerId = draftOwnerId ?? currentOwnerId ?? "";
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    t(key, params) === key ? fallback : t(key, params);

  function handleOpenChange(next: boolean) {
    if (!next) setDraftOwnerId(null);
    onOpenChange(next);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOwnerId || selectedOwnerId === currentOwnerId || pending) return;
    startTransition(async () => {
      try {
        const result = await changeContentOwnerAction({
          workspaceSlug,
          contentItemId: itemId,
          ownerId: selectedOwnerId,
        });
        if (!result.ok) {
          toast.error(tr("common.changeOwnerFailed", "Could not change the owner"), {
            description: result.error,
          });
          return;
        }
        toast.success(
          tr("common.changeOwnerSuccess", "Owner changed for {title}", { title: itemTitle }),
        );
        handleOpenChange(false);
        router.refresh();
      } catch (error) {
        toast.error(tr("common.changeOwnerFailed", "Could not change the owner"), {
          description: getErrorMessage(error),
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md" data-testid="change-owner-dialog">
        <DialogHeader>
          <DialogTitle>{tr("common.changeOwnerTitle", "Change owner")}</DialogTitle>
          <DialogDescription>
            {tr(
              "common.changeOwnerDescription",
              "Choose the person responsible for coordinating this content item.",
            )}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <label
              htmlFor={`change-owner-${itemId}`}
              className="text-body text-fg-primary block font-semibold"
            >
              {tr("common.changeOwnerLabel", "Owner")}
            </label>
            <select
              id={`change-owner-${itemId}`}
              value={selectedOwnerId}
              onChange={(event) => setDraftOwnerId(event.target.value)}
              className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring min-h-11 w-full rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:outline-none"
              data-testid="change-owner-select"
              autoFocus
              disabled={pending || ownerOptions.length === 0}
              required
            >
              <option value="" disabled>
                {tr("common.changeOwnerPlaceholder", "Select an owner")}
              </option>
              {ownerOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            {ownerOptions.length === 0 ? (
              <p className="text-label text-danger" role="alert">
                {tr("common.changeOwnerNoOptions", "No eligible workspace members are available.")}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              {tr("common.cancel", "Cancel")}
            </Button>
            <Button
              type="submit"
              disabled={
                pending ||
                !selectedOwnerId ||
                selectedOwnerId === currentOwnerId ||
                ownerOptions.length === 0
              }
              data-testid="change-owner-submit"
            >
              {pending ? tr("common.changeOwnerSaving", "Changing…") : tr("common.save", "Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function ArchiveSubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function TaskArchiveButton({
  action,
  label,
  title,
  description,
  cancelLabel,
  confirmLabel,
  pendingLabel,
  closeAriaLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  label: string;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  pendingLabel: string;
  closeAriaLabel: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
        <Archive className="h-4 w-4" aria-hidden="true" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeAriaLabel={closeAriaLabel} data-testid="task-archive-dialog">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <form action={action}>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                {cancelLabel}
              </Button>
              <ArchiveSubmitButton label={confirmLabel} pendingLabel={pendingLabel} />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

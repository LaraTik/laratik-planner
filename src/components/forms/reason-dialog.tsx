"use client";

import { useId, useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** Accessible replacement for browser prompt() in workflow mutations. */
export function ReasonDialog({
  trigger,
  title,
  description,
  label = "Reason",
  confirmLabel = "Confirm",
  destructive = false,
  disabled = false,
  onConfirm,
}: {
  trigger: ReactElement;
  title: string;
  description: string;
  label?: string;
  confirmLabel?: string;
  destructive?: boolean;
  disabled?: boolean;
  onConfirm: (value: string) => void | Promise<unknown>;
}) {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const trimmed = value.trim();
    if (!trimmed) {
      setError(`${label} is required.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(trimmed);
      setValue("");
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The action could not be completed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild disabled={disabled}>
        {trigger}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div>
            <label htmlFor={fieldId} className="text-body text-fg-primary mb-1 block font-semibold">
              {label}
            </label>
            <Textarea
              id={fieldId}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              rows={4}
              maxLength={2000}
              autoFocus
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
            />
            {error ? (
              <p id={errorId} role="alert" className="text-label text-danger mt-1">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={submitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={submitting}
            >
              {submitting ? "Working…" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

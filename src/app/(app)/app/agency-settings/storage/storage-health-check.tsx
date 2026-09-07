"use client";

import { useActionState } from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { testAgencyStorageAction, type AgencyStorageActionState } from "./actions";

export function StorageHealthCheck({
  label,
  pendingLabel,
  successMessage,
  errorMessage,
}: {
  label: string;
  pendingLabel: string;
  successMessage: string;
  errorMessage: string;
}) {
  const [state, action, pending] = useActionState<AgencyStorageActionState, FormData>(
    testAgencyStorageAction,
    {},
  );

  return (
    <div className="space-y-3">
      <form action={action}>
        <Button type="submit" variant="outline" disabled={pending} aria-busy={pending}>
          {pending ? pendingLabel : label}
        </Button>
      </form>
      {state.errorKey ? (
        <div
          className="border-danger/20 bg-danger-subtle text-danger flex items-start gap-2 rounded-[var(--radius-control)] border p-3 text-sm"
          role="alert"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      ) : null}
      {state.successKey ? (
        <div
          className="border-success/20 bg-success-subtle text-success flex items-start gap-2 rounded-[var(--radius-control)] border p-3 text-sm"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{successMessage}</span>
        </div>
      ) : null}
    </div>
  );
}

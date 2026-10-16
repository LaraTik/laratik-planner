"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { validateCommunityCapabilitiesAction } from "@/lib/community/capability-actions";
import { Button } from "@/components/ui/button";

export function CapabilityValidationButton({
  agencySlug,
  workspaceSlug,
  canManage,
  validateLabel,
  validatingLabel,
  successLabel,
  errorLabel,
}: {
  agencySlug: string;
  workspaceSlug: string;
  canManage: boolean;
  validateLabel: string;
  validatingLabel: string;
  successLabel: string;
  errorLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  function validate() {
    setMessage(null);
    setError(false);
    startTransition(async () => {
      const result = await validateCommunityCapabilitiesAction(agencySlug, workspaceSlug);
      if (!result.ok) {
        setError(true);
        setMessage(errorLabel);
        return;
      }
      setMessage(successLabel);
    });
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={!canManage || pending}
        onClick={validate}
        aria-busy={pending}
      >
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        {pending ? validatingLabel : validateLabel}
      </Button>
      {message ? (
        <p
          className={error ? "text-label text-danger" : "text-label text-success"}
          role={error ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

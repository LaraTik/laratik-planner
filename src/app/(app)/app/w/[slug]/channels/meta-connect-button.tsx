"use client";

import { useState, useTransition } from "react";
import { PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MetaConnectButton({
  slug,
  label,
  pendingLabel,
  errorLabel,
  testId,
}: {
  slug: string;
  label: string;
  pendingLabel: string;
  errorLabel: string;
  testId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function startConnection() {
    setError(false);
    startTransition(async () => {
      try {
        const response = await fetch("/api/social/meta/connect", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ slug }),
        });
        const result = (await response.json()) as { redirectUrl?: string };
        if (!response.ok || !result.redirectUrl) {
          setError(true);
          return;
        }
        window.location.assign(result.redirectUrl);
      } catch {
        setError(true);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        onClick={startConnection}
        disabled={pending}
        aria-busy={pending}
        data-testid={testId}
      >
        <PlugZap className="h-4 w-4" aria-hidden={true} /> {pending ? pendingLabel : label}
      </Button>
      {error ? (
        <p role="alert" className="text-label text-danger" data-testid="meta-connect-error">
          {errorLabel}
        </p>
      ) : null}
    </div>
  );
}

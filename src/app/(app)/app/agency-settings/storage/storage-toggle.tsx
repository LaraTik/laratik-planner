"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setAgencyStorageEnabledAction } from "./actions";

export function StorageToggle({
  enabled,
  label,
  pendingLabel,
}: {
  enabled: boolean;
  label: string;
  pendingLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      aria-busy={pending}
      onClick={() => startTransition(() => void setAgencyStorageEnabledAction(!enabled))}
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}

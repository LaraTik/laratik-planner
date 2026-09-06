"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setAgencyStorageEnabledAction } from "./actions";

export function StorageToggle({ enabled, label }: { enabled: boolean; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => startTransition(() => void setAgencyStorageEnabledAction(!enabled))}
    >
      {label}
    </Button>
  );
}

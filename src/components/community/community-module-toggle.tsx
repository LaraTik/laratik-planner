"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { toggleAgencyCommunityInbox, type CommunityToggleState } from "@/lib/community/actions";

const initialState: CommunityToggleState = {};

export function CommunityModuleToggle({
  enabled,
  enableLabel,
  disableLabel,
  errorLabel,
}: {
  enabled: boolean;
  enableLabel: string;
  disableLabel: string;
  errorLabel: string;
}) {
  const [state, action, pending] = useActionState(toggleAgencyCommunityInbox, initialState);
  const nextEnabled = !enabled;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="enabled" value={String(nextEnabled)} />
      <Button type="submit" variant={enabled ? "secondary" : "default"} disabled={pending}>
        {pending ? "…" : enabled ? disableLabel : enableLabel}
      </Button>
      {state.error ? (
        <p className="text-label text-danger" role="alert">
          {errorLabel}
        </p>
      ) : null}
    </form>
  );
}

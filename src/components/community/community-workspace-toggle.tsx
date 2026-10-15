"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { toggleWorkspaceCommunityInbox, type CommunityToggleState } from "@/lib/community/actions";

const initialState: CommunityToggleState = {};

export function CommunityWorkspaceToggle({
  agencySlug,
  workspaceSlug,
  basePath,
  label,
  errorLabel,
}: {
  agencySlug: string;
  workspaceSlug: string;
  basePath: string;
  label: string;
  errorLabel: string;
}) {
  const [state, action, pending] = useActionState(toggleWorkspaceCommunityInbox, initialState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="agencySlug" value={agencySlug} />
      <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
      <input type="hidden" name="basePath" value={basePath} />
      <input type="hidden" name="enabled" value="true" />
      <Button type="submit" disabled={pending}>
        {pending ? "…" : label}
      </Button>
      {state.error ? (
        <p className="text-label text-danger" role="alert">
          {errorLabel}
        </p>
      ) : null}
    </form>
  );
}

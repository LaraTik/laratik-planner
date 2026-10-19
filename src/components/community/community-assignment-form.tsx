"use client";

import { useState, useTransition } from "react";
import { UserRoundCheck } from "lucide-react";
import { assignCommunityConversationAction } from "@/lib/community/assignment-actions";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/forms/form-field";

export type CommunityAssigneeOption = { id: string; name: string };

export function CommunityAssignmentForm({
  agencySlug,
  workspaceSlug,
  conversationId,
  assignedTo,
  assignees,
  canAssign,
  label,
  unassignedLabel,
  saveLabel,
  savingLabel,
  savedLabel,
  failedLabel,
}: {
  agencySlug: string;
  workspaceSlug: string;
  conversationId: string;
  assignedTo: string | null;
  assignees: CommunityAssigneeOption[];
  canAssign: boolean;
  label: string;
  unassignedLabel: string;
  saveLabel: string;
  savingLabel: string;
  savedLabel: string;
  failedLabel: string;
}) {
  const [assigneeId, setAssigneeId] = useState(assignedTo ?? "");
  const [feedback, setFeedback] = useState<"saved" | "failed" | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setFeedback(null);
    startTransition(async () => {
      const result = await assignCommunityConversationAction(
        agencySlug,
        workspaceSlug,
        conversationId,
        assigneeId || null,
      );
      setFeedback(result.ok ? "saved" : "failed");
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <FormField
          id={`community-assignee-${conversationId}`}
          label={label}
          className="min-w-48 flex-1"
        >
          <select
            className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring min-h-11 w-full rounded-[var(--radius-control)] border px-3 focus:outline-none focus-visible:ring-2"
            value={assigneeId}
            disabled={!canAssign || pending}
            onChange={(event) => {
              setAssigneeId(event.target.value);
              setFeedback(null);
            }}
          >
            <option value="">{unassignedLabel}</option>
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.name}
              </option>
            ))}
          </select>
        </FormField>
        {canAssign ? (
          <Button
            type="button"
            variant="secondary"
            onClick={save}
            disabled={pending || assigneeId === (assignedTo ?? "")}
          >
            <UserRoundCheck className="h-4 w-4" aria-hidden="true" />
            {pending ? savingLabel : saveLabel}
          </Button>
        ) : null}
      </div>
      {feedback === "saved" ? (
        <p className="text-label text-success" role="status">
          {savedLabel}
        </p>
      ) : null}
      {feedback === "failed" ? (
        <p className="text-label text-danger" role="alert">
          {failedLabel}
        </p>
      ) : null}
    </div>
  );
}

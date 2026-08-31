"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Building2, CheckCircle2, Mail, RotateCcw, X } from "lucide-react";
import { resendInviteAction, revokeInviteAction } from "./actions";

type InvitationRow = {
  id: string;
  email: string;
  expiresAt: string;
  grantsAgencyAdmin: boolean;
  workspaceGrants: { workspaceId: string; workspaceName: string; role: string }[];
};

// Human-readable label for each role value. Mirrors the
// `WORKSPACE_ROLE_LABELS` map in
// `app/(app)/app/users/_components/workspace-role-matrix.tsx`.
// Kept in sync intentionally — duplicated here so the list
// view doesn't pull a server component into a client component.
const ROLE_LABEL: Record<string, string> = {
  workspace_manager: "Manager",
  content_planner: "Planner",
  designer: "Designer",
  internal_reviewer: "Internal reviewer",
  client_reviewer: "Client reviewer",
  publisher: "Publisher",
  viewer: "Viewer",
};

/**
 * Per-invitation actions (Resend / Revoke) are wired into a React
 * `useTransition`. The server action must NEVER throw — see
 * `actions.ts:InvitationActionState` — because a rejected promise
 * inside the transition replaces the whole page with the error
 * boundary. Instead, we surface the action's `{ error }` payload as
 * an inline alert next to the row that failed and clear any prior
 * success message for the row.
 */
export function InvitationList({ invitations }: { invitations: InvitationRow[] }) {
  const [pending, start] = useTransition();
  const [rowMessages, setRowMessages] = useState<
    Record<string, { kind: "error" | "success"; text: string }>
  >({});

  if (invitations.length === 0) {
    return <p className="text-body text-fg-muted">No pending invitations.</p>;
  }

  return (
    <ul className="divide-border divide-y" data-testid="users-invitation-list">
      {invitations.map((inv) => {
        const message = rowMessages[inv.id];
        return (
          <li key={inv.id} className="text-body flex flex-col gap-2 py-3">
            <div className="flex items-center gap-3">
              <Mail className="text-fg-muted h-4 w-4" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-fg-primary truncate font-semibold">{inv.email}</p>
                <p className="text-label text-fg-muted">Expires {inv.expiresAt}</p>
              </div>
              {inv.grantsAgencyAdmin ? <Badge variant="primary">Agency admin</Badge> : null}
              {inv.workspaceGrants.length === 0 ? (
                <Badge
                  variant="outline"
                  data-testid={`users-invitation-no-access-${inv.id}`}
                  title="On accept this person will be added to the agency but cannot access any workspace until you grant a role."
                >
                  No workspace access yet
                </Badge>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setRowMessages((m) => {
                    const next = { ...m };
                    delete next[inv.id];
                    return next;
                  });
                  start(async () => {
                    const result = await resendInviteAction(inv.id);
                    if (result.error) {
                      setRowMessages((m) => ({
                        ...m,
                        [inv.id]: { kind: "error", text: result.error! },
                      }));
                    } else {
                      setRowMessages((m) => ({
                        ...m,
                        [inv.id]: { kind: "success", text: "Invitation re-sent." },
                      }));
                    }
                  });
                }}
                data-testid={`users-invitation-resend-${inv.id}`}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Resend
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setRowMessages((m) => {
                    const next = { ...m };
                    delete next[inv.id];
                    return next;
                  });
                  start(async () => {
                    const result = await revokeInviteAction(inv.id);
                    if (result.error) {
                      setRowMessages((m) => ({
                        ...m,
                        [inv.id]: { kind: "error", text: result.error! },
                      }));
                    } else {
                      setRowMessages((m) => ({
                        ...m,
                        [inv.id]: { kind: "success", text: "Invitation revoked." },
                      }));
                    }
                  });
                }}
                aria-label={`Revoke invitation for ${inv.email}`}
                data-testid={`users-invitation-revoke-${inv.id}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Revoke
              </Button>
            </div>
            {inv.workspaceGrants.length > 0 ? (
              <ul
                className="text-label text-fg-secondary flex flex-wrap gap-x-3 gap-y-1 ps-7"
                data-testid={`users-invitation-grants-${inv.id}`}
              >
                {inv.workspaceGrants.map((g) => (
                  <li key={`${g.workspaceId}:${g.role}`} className="inline-flex items-center gap-1">
                    <Building2 className="h-3 w-3" aria-hidden="true" />
                    <span className="font-semibold">{g.workspaceName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{ROLE_LABEL[g.role] ?? g.role}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {message ? (
              <div
                role={message.kind === "error" ? "alert" : "status"}
                data-testid={`users-invitation-message-${inv.id}`}
                className={
                  message.kind === "error"
                    ? "border-danger/20 bg-danger-subtle text-danger text-label flex items-start gap-2 rounded-[var(--radius-control)] border p-2"
                    : "border-success/20 bg-success-subtle text-success text-label flex items-start gap-2 rounded-[var(--radius-control)] border p-2"
                }
              >
                {message.kind === "error" ? (
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>{message.text}</span>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

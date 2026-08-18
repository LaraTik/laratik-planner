"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, RotateCcw, X } from "lucide-react";
import { resendInviteAction, revokeInviteAction } from "./actions";

export function InvitationList({
  invitations,
}: {
  invitations: { id: string; email: string; expiresAt: string; grantsAgencyAdmin: boolean }[];
}) {
  const [pending, start] = useTransition();

  if (invitations.length === 0) {
    return <p className="text-body text-fg-muted">No pending invitations.</p>;
  }

  return (
    <ul className="divide-border divide-y">
      {invitations.map((inv) => (
        <li key={inv.id} className="text-body flex items-center gap-3 py-3">
          <Mail className="text-fg-muted h-4 w-4" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-fg-primary truncate font-semibold">{inv.email}</p>
            <p className="text-label text-fg-muted">Expires {inv.expiresAt}</p>
          </div>
          {inv.grantsAgencyAdmin ? <Badge variant="primary">Agency admin</Badge> : null}
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              start(async () => {
                await resendInviteAction(inv.id);
              });
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Resend
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              start(async () => {
                await revokeInviteAction(inv.id);
              });
            }}
            aria-label={`Revoke invitation for ${inv.email}`}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Revoke
          </Button>
        </li>
      ))}
    </ul>
  );
}

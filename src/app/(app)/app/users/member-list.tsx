"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, UserCheck, UserX } from "lucide-react";
import { toggleDeactivationAction } from "./actions";
import { MemberEditDrawer, type MemberEditWorkspace } from "./member-edit-drawer";

type MemberRow = {
  id: string;
  name: string;
  email: string;
  isAgencyAdmin: boolean;
  status: string;
  role: string;
  joinedAt: string;
};

export function MemberList({
  actorId,
  workspaces,
  rolesByUser,
  members,
}: {
  actorId: string;
  workspaces: { id: string; name: string }[];
  rolesByUser: Record<string, Record<string, string>>;
  members: MemberRow[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MemberRow | null>(null);

  if (members.length === 0) {
    return <p className="text-body text-fg-muted">No members yet.</p>;
  }

  // The drawer's per-workspace role pre-fill — the page pre-computed the
  // per-user map so the drawer can seed its initial state on open.
  const editingWorkspaces: MemberEditWorkspace[] = editing
    ? workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        currentRole: rolesByUser[editing.id]?.[w.id] ?? "",
      }))
    : [];

  return (
    <>
      {error ? (
        <p
          role="alert"
          className="bg-danger-subtle text-label text-danger mb-3 rounded-[var(--radius-control)] p-3 font-semibold"
        >
          {error}
        </p>
      ) : null}
      <ul className="divide-border divide-y" data-testid="users-member-list">
        {members.map((m) => {
          const active = m.status === "active";
          const canEdit = active; // deactivated members are not editable here
          return (
            <li key={m.id} className="text-body flex items-center gap-3 py-3">
              <div className="bg-surface-subtle text-fg-primary text-label flex h-8 w-8 items-center justify-center rounded-full font-semibold">
                {m.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-fg-primary truncate font-semibold">{m.name}</p>
                <p className="text-label text-fg-muted truncate">
                  {m.email} · joined {m.joinedAt}
                </p>
              </div>
              {m.isAgencyAdmin ? <Badge variant="primary">Admin</Badge> : null}
              <Badge variant={active ? "success" : "default"}>
                {active ? "Active" : "Deactivated"}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending || !canEdit}
                onClick={() => setEditing(m)}
                aria-label={`Edit ${m.name}`}
                data-testid={`users-member-edit-${m.id}`}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  start(async () => {
                    setError(null);
                    const result = await toggleDeactivationAction(m.id, active);
                    if ("error" in result && result.error) setError(result.error);
                  });
                }}
                aria-label={active ? `Deactivate ${m.name}` : `Reactivate ${m.name}`}
              >
                {active ? (
                  <>
                    <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                    Deactivate
                  </>
                ) : (
                  <>
                    <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Reactivate
                  </>
                )}
              </Button>
            </li>
          );
        })}
      </ul>
      <MemberEditDrawer
        subject={
          editing
            ? {
                id: editing.id,
                name: editing.name,
                email: editing.email,
                status: editing.status === "active" ? "active" : "deactivated",
                isAgencyAdmin: editing.isAgencyAdmin,
              }
            : null
        }
        actorIsAgencyAdmin
        actorUserId={actorId}
        workspaces={editingWorkspaces}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
    </>
  );
}

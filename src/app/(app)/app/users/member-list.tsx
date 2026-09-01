"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, UserCheck, UserX } from "lucide-react";
import { toggleDeactivationAction } from "./actions";
import { MemberEditDrawer, type MemberEditWorkspace } from "./member-edit-drawer";
import { useLocaleT } from "@/components/i18n/locale-provider";

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
  t: tProp,
}: {
  actorId: string;
  workspaces: { id: string; name: string }[];
  /**
   * Multi-role map. `rolesByUser[userId][workspaceId]` is the
   * full set of roles the user holds in that workspace. Empty
   * array (or missing key) means "no access".
   */
  rolesByUser: Record<string, Record<string, string[]>>;
  members: MemberRow[];
  t?: (key: string, params?: Record<string, string | number>) => string;
}) {
  const localeT = useLocaleT();
  const t = tProp ?? localeT;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MemberRow | null>(null);

  // The drawer's per-workspace role pre-fill — the page pre-computed the
  // per-user map so the drawer can seed its initial state on open.
  // Computed unconditionally (above the empty-state branch) so the
  // empty/populated transition is a *single* render path and any
  // future refactor that adds a hook here cannot accidentally move
  // it past an early return (the bug class the 2026-08-26
  // `users-hooks-order` regression guard was added to catch).
  // Multi-role: the page passes an array of roles per workspace.
  const editingWorkspaces: MemberEditWorkspace[] = editing
    ? workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        currentRoles: rolesByUser[editing.id]?.[w.id] ?? [],
      }))
    : [];

  // Drawer is mounted from the first render so an open-drawer
  // → empty-members → re-populated sequence does not unmount and
  // remount the Radix portal mid-edit. The form inside the drawer
  // remains key={subject.id} so a different member still remounts
  // it (clean state, fresh `seedGrants`).
  const editingSubject = editing
    ? {
        id: editing.id,
        name: editing.name,
        email: editing.email,
        status: editing.status === "active" ? ("active" as const) : ("deactivated" as const),
        isAgencyAdmin: editing.isAgencyAdmin,
      }
    : null;

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
      {members.length === 0 ? (
        <p className="text-body text-fg-muted" data-testid="users-empty-state">
          {t("users.memberList.empty")}
        </p>
      ) : (
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
                    {m.email} · {t("users.memberList.joined", { date: m.joinedAt })}
                  </p>
                </div>
                {m.isAgencyAdmin ? (
                  <Badge variant="primary">{t("users.memberList.admin")}</Badge>
                ) : null}
                <Badge variant={active ? "success" : "default"}>
                  {active ? t("users.memberList.active") : t("users.memberList.deactivated")}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending || !canEdit}
                  onClick={() => setEditing(m)}
                  aria-label={t("users.memberList.editAria", { name: m.name })}
                  data-testid={`users-member-edit-${m.id}`}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("users.memberList.edit")}
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
                  aria-label={
                    active
                      ? t("users.memberList.deactivateAria", { name: m.name })
                      : t("users.memberList.reactivateAria", { name: m.name })
                  }
                >
                  {active ? (
                    <>
                      <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("users.memberList.deactivate")}
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("users.memberList.reactivate")}
                    </>
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <MemberEditDrawer
        subject={editingSubject}
        actorIsAgencyAdmin
        actorUserId={actorId}
        workspaces={editingWorkspaces}
        t={t}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
    </>
  );
}

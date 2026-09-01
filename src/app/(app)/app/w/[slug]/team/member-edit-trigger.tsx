"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MemberEditDrawer,
  type MemberEditSubject,
  type MemberEditWorkspace,
} from "@/app/(app)/app/users/member-edit-drawer";

/**
 * Per-row Edit trigger for the workspace Team page. Each row owns its
 * own drawer instance (Radix Dialogs only mount their content when
 * open, so the cost is one portal + one hidden form per row).
 *
 * The drawer payload mirrors the Users-page payload exactly: all
 * agency workspaces + the target's current role in each, so the user
 * can adjust access in *any* workspace from here (not only the
 * workspace the team page is currently scoped to).
 */
export function MemberEditTrigger({
  member,
  actorId,
  actorIsAgencyAdmin,
  workspaces,
  t,
}: {
  member: { id: string; name: string; email: string; isAgencyAdmin: boolean };
  actorId: string;
  actorIsAgencyAdmin: boolean;
  workspaces: MemberEditWorkspace[];
  /**
   * Optional translator. When provided, the button's aria-label
   * and visible text render from the `users.memberList.edit*`
   * catalog keys; when omitted, the stored English copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [open, setOpen] = useState(false);
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : fallback;
  const subject: MemberEditSubject | null = open
    ? {
        id: member.id,
        name: member.name,
        email: member.email,
        // Team page only shows active members; the deactivation toggle
        // lives in the Users page so we hard-code "active" here.
        status: "active",
        isAgencyAdmin: member.isAgencyAdmin,
      }
    : null;
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-label={tr("users.memberList.editAria", `Edit ${member.name}`, { name: member.name })}
        data-testid={`team-member-edit-${member.id}`}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        {tr("users.memberList.edit", "Edit")}
      </Button>
      <MemberEditDrawer
        subject={subject}
        actorIsAgencyAdmin={actorIsAgencyAdmin}
        actorUserId={actorId}
        workspaces={workspaces}
        onOpenChange={setOpen}
        {...(t ? { t } : {})}
      />
    </>
  );
}

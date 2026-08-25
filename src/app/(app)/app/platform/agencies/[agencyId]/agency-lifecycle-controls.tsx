"use client";

import { Archive, ArchiveRestore, CirclePause, RotateCcw } from "lucide-react";
import { ReasonDialog } from "@/components/forms/reason-dialog";
import { PermissionNotice } from "@/components/platform/permission-notice";
import { Button } from "@/components/ui/button";
import { changeLifecycleAction } from "../actions";

type AgencyLifecycle = "active" | "suspended" | "archived";
type LifecycleAction = "suspend" | "restore" | "archive" | "unarchive";

export function AgencyLifecycleControls({
  agencyId,
  agencyName,
  lifecycle,
  canManageLifecycle,
  canArchive,
}: {
  agencyId: string;
  agencyName: string;
  lifecycle: AgencyLifecycle;
  canManageLifecycle: boolean;
  canArchive: boolean;
}) {
  async function submit(action: LifecycleAction, reason: string) {
    const formData = new FormData();
    formData.set("agencyId", agencyId);
    formData.set("action", action);
    formData.set("reason", reason);
    await changeLifecycleAction(formData);
  }

  if (!canManageLifecycle && !canArchive) {
    return (
      <PermissionNotice
        title="Lifecycle is read-only"
        description="Your platform role can inspect agency status but cannot change it."
      />
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2" data-testid="platform-agency-lifecycle-controls">
      <section className="border-border rounded-[var(--radius-control)] border p-4">
        <h3 className="text-body text-fg-primary font-semibold">Operational status</h3>
        <p className="text-label text-fg-secondary mt-1 mb-3">
          Suspension pauses normal agency activity without archiving the account.
        </p>
        {lifecycle === "archived" ? (
          <p className="text-body text-fg-muted">
            This agency is archived. Only a Platform Owner can unarchive it.
          </p>
        ) : canManageLifecycle ? (
          lifecycle === "active" ? (
            <ReasonDialog
              trigger={
                <Button type="button" variant="outline" size="lg">
                  <CirclePause className="h-4 w-4" aria-hidden="true" />
                  Suspend agency
                </Button>
              }
              title={`Suspend ${agencyName}?`}
              description="Members will temporarily lose normal agency access. Data and configuration remain intact."
              confirmLabel="Suspend agency"
              onConfirm={(reason) => submit("suspend", reason)}
            />
          ) : (
            <ReasonDialog
              trigger={
                <Button type="button" variant="outline" size="lg">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Restore agency
                </Button>
              }
              title={`Restore ${agencyName}?`}
              description="Normal agency access will resume. This action cannot unarchive an archived agency."
              confirmLabel="Restore agency"
              onConfirm={(reason) => submit("restore", reason)}
            />
          )
        ) : (
          <p className="text-body text-fg-muted">Your role cannot change operational status.</p>
        )}
      </section>

      <section className="border-danger/30 bg-danger-subtle rounded-[var(--radius-control)] border p-4">
        <h3 className="text-body text-fg-primary font-semibold">Archive boundary</h3>
        <p className="text-label text-fg-secondary mt-1 mb-3">
          Archiving and unarchiving are reserved for Platform Owners and always require a reason.
        </p>
        {canArchive ? (
          lifecycle === "archived" ? (
            <ReasonDialog
              trigger={
                <Button type="button" variant="outline" size="lg">
                  <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                  Unarchive agency
                </Button>
              }
              title={`Unarchive ${agencyName}?`}
              description="The agency will return in a restored state and normal access can resume."
              confirmLabel="Unarchive agency"
              onConfirm={(reason) => submit("unarchive", reason)}
            />
          ) : (
            <ReasonDialog
              trigger={
                <Button type="button" variant="destructive" size="lg">
                  <Archive className="h-4 w-4" aria-hidden="true" />
                  Archive agency
                </Button>
              }
              title={`Archive ${agencyName}?`}
              description="The agency will leave normal operations. Tenant data is preserved, and only a Platform Owner can reverse this action."
              confirmLabel="Archive agency"
              destructive
              onConfirm={(reason) => submit("archive", reason)}
            />
          )
        ) : (
          <p className="text-body text-fg-muted">Your role cannot archive this agency.</p>
        )}
      </section>
    </div>
  );
}

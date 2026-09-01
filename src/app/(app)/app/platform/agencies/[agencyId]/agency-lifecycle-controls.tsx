"use client";

import { Archive, ArchiveRestore, CirclePause, RotateCcw } from "lucide-react";
import { ReasonDialog } from "@/components/forms/reason-dialog";
import { PermissionNotice } from "@/components/platform/permission-notice";
import { Button } from "@/components/ui/button";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { changeLifecycleAction } from "../actions";

type AgencyLifecycle = "active" | "suspended" | "archived";
type LifecycleAction = "suspend" | "restore" | "archive" | "unarchive";

type Translator = (key: string, params?: Record<string, string | number>) => string;

const EN_FALLBACK: Translator = (key, params) => {
  const lookup: Record<string, string> = {
    "platform.lifecycleReadOnlyTitle": "Lifecycle is read-only",
    "platform.lifecycleReadOnlyBody":
      "Your platform role can inspect agency status but cannot change it.",
    "platform.lifecycleOperationalTitle": "Operational status",
    "platform.lifecycleOperationalBody":
      "Suspension pauses normal agency activity without archiving the account.",
    "platform.lifecycleArchivedHint":
      "This agency is archived. Only a Platform Owner can unarchive it.",
    "platform.lifecycleSuspend": "Suspend agency",
    "platform.lifecycleRestore": "Restore agency",
    "platform.lifecycleSuspendTitle": `Suspend ${params?.name ?? ""}?`,
    "platform.lifecycleRestoreTitle": `Restore ${params?.name ?? ""}?`,
    "platform.lifecycleSuspendBody":
      "Members will temporarily lose normal agency access. Data and configuration remain intact.",
    "platform.lifecycleRestoreBody":
      "Normal agency access will resume. This action cannot unarchive an archived agency.",
    "platform.lifecycleCannotChange": "Your role cannot change operational status.",
    "platform.lifecycleArchiveTitle": "Archive boundary",
    "platform.lifecycleArchiveBody":
      "Archiving and unarchiving are reserved for Platform Owners and always require a reason.",
    "platform.lifecycleUnarchive": "Unarchive agency",
    "platform.lifecycleArchive": "Archive agency",
    "platform.lifecycleUnarchiveTitle": `Unarchive ${params?.name ?? ""}?`,
    "platform.lifecycleArchiveTitleAction": `Archive ${params?.name ?? ""}?`,
    "platform.lifecycleUnarchiveBody":
      "The agency will return in a restored state and normal access can resume.",
    "platform.lifecycleArchiveBodyAction":
      "The agency will leave normal operations. Tenant data is preserved, and only a Platform Owner can reverse this action.",
    "platform.lifecycleCannotArchive": "Your role cannot archive this agency.",
    "common.dialogCloseAria": "Close",
  };
  return lookup[key] ?? key;
};

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
  const tr: Translator = useLocaleT() ?? EN_FALLBACK;
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
        title={tr("platform.lifecycleReadOnlyTitle")}
        description={tr("platform.lifecycleReadOnlyBody")}
      />
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2" data-testid="platform-agency-lifecycle-controls">
      <section className="border-border rounded-[var(--radius-control)] border p-4">
        <h3 className="text-body text-fg-primary font-semibold">
          {tr("platform.lifecycleOperationalTitle")}
        </h3>
        <p className="text-label text-fg-secondary mt-1 mb-3">
          {tr("platform.lifecycleOperationalBody")}
        </p>
        {lifecycle === "archived" ? (
          <p className="text-body text-fg-muted">{tr("platform.lifecycleArchivedHint")}</p>
        ) : canManageLifecycle ? (
          lifecycle === "active" ? (
            <ReasonDialog
              trigger={
                <Button type="button" variant="outline" size="lg">
                  <CirclePause className="h-4 w-4" aria-hidden="true" />
                  {tr("platform.lifecycleSuspend")}
                </Button>
              }
              title={tr("platform.lifecycleSuspendTitle", { name: agencyName })}
              description={tr("platform.lifecycleSuspendBody")}
              confirmLabel={tr("platform.lifecycleSuspend")}
              onConfirm={(reason) => submit("suspend", reason)}
              closeAriaLabel={tr("common.dialogCloseAria")}
            />
          ) : (
            <ReasonDialog
              trigger={
                <Button type="button" variant="outline" size="lg">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {tr("platform.lifecycleRestore")}
                </Button>
              }
              title={tr("platform.lifecycleRestoreTitle", { name: agencyName })}
              description={tr("platform.lifecycleRestoreBody")}
              confirmLabel={tr("platform.lifecycleRestore")}
              onConfirm={(reason) => submit("restore", reason)}
              closeAriaLabel={tr("common.dialogCloseAria")}
            />
          )
        ) : (
          <p className="text-body text-fg-muted">{tr("platform.lifecycleCannotChange")}</p>
        )}
      </section>

      <section className="border-danger/30 bg-danger-subtle rounded-[var(--radius-control)] border p-4">
        <h3 className="text-body text-fg-primary font-semibold">
          {tr("platform.lifecycleArchiveTitle")}
        </h3>
        <p className="text-label text-fg-secondary mt-1 mb-3">
          {tr("platform.lifecycleArchiveBody")}
        </p>
        {canArchive ? (
          lifecycle === "archived" ? (
            <ReasonDialog
              trigger={
                <Button type="button" variant="outline" size="lg">
                  <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                  {tr("platform.lifecycleUnarchive")}
                </Button>
              }
              title={tr("platform.lifecycleUnarchiveTitle", { name: agencyName })}
              description={tr("platform.lifecycleUnarchiveBody")}
              confirmLabel={tr("platform.lifecycleUnarchive")}
              onConfirm={(reason) => submit("unarchive", reason)}
              closeAriaLabel={tr("common.dialogCloseAria")}
            />
          ) : (
            <ReasonDialog
              trigger={
                <Button type="button" variant="destructive" size="lg">
                  <Archive className="h-4 w-4" aria-hidden="true" />
                  {tr("platform.lifecycleArchive")}
                </Button>
              }
              title={tr("platform.lifecycleArchiveTitleAction", { name: agencyName })}
              description={tr("platform.lifecycleArchiveBodyAction")}
              confirmLabel={tr("platform.lifecycleArchive")}
              destructive
              onConfirm={(reason) => submit("archive", reason)}
              closeAriaLabel={tr("common.dialogCloseAria")}
            />
          )
        ) : (
          <p className="text-body text-fg-muted">{tr("platform.lifecycleCannotArchive")}</p>
        )}
      </section>
    </div>
  );
}

import { Shield, UserPlus, UserX, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/workspace/page-header";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { EmptyState } from "@/components/feedback/empty-state";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import {
  listPlatformAdmins,
  listPlatformAdminAudit,
  type PlatformAdminRow,
  type PlatformAdminAuditRow,
} from "@/lib/platform/admins";
import { GrantPlatformAdminForm } from "./grant-form";
import { RevokePlatformAdminDialog } from "./revoke-dialog";

/**
 * Platform · Admins (superadmin-clarity).
 *
 * The "superadmin who controls agencies (not their workspaces)"
 * is a Platform Admin — a row in `platform_administrator` with
 * `revoked_at IS NULL`. This page is the only UI to grant or
 * revoke that role; the surrounding layout enforces the same
 * `requirePlatformAdmin` gate as the rest of `/app/platform/*`.
 *
 * Three blocks:
 *   1. **Current platform admins** — every live grant, with the
 *      grant timestamp and the grantor email. Each row has a
 *      "Revoke" button that opens a confirm dialog (requires a
 *      reason, refuses to revoke the last live admin).
 *   2. **Add platform admin** — form to grant a new admin by
 *      email. The user must already exist (have signed in at
 *      least once). The first-ever grant is intentionally NOT in
 *      the UI — it is the SQL escape hatch in
 *      `docs/agency-setup.md §3.2`.
 *   3. **Recent audit** — last 20 grant / revoke rows from
 *      `security_audit_events`. Newest first.
 */
export const metadata = { title: "Platform · Admins" };
export const dynamic = "force-dynamic";

export default async function PlatformAdminsPage() {
  const [admins, audit] = await Promise.all([listPlatformAdmins(), listPlatformAdminAudit(20)]);

  const adminColumns: DataTableColumnDef<PlatformAdminRow>[] = [
    {
      key: "user",
      header: "User",
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-body text-fg-primary font-semibold">{row.displayName || row.email}</p>
          <p className="text-label text-fg-muted truncate">{row.email}</p>
        </div>
      ),
    },
    {
      key: "grantedBy",
      header: "Granted by",
      cell: (row) => (
        <span className="text-body text-fg-secondary">{row.grantedByEmail ?? "—"}</span>
      ),
    },
    {
      key: "grantedAt",
      header: "Granted",
      cell: (row) => (
        <span className="text-body text-fg-secondary">{formatRelativeDate(row.grantedAt)}</span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      cell: (row) => (
        <span className="text-body text-fg-secondary line-clamp-2">{row.reason ?? "—"}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-12",
      cellClassName: "text-right",
      cell: (row) => <RevokePlatformAdminDialog userId={row.userId} email={row.email} />,
    },
  ];

  const auditColumns: DataTableColumnDef<PlatformAdminAuditRow>[] = [
    {
      key: "action",
      header: "Action",
      cell: (row) => (
        <span className="text-body text-fg-primary font-medium">
          {row.action === "platform_admin.grant" ? "Granted" : "Revoked"}
        </span>
      ),
    },
    {
      key: "target",
      header: "Target user",
      cell: (row) => (
        <span className="text-label text-fg-muted font-mono">{row.targetId ?? "—"}</span>
      ),
    },
    {
      key: "outcome",
      header: "Outcome",
      cell: (row) => (
        <Badge variant={row.outcome === "success" ? "success" : "warning"}>{row.outcome}</Badge>
      ),
    },
    {
      key: "when",
      header: "When",
      cell: (row) => (
        <span className="text-body text-fg-secondary">{formatRelativeDate(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6" data-testid="platform-admins-root">
      <PageHeader
        eyebrow="Platform"
        title="Admins"
        description="Grant or revoke the platform-admin role. The role is global — it controls agencies, not their content. Every change is audited."
        action={
          <Badge variant="info" className="inline-flex items-center gap-1">
            <Shield className="h-3 w-3" aria-hidden="true" />
            {admins.length} {admins.length === 1 ? "admin" : "admins"}
          </Badge>
        }
      />

      {admins.length <= 1 ? (
        <div
          className="border-warning/30 bg-warning-subtle text-body text-fg-secondary flex flex-wrap items-start gap-2 rounded-[var(--radius-control)] border p-3"
          data-testid="platform-admins-lockout-warning"
        >
          <AlertTriangle className="text-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            {admins.length === 0
              ? "No platform admins. Recover with the SQL fallback in docs/agency-setup.md §3.2."
              : "Only one platform admin — revoking yourself will lock the platform console. Grant the role to another user first."}
          </p>
        </div>
      ) : null}

      <Card padding="lg" className="space-y-4">
        <div className="flex items-center gap-2">
          <UserPlus className="text-primary h-5 w-5" aria-hidden="true" />
          <CardTitle>Add platform admin</CardTitle>
        </div>
        <CardDescription>
          The user must have signed in at least once. The role is granted on submit; the row stays
          live until it is explicitly revoked.
        </CardDescription>
        <GrantPlatformAdminForm />
      </Card>

      <Card padding="lg" className="space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="text-primary h-5 w-5" aria-hidden="true" />
          <CardTitle>Current platform admins</CardTitle>
        </div>
        <CardDescription>
          Every live grant. The grant timestamp and grantor are recorded for the audit trail.
        </CardDescription>
        <div className="mt-4">
          {admins.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="h-8 w-8" aria-hidden="true" />}
              title="No platform admins"
              description="Use the form above to grant the role. The first-ever grant requires the SQL fallback in docs/agency-setup.md §3.2."
              data-testid="platform-admins-empty"
            />
          ) : (
            <DataTable
              columns={adminColumns}
              rows={admins}
              getRowKey={(row) => row.userId}
              getRowTestId={(row) => `platform-admins-row-${row.userId}`}
              data-testid="platform-admins-table"
            />
          )}
        </div>
      </Card>

      <Card padding="lg" className="space-y-4">
        <div className="flex items-center gap-2">
          <UserX className="text-fg-secondary h-5 w-5" aria-hidden="true" />
          <CardTitle>Recent grants / revocations</CardTitle>
        </div>
        <CardDescription>
          The last 20 audit rows for platform-admin grant or revoke. Newest first.
        </CardDescription>
        <div className="mt-4">
          {audit.length === 0 ? (
            <EmptyState
              icon={<UserX className="h-8 w-8" aria-hidden="true" />}
              title="No grant or revoke activity yet"
              description="Future activity on this page will appear here."
              data-testid="platform-admins-audit-empty"
            />
          ) : (
            <DataTable
              columns={auditColumns}
              rows={audit}
              getRowKey={(row) => String(row.id)}
              data-testid="platform-admins-audit-table"
            />
          )}
        </div>
      </Card>
    </div>
  );
}

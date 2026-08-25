import Link from "next/link";
import {
  AlertTriangle,
  ClipboardCheck,
  Headphones,
  ShieldCheck,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import { PermissionNotice } from "@/components/platform/permission-notice";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { KpiTile } from "@/components/workspace/kpi-tile";
import { PageHeader } from "@/components/workspace/page-header";
import { currentActor } from "@/lib/auth/current-actor";
import { requirePlatformPermission } from "@/lib/auth/platform-access";
import { PLATFORM_ROLE_DETAILS, type PlatformRole } from "@/lib/auth/platform-access-types";
import {
  getPlatformSupportAccessSummary,
  listPlatformAccess,
  listPlatformAccessAudit,
  type PlatformAccessAuditRow,
  type PlatformAccessRow,
} from "@/lib/platform/access";
import { cn } from "@/lib/utils";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import { ChangePlatformRoleDialog } from "./change-role-dialog";
import { GrantPlatformAccessForm } from "./grant-form";
import { RevokePlatformAccessDialog } from "./revoke-dialog";

export const metadata = { title: "Platform · Access" };
export const dynamic = "force-dynamic";

const ROLE_BADGE_VARIANT: Record<PlatformRole, BadgeProps["variant"]> = {
  platform_owner: "primary",
  agency_operator: "info",
  platform_auditor: "outline",
  support_operator: "warning",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "platform_access.grant": "Access granted",
  "platform_access.role_change": "Role changed",
  "platform_access.revoke": "Access revoked",
};

export default async function PlatformAccessPage() {
  const actor = await currentActor();
  if (!actor) {
    return (
      <PermissionNotice title="Sign in required" description="Sign in to view platform access." />
    );
  }

  let principal;
  try {
    principal = await requirePlatformPermission(actor, "platform.access.read");
  } catch {
    return (
      <PermissionNotice
        title="Platform access unavailable"
        description="Your platform role does not include access oversight."
      />
    );
  }

  const canManage = principal.permissions.has("platform.access.manage");
  const [assignments, audit, supportSummary] = await Promise.all([
    listPlatformAccess(actor),
    listPlatformAccessAudit(actor, 20),
    getPlatformSupportAccessSummary(actor),
  ]);
  const ownerCount = assignments.filter((row) => row.role === "platform_owner").length;
  const operatorCount = assignments.filter(
    (row) => row.role === "agency_operator" || row.role === "support_operator",
  ).length;
  const targetLabels = new Map(assignments.map((row) => [row.userId, row.email]));

  const assignmentColumns: DataTableColumnDef<PlatformAccessRow>[] = [
    {
      key: "person",
      header: "Person",
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-body text-fg-primary font-semibold">{row.displayName || row.email}</p>
          <p className="text-label text-fg-muted max-w-52 truncate sm:max-w-none">{row.email}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (row) => (
        <Badge variant={ROLE_BADGE_VARIANT[row.role]}>
          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
          {PLATFORM_ROLE_DETAILS[row.role].label}
        </Badge>
      ),
    },
    {
      key: "scope",
      header: "Access boundary",
      hideOn: "lg",
      cell: (row) => (
        <span className="text-body text-fg-secondary">
          {PLATFORM_ROLE_DETAILS[row.role].description}
        </span>
      ),
    },
    {
      key: "changed",
      header: "Last changed",
      hideOn: "md",
      cell: (row) => (
        <div className="text-body text-fg-secondary">
          <p>{formatRelativeDate(row.updatedAt)}</p>
          <p className="text-label text-fg-muted">by {row.grantedByEmail ?? "bootstrap"}</p>
        </div>
      ),
    },
  ];

  if (canManage) {
    assignmentColumns.push({
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "w-24",
      cellClassName: "text-right",
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <ChangePlatformRoleDialog userId={row.userId} email={row.email} currentRole={row.role} />
          <RevokePlatformAccessDialog userId={row.userId} email={row.email} role={row.role} />
        </div>
      ),
    });
  }

  const auditColumns: DataTableColumnDef<PlatformAccessAuditRow>[] = [
    {
      key: "action",
      header: "Action",
      cell: (row) => (
        <span className="text-body text-fg-primary font-medium">
          {AUDIT_ACTION_LABELS[row.action] ?? row.action}
        </span>
      ),
    },
    {
      key: "target",
      header: "Person",
      cell: (row) => (
        <span className="text-body text-fg-secondary">
          {row.targetId ? (targetLabels.get(row.targetId) ?? "Former platform member") : "—"}
        </span>
      ),
    },
    {
      key: "outcome",
      header: "Outcome",
      hideOn: "sm",
      cell: (row) => (
        <Badge variant={row.outcome === "success" ? "success" : "warning"}>{row.outcome}</Badge>
      ),
    },
    {
      key: "when",
      header: "When",
      hideOn: "md",
      cell: (row) => (
        <span className="text-body text-fg-secondary">{formatRelativeDate(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6" data-testid="platform-access-root">
      <PageHeader
        eyebrow="Platform"
        title="Platform access"
        description="Assign operational responsibilities without granting tenant content. Support access remains ticketed, approved, time-limited, and separately audited."
        action={
          canManage ? (
            <Link
              href="#add-platform-member"
              className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Add platform member
            </Link>
          ) : undefined
        }
      />

      {!canManage ? (
        <PermissionNotice
          title="Read-only access oversight"
          description="You can review assignments and audit history. Only a Platform Owner can change access."
        />
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          icon={<Users className="h-4 w-4" aria-hidden="true" />}
          label="Active members"
          value={assignments.length}
          data-testid="platform-access-kpi-members"
        />
        <KpiTile
          icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
          label="Platform Owners"
          value={ownerCount}
          tone={ownerCount <= 1 ? "warning" : "default"}
          data-testid="platform-access-kpi-owners"
        />
        <KpiTile
          icon={<UserCog className="h-4 w-4" aria-hidden="true" />}
          label="Operators"
          value={operatorCount}
          data-testid="platform-access-kpi-operators"
        />
        <KpiTile
          icon={<Headphones className="h-4 w-4" aria-hidden="true" />}
          label={
            supportSummary.expiring > 0
              ? `Support grants · ${supportSummary.expiring} expiring soon`
              : "Active support grants"
          }
          value={supportSummary.active}
          tone={supportSummary.expiring > 0 ? "warning" : "default"}
          data-testid="platform-access-kpi-support"
        />
      </div>

      {ownerCount <= 1 ? (
        <div
          className="border-warning/40 bg-warning-subtle text-body text-fg-secondary flex items-start gap-3 rounded-[var(--radius-control)] border p-4"
          role="status"
          data-testid="platform-access-owner-warning"
        >
          <AlertTriangle className="text-warning mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>
            There is only one active Platform Owner. Add a second owner before changing or revoking
            this assignment. The server prevents removal of the final owner.
          </p>
        </div>
      ) : null}

      {canManage ? (
        <Card id="add-platform-member" padding="lg" className="scroll-mt-6 space-y-4">
          <div className="flex items-center gap-2">
            <UserPlus className="text-primary h-5 w-5" aria-hidden="true" />
            <CardTitle>Add platform member</CardTitle>
          </div>
          <CardDescription>
            The person must have signed in once. Choose the narrowest role that matches their
            responsibility; every change requires a reason and is audited.
          </CardDescription>
          <GrantPlatformAccessForm />
        </Card>
      ) : null}

      <Card padding="lg" className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-primary h-5 w-5" aria-hidden="true" />
          <CardTitle>Current assignments</CardTitle>
        </div>
        <CardDescription>
          Platform roles control the global console only. They do not make someone an agency or
          workspace member.
        </CardDescription>
        {assignments.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8" aria-hidden="true" />}
            title="No active platform assignments"
            description="Recover access with the documented production bootstrap procedure."
            data-testid="platform-access-empty"
          />
        ) : (
          <DataTable
            columns={assignmentColumns}
            rows={assignments}
            getRowKey={(row) => row.userId}
            getRowTestId={(row) => `platform-access-row-${row.userId}`}
            data-testid="platform-access-table"
          />
        )}
      </Card>

      <Card padding="lg" className="space-y-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="text-fg-secondary h-5 w-5" aria-hidden="true" />
          <CardTitle>Recent access changes</CardTitle>
        </div>
        <CardDescription>
          The latest grants, role changes, and revocations. Audit records remain after access is
          revoked.
        </CardDescription>
        {audit.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="h-8 w-8" aria-hidden="true" />}
            title="No access changes yet"
            description="Future platform role changes will appear here."
            data-testid="platform-access-audit-empty"
          />
        ) : (
          <DataTable
            columns={auditColumns}
            rows={audit}
            getRowKey={(row) => String(row.id)}
            data-testid="platform-access-audit-table"
          />
        )}
      </Card>
    </div>
  );
}

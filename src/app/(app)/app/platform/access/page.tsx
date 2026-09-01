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
import { tForActive } from "@/lib/i18n/t-for-active";
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

type Translator = (key: string, params?: Record<string, string | number>) => string;

function roleLabel(role: PlatformRole, t: Translator): string {
  return t(`platform.roleLabels.${role}.label`) || PLATFORM_ROLE_DETAILS[role].label;
}

function roleDescription(role: PlatformRole, t: Translator): string {
  return t(`platform.roleLabels.${role}.description`) || PLATFORM_ROLE_DETAILS[role].description;
}

function auditActionLabel(action: string, t: Translator): string {
  const key = `platform.auditAction${action
    .split(".")
    .pop()!
    .replace(/^./, (c) => c.toUpperCase())}`;
  const value = t(key);
  // If t returns a key-wrapper (missing key), fall back to raw action.
  return value.startsWith("[") ? action : value;
}

export default async function PlatformAccessPage() {
  const actor = await currentActor();
  const { t } = await tForActive();
  if (!actor) {
    return (
      <PermissionNotice
        title={t("platform.signInRequired")}
        description={t("platform.signInRequiredAccessBody")}
      />
    );
  }

  let principal;
  try {
    principal = await requirePlatformPermission(actor, "platform.access.read");
  } catch {
    return (
      <PermissionNotice
        title={t("platform.accessUnavailable")}
        description={t("platform.accessUnavailableBody")}
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
      header: t("platform.colPerson"),
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-body text-fg-primary font-semibold">{row.displayName || row.email}</p>
          <p className="text-label text-fg-muted max-w-52 truncate sm:max-w-none">{row.email}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: t("platform.colRole"),
      cell: (row) => (
        <Badge variant={ROLE_BADGE_VARIANT[row.role]}>
          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
          {roleLabel(row.role, t)}
        </Badge>
      ),
    },
    {
      key: "scope",
      header: t("platform.colAccessBoundary"),
      hideOn: "lg",
      cell: (row) => (
        <span className="text-body text-fg-secondary">{roleDescription(row.role, t)}</span>
      ),
    },
    {
      key: "changed",
      header: t("platform.colLastChanged"),
      hideOn: "md",
      cell: (row) => (
        <div className="text-body text-fg-secondary">
          <p>{formatRelativeDate(row.updatedAt)}</p>
          <p className="text-label text-fg-muted">
            {row.grantedByEmail
              ? t("platform.colChangedByPrefix", { name: row.grantedByEmail })
              : t("platform.colChangedByBootstrap")}
          </p>
        </div>
      ),
    },
  ];

  if (canManage) {
    assignmentColumns.push({
      key: "actions",
      header: <span className="sr-only">{t("platform.colActions")}</span>,
      headerClassName: "w-24",
      cellClassName: "text-end",
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <ChangePlatformRoleDialog
            userId={row.userId}
            email={row.email}
            currentRole={row.role}
            t={t}
          />
          <RevokePlatformAccessDialog userId={row.userId} email={row.email} role={row.role} t={t} />
        </div>
      ),
    });
  }

  const auditColumns: DataTableColumnDef<PlatformAccessAuditRow>[] = [
    {
      key: "action",
      header: t("platform.colAction"),
      cell: (row) => (
        <span className="text-body text-fg-primary font-medium">
          {auditActionLabel(row.action, t)}
        </span>
      ),
    },
    {
      key: "target",
      header: t("platform.colTarget"),
      cell: (row) => (
        <span className="text-body text-fg-secondary">
          {row.targetId ? (targetLabels.get(row.targetId) ?? t("platform.colFormerMember")) : "—"}
        </span>
      ),
    },
    {
      key: "outcome",
      header: t("platform.colOutcome"),
      hideOn: "sm",
      cell: (row) => (
        <Badge variant={row.outcome === "success" ? "success" : "warning"}>{row.outcome}</Badge>
      ),
    },
    {
      key: "when",
      header: t("platform.colWhen"),
      hideOn: "md",
      cell: (row) => (
        <span className="text-body text-fg-secondary">{formatRelativeDate(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6" data-testid="platform-access-root">
      <PageHeader
        eyebrow={t("platform.accessEyebrow")}
        title={t("platform.accessTitle")}
        description={t("platform.accessDescription")}
        action={
          canManage ? (
            <Link
              href="#add-platform-member"
              className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              {t("platform.accessAddMember")}
            </Link>
          ) : undefined
        }
      />

      {!canManage ? (
        <PermissionNotice
          title={t("platform.readOnlyAccessOversight")}
          description={t("platform.readOnlyAccessOversightBody")}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          icon={<Users className="h-4 w-4" aria-hidden="true" />}
          label={t("platform.kpiActiveMembers")}
          value={assignments.length}
          data-testid="platform-access-kpi-members"
        />
        <KpiTile
          icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
          label={t("platform.kpiPlatformOwners")}
          value={ownerCount}
          tone={ownerCount <= 1 ? "warning" : "default"}
          data-testid="platform-access-kpi-owners"
        />
        <KpiTile
          icon={<UserCog className="h-4 w-4" aria-hidden="true" />}
          label={t("platform.kpiOperators")}
          value={operatorCount}
          data-testid="platform-access-kpi-operators"
        />
        <KpiTile
          icon={<Headphones className="h-4 w-4" aria-hidden="true" />}
          label={
            supportSummary.expiring > 0
              ? t("platform.kpiSupportExpiring", { count: supportSummary.expiring })
              : t("platform.kpiSupportActive")
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
          <p>{t("platform.ownerWarning")}</p>
        </div>
      ) : null}

      {canManage ? (
        <Card id="add-platform-member" padding="lg" className="scroll-mt-6 space-y-4">
          <div className="flex items-center gap-2">
            <UserPlus className="text-primary h-5 w-5" aria-hidden="true" />
            <CardTitle>{t("platform.accessAddMember")}</CardTitle>
          </div>
          <CardDescription>{t("platform.addMemberDescription")}</CardDescription>
          <GrantPlatformAccessForm t={t} />
        </Card>
      ) : null}

      <Card padding="lg" className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-primary h-5 w-5" aria-hidden="true" />
          <CardTitle>{t("platform.currentAssignmentsTitle")}</CardTitle>
        </div>
        <CardDescription>{t("platform.currentAssignmentsDescription")}</CardDescription>
        {assignments.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8" aria-hidden="true" />}
            title={t("platform.emptyAssignments")}
            description={t("platform.emptyAssignmentsBody")}
            data-testid="platform-access-empty"
          />
        ) : (
          <>
            <div className="grid gap-3 lg:hidden" data-testid="platform-access-mobile-list">
              {assignments.map((row) => (
                <article
                  key={row.userId}
                  className="border-border rounded-[var(--radius-control)] border p-4"
                  data-testid={`platform-access-card-${row.userId}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body text-fg-primary truncate font-semibold">
                        {row.displayName || row.email}
                      </p>
                      <p className="text-label text-fg-muted truncate">{row.email}</p>
                    </div>
                    <Badge variant={ROLE_BADGE_VARIANT[row.role]} className="shrink-0">
                      {roleLabel(row.role, t)}
                    </Badge>
                  </div>
                  <p className="text-label text-fg-secondary mt-3">
                    {roleDescription(row.role, t)}
                  </p>
                  <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
                    <span className="text-label text-fg-muted">
                      {t("platform.colMobileChanged", { date: formatRelativeDate(row.updatedAt) })}
                    </span>
                    {canManage ? (
                      <div className="flex shrink-0 gap-1">
                        <ChangePlatformRoleDialog
                          userId={row.userId}
                          email={row.email}
                          currentRole={row.role}
                          t={t}
                        />
                        <RevokePlatformAccessDialog
                          userId={row.userId}
                          email={row.email}
                          role={row.role}
                          t={t}
                        />
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
            <div className="hidden lg:block">
              <DataTable
                columns={assignmentColumns}
                rows={assignments}
                getRowKey={(row) => row.userId}
                getRowTestId={(row) => `platform-access-row-${row.userId}`}
                data-testid="platform-access-table"
              />
            </div>
          </>
        )}
      </Card>

      <Card padding="lg" className="space-y-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="text-fg-secondary h-5 w-5" aria-hidden="true" />
          <CardTitle>{t("platform.auditTitle")}</CardTitle>
        </div>
        <CardDescription>{t("platform.auditDescription")}</CardDescription>
        {audit.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="h-8 w-8" aria-hidden="true" />}
            title={t("platform.auditEmpty")}
            description={t("platform.auditEmptyBody")}
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

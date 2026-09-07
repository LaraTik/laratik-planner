import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleSlash, Cloud, Gauge } from "lucide-react";
import { DirAwareArrowLeft } from "@/components/ui/dir-aware-icon";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { getAgencyStorageSummary } from "@/lib/storage/config";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StorageToggle } from "./storage-toggle";

export const dynamic = "force-dynamic";

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("storage.agencyTitle") };
}

export default async function AgencyStoragePage() {
  const { t, code } = await tForActive();
  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor) redirect("/signin");
  const context = await resolveActiveAgencyContext({ actor });
  if (!context?.agencyId) redirect("/setup");
  const isAdmin = await isAgencyAdmin(actor, context.agencyId);
  if (!isAdmin) {
    return (
      <div className="space-y-4" data-testid="agency-storage-forbidden">
        <PageHeader title={t("storage.agencyTitle")} description={t("storage.forbiddenBody")} />
        <Link
          href="/app/agency-settings"
          className="text-primary focus-visible:ring-focus-ring inline-flex min-h-[var(--control-touch)] items-center gap-1 rounded-[var(--radius-control)] px-2 py-2 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        >
          <DirAwareArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("storage.backToAgencySettings")}
        </Link>
      </div>
    );
  }
  const summary = await getAgencyStorageSummary(context.agencyId);
  const warningText =
    summary.warning === "over_limit"
      ? t("storage.overLimit")
      : summary.warning === "urgent"
        ? t("storage.urgent")
        : summary.warning === "warning"
          ? t("storage.warning")
          : t("storage.warningHealthy");
  const WarningIcon = summary.warning === "healthy" ? CheckCircle2 : AlertTriangle;
  const warningTone =
    summary.warning === "healthy"
      ? "text-success"
      : summary.warning === "over_limit"
        ? "text-danger"
        : "text-warning";
  const progressValue = Math.min(100, Math.max(0, summary.percentUsed));
  const StatusIcon =
    summary.status === "healthy"
      ? CheckCircle2
      : summary.status === "unhealthy"
        ? AlertTriangle
        : CircleSlash;
  const statusLabel =
    summary.status === "healthy"
      ? t("storage.statusHealthy")
      : summary.status === "unhealthy"
        ? t("storage.statusUnhealthy")
        : summary.enabled
          ? t("storage.statusPending")
          : t("storage.disabled");

  return (
    <div className="max-w-5xl space-y-6" data-testid="agency-storage-settings">
      <PageHeader
        title={t("storage.agencyTitle")}
        description={t("storage.agencyDescription")}
        action={
          <Link
            href="/app/agency-settings"
            className="text-primary focus-visible:ring-focus-ring text-body inline-flex min-h-[var(--control-touch)] items-center gap-1 rounded-[var(--radius-control)] px-2 py-2 font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          >
            <DirAwareArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("storage.backToAgencySettings")}
          </Link>
        }
      />
      <Card padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="bg-primary-subtle text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
              <Cloud className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <CardTitle>{t("storage.provider")}</CardTitle>
              <CardDescription className="mt-1">{t("storage.providerR2")}</CardDescription>
            </div>
          </div>
          <Badge
            variant={
              summary.status === "healthy"
                ? "success"
                : summary.status === "unhealthy" || !summary.enabled
                  ? "warning"
                  : "outline"
            }
          >
            <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {statusLabel}
          </Badge>
        </div>

        <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label={t("storage.usage")} value={formatBytes(summary.usedBytes)} />
          <Metric label={t("storage.reserved")} value={formatBytes(summary.reservedBytes)} />
          <Metric
            label={t("storage.quota")}
            value={
              summary.quotaBytes == null ? t("storage.unlimited") : formatBytes(summary.quotaBytes)
            }
          />
          <Metric label={t("storage.usedPercent")} value={`${summary.percentUsed.toFixed(1)}%`} />
        </dl>

        <div className="mt-6 space-y-2" aria-label={t("storage.usedPercent")}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-label text-fg-muted">{t("storage.quotaProgress")}</span>
            <span className="text-label text-fg-primary font-semibold">
              {summary.quotaBytes == null ? t("storage.unlimited") : `${progressValue.toFixed(1)}%`}
            </span>
          </div>
          <div
            className="bg-surface-subtle h-2 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={summary.quotaBytes == null ? undefined : progressValue}
            aria-valuetext={
              summary.quotaBytes == null ? t("storage.unlimited") : `${progressValue.toFixed(1)}%`
            }
          >
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${summary.warning === "healthy" ? "bg-success" : summary.warning === "warning" ? "bg-warning" : "bg-danger"}`}
              style={{ width: summary.quotaBytes == null ? "0%" : `${progressValue}%` }}
            />
          </div>
        </div>

        <div className="border-border bg-surface-subtle mt-6 flex items-start gap-2 rounded-[var(--radius-control)] border p-3">
          <WarningIcon className={`mt-0.5 h-4 w-4 shrink-0 ${warningTone}`} aria-hidden="true" />
          <p className="text-label text-fg-secondary" role="status" aria-live="polite">
            {warningText}
          </p>
        </div>

        <div className="text-label text-fg-muted mt-4 flex items-center gap-2">
          <Gauge className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {t("storage.lastHealthCheck")}:{" "}
            {summary.lastHealthCheckAt
              ? new Intl.DateTimeFormat(code, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  numberingSystem: "latn",
                }).format(summary.lastHealthCheckAt)
              : t("storage.never")}
          </span>
        </div>

        {isAdmin ? (
          <div className="border-border mt-6 border-t pt-4">
            <StorageToggle
              enabled={summary.enabled}
              label={summary.enabled ? t("storage.disable") : t("storage.enable")}
              pendingLabel={t("storage.updating")}
            />
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-subtle rounded-[var(--radius-control)] p-3">
      <dt className="text-label text-fg-muted">{label}</dt>
      <dd className="text-heading-sm text-fg-primary mt-1">{value}</dd>
    </div>
  );
}

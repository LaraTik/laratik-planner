import { redirect } from "next/navigation";
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
  const { t } = await tForActive();
  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor) redirect("/signin");
  const context = await resolveActiveAgencyContext({ actor });
  if (!context?.agencyId) redirect("/setup");
  const isAdmin = await isAgencyAdmin(actor, context.agencyId);
  const summary = await getAgencyStorageSummary(context.agencyId);
  const warningText =
    summary.warning === "over_limit"
      ? t("storage.overLimit")
      : summary.warning === "urgent"
        ? t("storage.urgent")
        : summary.warning === "warning"
          ? t("storage.warning")
          : t("storage.warningHealthy");
  return (
    <div className="space-y-6" data-testid="agency-storage-settings">
      <PageHeader title={t("storage.agencyTitle")} description={t("storage.agencyDescription")} />
      <Card padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>{t("storage.provider")}</CardTitle>
            <CardDescription className="mt-1">{t("storage.providerR2")}</CardDescription>
          </div>
          <Badge
            variant={
              summary.status === "healthy" ? "success" : summary.enabled ? "outline" : "warning"
            }
          >
            {summary.status === "healthy"
              ? t("storage.statusHealthy")
              : summary.enabled
                ? t("storage.statusPending")
                : t("storage.disabled")}
          </Badge>
        </div>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label={t("storage.usage")} value={formatBytes(summary.usedBytes)} />
          <Metric label={t("storage.reserved")} value={formatBytes(summary.reservedBytes)} />
          <Metric
            label={t("storage.quota")}
            value={summary.quotaBytes == null ? "∞" : formatBytes(summary.quotaBytes)}
          />
          <Metric label={t("storage.usedPercent")} value={`${summary.percentUsed.toFixed(1)}%`} />
        </dl>
        <p className="text-label text-fg-muted mt-5">{warningText}</p>
        <p className="text-label text-fg-muted mt-2">
          {t("storage.lastHealthCheck")}:{" "}
          {summary.lastHealthCheckAt?.toLocaleString() ?? t("storage.never")}
        </p>
        {isAdmin ? (
          <div className="mt-5">
            <StorageToggle
              enabled={summary.enabled}
              label={summary.enabled ? t("storage.disable") : t("storage.enable")}
            />
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-label text-fg-muted">{label}</dt>
      <dd className="text-heading-sm text-fg-primary mt-1">{value}</dd>
    </div>
  );
}

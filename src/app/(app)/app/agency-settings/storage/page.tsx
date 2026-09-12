import type React from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Cloud,
  Database,
  Gauge,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { DirAwareArrowLeft } from "@/components/ui/dir-aware-icon";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { getPlatformPrincipal } from "@/lib/auth/platform-access";
import { getAgencyStorageSummary } from "@/lib/storage/config";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CloudflareR2PricingCard } from "@/components/storage/cloudflare-r2-pricing-card";
import { StorageToggle } from "./storage-toggle";
import { StorageHealthCheck } from "./storage-health-check";
import { AgencyOwnedStorageForm } from "./agency-owned-storage-form";

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
  const platformPrincipal = await getPlatformPrincipal(actor);
  const canManagePlatformStorage =
    platformPrincipal?.permissions.has("platform.console.manage") === true;
  const providerReady =
    summary.providerConfigured && summary.providerEnabled && summary.providerStatus === "healthy";
  const storageReady = providerReady && summary.enabled && summary.status === "healthy";
  const agencyOwnsStorage = summary.mode === "agency_owned";
  const backendChangeLocked = summary.objectCount > 0 || summary.activeUploadCount > 0;
  const progressValue = Math.min(100, Math.max(0, summary.projectedPercentUsed));
  const warningText = !summary.providerConfigured
    ? agencyOwnsStorage
      ? t("storage.ownedNotConfigured")
      : t("storage.notConfigured")
    : !providerReady
      ? agencyOwnsStorage
        ? t("storage.ownedProviderUnavailable")
        : t("storage.providerUnavailable")
      : !summary.enabled
        ? t("storage.disabled")
        : summary.warning === "over_limit"
          ? t("storage.overLimit")
          : summary.warning === "urgent"
            ? t("storage.urgent")
            : summary.warning === "warning"
              ? t("storage.warning")
              : t("storage.warningHealthy");
  const warningIsHealthy = storageReady && summary.warning === "healthy";
  const WarningIcon = warningIsHealthy ? CheckCircle2 : AlertTriangle;
  const warningTone = warningIsHealthy
    ? "text-success"
    : summary.warning === "over_limit"
      ? "text-danger"
      : "text-warning";
  const statusLabel = !summary.providerConfigured
    ? t("storage.notConfiguredShort")
    : !providerReady
      ? t("storage.providerUnavailableShort")
      : !summary.enabled
        ? t("storage.disabled")
        : summary.status === "healthy"
          ? t("storage.statusHealthy")
          : summary.status === "unhealthy"
            ? t("storage.statusUnhealthy")
            : t("storage.statusPending");
  const StatusIcon = storageReady
    ? CheckCircle2
    : summary.status === "unhealthy" || !providerReady
      ? AlertTriangle
      : CircleSlash;
  const statusVariant = storageReady
    ? "success"
    : summary.status === "unhealthy" || !providerReady
      ? "warning"
      : "outline";

  return (
    <div className="max-w-5xl space-y-6" data-testid="agency-storage-settings">
      <PageHeader
        title={t("storage.agencyTitle")}
        description={
          agencyOwnsStorage ? t("storage.agencyOwnedDescription") : t("storage.agencyDescription")
        }
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

      <Card padding="lg" data-testid="agency-storage-setup">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="bg-primary-subtle text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
              <Cloud className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <CardTitle>{t("storage.setupTitle")}</CardTitle>
              <CardDescription>
                {agencyOwnsStorage
                  ? t("storage.ownedSetupDescription")
                  : t("storage.setupDescription")}
              </CardDescription>
            </div>
          </div>
          <Badge variant={statusVariant}>
            <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {statusLabel}
          </Badge>
        </div>

        <ol className="mt-6 grid gap-3 lg:grid-cols-3">
          <SetupStep
            number="1"
            icon={<LockKeyhole className="h-4 w-4" aria-hidden="true" />}
            title={
              agencyOwnsStorage ? t("storage.setupOwnedTitle") : t("storage.setupPlatformTitle")
            }
            description={
              agencyOwnsStorage
                ? t("storage.setupOwnedDescription")
                : t("storage.setupPlatformDescription")
            }
            status={
              summary.providerConfigured && providerReady
                ? t("storage.providerReady")
                : summary.providerConfigured
                  ? t("storage.providerUnavailableShort")
                  : agencyOwnsStorage
                    ? t("storage.ownedProviderWaiting")
                    : t("storage.providerWaiting")
            }
            statusTone={providerReady ? "success" : "warning"}
            action={
              agencyOwnsStorage ? (
                <a
                  href="#agency-owned-storage-card"
                  className="text-primary focus-visible:ring-focus-ring inline-flex min-h-[var(--control-touch)] items-center rounded-[var(--radius-control)] font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                >
                  {t("storage.openOwnedSetup")}
                </a>
              ) : canManagePlatformStorage ? (
                <Link
                  href="/app/platform/storage"
                  className="text-primary focus-visible:ring-focus-ring inline-flex min-h-[var(--control-touch)] items-center gap-1 rounded-[var(--radius-control)] font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                >
                  {t("storage.openPlatformSetup")}
                </Link>
              ) : (
                <Link
                  href={
                    "mailto:support@laratik.com" +
                    "?subject=" +
                    encodeURIComponent(t("storage.requestSetupSubject")) +
                    "&body=" +
                    encodeURIComponent(t("storage.requestSetupBody"))
                  }
                  className="text-primary focus-visible:ring-focus-ring inline-flex min-h-[var(--control-touch)] items-center rounded-[var(--radius-control)] font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                >
                  {t("storage.requestSetup")}
                </Link>
              )
            }
          />
          <SetupStep
            number="2"
            icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            title={t("storage.setupAgencyTitle")}
            description={t("storage.setupAgencyDescription")}
            status={summary.enabled ? t("storage.enabled") : t("storage.disabled")}
            statusTone={summary.enabled ? "success" : "warning"}
            action={
              <StorageToggle
                enabled={summary.enabled}
                label={summary.enabled ? t("storage.disable") : t("storage.enable")}
                pendingLabel={t("storage.updating")}
              />
            }
          />
          <SetupStep
            number="3"
            icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
            title={t("storage.setupVerifyTitle")}
            description={t("storage.setupVerifyDescription")}
            status={
              summary.lastHealthCheckOk === true
                ? t("storage.healthCheckPassed")
                : summary.lastHealthCheckOk === false
                  ? t("storage.healthCheckFailedShort")
                  : t("storage.never")
            }
            statusTone={summary.lastHealthCheckOk === true ? "success" : "warning"}
            action={
              summary.enabled ? (
                <StorageHealthCheck
                  label={t("storage.checkConnection")}
                  pendingLabel={t("storage.checkingConnection")}
                  successMessage={
                    agencyOwnsStorage
                      ? t("storage.ownedHealthCheckSuccess")
                      : t("storage.healthCheckSuccess")
                  }
                  errorMessage={t("storage.healthCheckFailed")}
                />
              ) : null
            }
          />
        </ol>
      </Card>

      <AgencyOwnedStorageForm
        initial={{
          mode: summary.mode,
          accountId: summary.accountId,
          endpoint: summary.endpoint,
          bucket: summary.bucket,
          accessKeyLastFour: summary.accessKeyLastFour,
          secretAccessKeyLastFour: summary.secretAccessKeyLastFour,
        }}
        backendChangeLocked={backendChangeLocked}
        copy={{
          accountId: t("storage.accountId"),
          endpoint: t("storage.endpoint"),
          bucket: t("storage.bucket"),
          accessKeyId: t("storage.accessKeyId"),
          secretAccessKey: t("storage.secretAccessKey"),
          ownedTitle: t("storage.ownedTitle"),
          ownedDescription: t("storage.ownedDescription"),
          ownedInstructions: t("storage.ownedInstructions"),
          ownedEndpointHint: t("storage.ownedEndpointHint"),
          ownedCredentialHint: t("storage.ownedCredentialHint"),
          ownedTestHint: t("storage.ownedTestHint"),
          ownedSave: t("storage.ownedSave"),
          ownedTest: t("storage.ownedTest"),
          ownedTesting: t("storage.ownedTesting"),
          ownedSaving: t("storage.ownedSaving"),
          ownedMode: t("storage.ownedMode"),
          managedMode: t("storage.managedMode"),
          currentMode: t("storage.currentMode"),
          configured: t("storage.configured"),
          switchToManaged: t("storage.switchToManaged"),
          switching: t("storage.switching"),
          backendChangeLocked: t("storage.backendChangeLocked"),
          feedback: {
            invalidConfiguration: t("storage.invalidConfiguration"),
            testFailed: t("storage.testFailed"),
            saveFailed: t("storage.saveFailed"),
            ownedTestSuccess: t("storage.ownedTestSuccess"),
            ownedSavedVerified: t("storage.ownedSavedVerified"),
            managedSwitched: t("storage.managedSwitched"),
            backendMigrationRequired: t("storage.backendMigrationRequired"),
            authRequired: t("storage.authRequired"),
            permissionDenied: t("storage.permissionDenied"),
          },
        }}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
        <Card padding="lg" data-testid="agency-storage-quota">
          <div className="flex items-start gap-3">
            <span className="bg-primary-subtle text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
              <Gauge className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <CardTitle>{t("storage.quotaTitle")}</CardTitle>
              <CardDescription>{t("storage.quotaDescription")}</CardDescription>
            </div>
          </div>

          <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label={t("storage.usage")} value={formatBytes(summary.usedBytes)} />
            <Metric label={t("storage.reserved")} value={formatBytes(summary.reservedBytes)} />
            <Metric
              label={t("storage.available")}
              value={
                summary.availableBytes == null
                  ? t("storage.unlimited")
                  : formatBytes(summary.availableBytes)
              }
            />
            <Metric
              label={t("storage.quota")}
              value={
                summary.quotaBytes == null
                  ? t("storage.unlimited")
                  : formatBytes(summary.quotaBytes)
              }
            />
            <Metric label={t("storage.storedObjects")} value={String(summary.objectCount)} />
            <Metric label={t("storage.activeUploads")} value={String(summary.activeUploadCount)} />
          </dl>

          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-label text-fg-muted">{t("storage.quotaProgress")}</span>
              <span className="text-label text-fg-primary font-semibold">
                {summary.quotaBytes == null
                  ? t("storage.unlimited")
                  : `${progressValue.toFixed(1)}%`}
              </span>
            </div>
            <div
              className="bg-surface-subtle h-2 overflow-hidden rounded-full"
              role="progressbar"
              aria-label={t("storage.quotaProgress")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={summary.quotaBytes == null ? undefined : progressValue}
              aria-valuetext={
                summary.quotaBytes == null ? t("storage.unlimited") : `${progressValue.toFixed(1)}%`
              }
            >
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${warningIsHealthy ? "bg-success" : summary.warning === "warning" ? "bg-warning" : "bg-danger"}`}
                style={{ width: summary.quotaBytes == null ? "0%" : `${progressValue}%` }}
              />
            </div>
            <p className="text-label text-fg-muted">{t("storage.quotaIncludesReserved")}</p>
          </div>

          <div className="border-border bg-surface-subtle mt-6 flex items-start gap-2 rounded-[var(--radius-control)] border p-3">
            <WarningIcon className={`mt-0.5 h-4 w-4 shrink-0 ${warningTone}`} aria-hidden="true" />
            <p className="text-label text-fg-secondary" role="status" aria-live="polite">
              {warningText}
            </p>
          </div>
        </Card>

        <Card padding="lg" data-testid="agency-storage-privacy">
          <div className="flex items-start gap-3">
            <span className="bg-primary-subtle text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <CardTitle>{t("storage.privacyTitle")}</CardTitle>
              <CardDescription>{t("storage.privacyDescription")}</CardDescription>
            </div>
          </div>
          <dl className="mt-6 space-y-4">
            <Detail label={t("storage.provider")} value={t("storage.providerR2")} />
            <Detail
              label={t("storage.storageMode")}
              value={agencyOwnsStorage ? t("storage.ownedMode") : t("storage.managedMode")}
            />
            <Detail
              label={t("storage.scopePrefix")}
              value={summary.keyPrefix}
              code
              description={t("storage.scopePrefixDescription")}
            />
            <Detail
              label={t("storage.accessPolicy")}
              value={t("storage.privateBucket")}
              description={t("storage.accessPolicyDescription")}
            />
          </dl>
          <div className="text-label text-fg-muted mt-6 flex items-start gap-2">
            <Database className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
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
        </Card>
      </div>

      <CloudflareR2PricingCard
        locale={code}
        copy={{
          title: t("storage.billingTitle"),
          description: t("storage.billingDescription"),
          standard: t("storage.billingStandard"),
          notConnected: t("storage.billingNotConnected"),
          metric: t("storage.billingMetric"),
          included: t("storage.billingIncluded"),
          price: t("storage.billingPrice"),
          storage: t("storage.billingStorage"),
          classA: t("storage.billingClassA"),
          classB: t("storage.billingClassB"),
          gbMonth: t("storage.billingGbMonth"),
          requests: t("storage.billingRequests"),
          millionRequests: t("storage.billingMillionRequests"),
          note: t("storage.billingNote"),
          source: t("storage.billingSource"),
        }}
      />
    </div>
  );
}

function SetupStep({
  number,
  icon,
  title,
  description,
  status,
  statusTone,
  action,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  status: string;
  statusTone: "success" | "warning";
  action: React.ReactNode;
}) {
  return (
    <li className="border-border bg-surface-subtle flex min-h-52 flex-col rounded-[var(--radius-control)] border p-4">
      <div className="flex items-center gap-2">
        <span className="bg-primary text-on-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold">
          {number}
        </span>
        <span className="text-primary" aria-hidden="true">
          {icon}
        </span>
        <h3 className="text-body text-fg-primary font-semibold">{title}</h3>
      </div>
      <p className="text-label text-fg-secondary mt-3 flex-1">{description}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span
          className={`text-label flex items-center gap-1 font-semibold ${statusTone === "success" ? "text-success" : "text-warning"}`}
        >
          {statusTone === "success" ? (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {status}
        </span>
        {action}
      </div>
    </li>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-subtle rounded-[var(--radius-control)] p-3">
      <dt className="text-label text-fg-muted">{label}</dt>
      <dd className="text-heading-sm text-fg-primary mt-1 break-words">{value}</dd>
    </div>
  );
}

function Detail({
  label,
  value,
  description,
  code = false,
}: {
  label: string;
  value: string;
  description?: string;
  code?: boolean;
}) {
  return (
    <div className="border-border border-b pb-3 last:border-0 last:pb-0">
      <dt className="text-label text-fg-muted">{label}</dt>
      <dd className="text-body text-fg-primary mt-1 font-semibold break-all">
        {code ? (
          <code dir="ltr" className="font-mono text-sm">
            {value}
          </code>
        ) : (
          value
        )}
        {description ? (
          <p className="text-label text-fg-muted mt-1 font-normal">{description}</p>
        ) : null}
      </dd>
    </div>
  );
}

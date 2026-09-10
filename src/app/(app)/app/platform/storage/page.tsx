import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db";
import { platformStorageProviderConfigs } from "@/lib/db/schema";
import { currentActor } from "@/lib/auth/current-actor";
import { requirePlatformPermission } from "@/lib/auth/platform-access";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PermissionNotice } from "@/components/platform/permission-notice";
import { AlertTriangle, CheckCircle2, CircleSlash, Cloud } from "lucide-react";
import { StorageConfigForm } from "./storage-config-form";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("storage.platformTitle") };
}

export default async function PlatformStoragePage() {
  const { t } = await tForActive();
  const actor = await currentActor();
  if (!actor) {
    return (
      <PermissionNotice
        title={t("platform.signInRequired")}
        description={t("platform.signInRequiredStorageBody")}
      />
    );
  }
  try {
    await requirePlatformPermission(actor, "platform.console.manage");
  } catch {
    return (
      <PermissionNotice
        title={t("platform.storageUnavailable")}
        description={t("platform.storageUnavailableBody")}
      />
    );
  }
  const [config] = await db
    .select({
      accountId: platformStorageProviderConfigs.accountId,
      endpoint: platformStorageProviderConfigs.endpoint,
      bucket: platformStorageProviderConfigs.bucket,
      accessKeyLastFour: platformStorageProviderConfigs.accessKeyLastFour,
      secretAccessKeyLastFour: platformStorageProviderConfigs.secretAccessKeyLastFour,
      status: platformStorageProviderConfigs.status,
      enabled: platformStorageProviderConfigs.enabled,
    })
    .from(platformStorageProviderConfigs)
    .where(and(eq(platformStorageProviderConfigs.provider, "r2")))
    .limit(1);
  const copy = {
    platformTitle: t("storage.platformTitle"),
    accountId: t("storage.accountId"),
    endpoint: t("storage.endpoint"),
    bucket: t("storage.bucket"),
    accessKeyId: t("storage.accessKeyId"),
    secretAccessKey: t("storage.secretAccessKey"),
    storageClass: t("storage.storageClass"),
    standard: t("storage.standard"),
    save: t("storage.save"),
    test: t("storage.test"),
    testing: t("storage.testing"),
    saving: t("storage.saving"),
    secretsNote: t("storage.secretsNote"),
    endpointHint: t("storage.endpointHint"),
    credentialHint: t("storage.credentialHint"),
    rotateHint: t("storage.rotateHint"),
    testHint: t("storage.testHint"),
    feedback: {
      authRequired: t("storage.authRequired"),
      testFailed: t("storage.testFailed"),
      invalidConfiguration: t("storage.invalidConfiguration"),
      saveFailed: t("storage.saveFailed"),
      testSuccess: t("storage.testSuccess"),
      savedVerified: t("storage.savedVerified"),
    },
  };
  const status = config?.enabled === false ? "disabled" : (config?.status ?? "not_tested");
  const StatusIcon =
    status === "healthy" ? CheckCircle2 : status === "unhealthy" ? AlertTriangle : CircleSlash;
  const statusVariant =
    status === "healthy" ? "success" : status === "unhealthy" ? "danger" : "outline";
  const statusLabel =
    status === "healthy"
      ? t("storage.statusHealthy")
      : status === "unhealthy"
        ? t("storage.statusUnhealthy")
        : status === "disabled"
          ? t("storage.statusDisabled")
          : t("storage.statusPending");
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        eyebrow={t("platform.eyebrow")}
        title={t("storage.platformTitle")}
        description={t("storage.platformDescription")}
      />
      <Card variant="subtle" padding="md" className="flex flex-wrap items-start gap-3">
        <span className="bg-primary-subtle text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
          <Cloud className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-label text-fg-muted">{t("storage.status")}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant}>
              <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {statusLabel}
            </Badge>
            <span className="text-label text-fg-muted">{t("storage.privateBucket")}</span>
          </div>
          <div className="border-border mt-4 border-t pt-3">
            <p className="text-label text-fg-muted">{t("storage.platformScopeLabel")}</p>
            <p className="text-body mt-1 font-semibold">{t("storage.platformScopeValue")}</p>
            <p className="text-label text-fg-muted mt-1 max-w-3xl">
              {t("storage.platformScopeDescription")}
            </p>
            <Link
              href="/app/agency-settings/storage"
              className="text-primary focus-visible:ring-focus-ring mt-2 inline-flex min-h-[var(--control-touch)] items-center rounded-[var(--radius-control)] font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            >
              {t("storage.openAgencyStorageSettings")}
            </Link>
          </div>
        </div>
      </Card>
      <StorageConfigForm initial={config} copy={copy} />
    </div>
  );
}

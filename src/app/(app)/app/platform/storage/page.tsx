import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { platformStorageProviderConfigs } from "@/lib/db/schema";
import { currentActor } from "@/lib/auth/current-actor";
import { requirePlatformPermission } from "@/lib/auth/platform-access";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { Badge } from "@/components/ui/badge";
import { StorageConfigForm } from "./storage-config-form";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("storage.platformTitle") };
}

export default async function PlatformStoragePage() {
  const { t } = await tForActive();
  const actor = await currentActor();
  if (!actor)
    return (
      <PageHeader
        eyebrow={t("platform.eyebrow")}
        title={t("storage.platformTitle")}
        description={t("storage.notConfigured")}
      />
    );
  await requirePlatformPermission(actor, "platform.console.manage");
  const [config] = await db
    .select({
      accountId: platformStorageProviderConfigs.accountId,
      endpoint: platformStorageProviderConfigs.endpoint,
      bucket: platformStorageProviderConfigs.bucket,
      accessKeyLastFour: platformStorageProviderConfigs.accessKeyLastFour,
      secretAccessKeyLastFour: platformStorageProviderConfigs.secretAccessKeyLastFour,
      status: platformStorageProviderConfigs.status,
    })
    .from(platformStorageProviderConfigs)
    .where(
      and(
        eq(platformStorageProviderConfigs.provider, "r2"),
        eq(platformStorageProviderConfigs.enabled, true),
      ),
    )
    .limit(1);
  const copy = {
    platformTitle: t("storage.platformTitle"),
    platformDescription: t("storage.platformDescription"),
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
    feedback: {
      authRequired: t("storage.authRequired"),
      testFailed: t("storage.testFailed"),
      invalidConfiguration: t("storage.invalidConfiguration"),
      saveFailed: t("storage.saveFailed"),
      testSuccess: t("storage.testSuccess"),
      savedVerified: t("storage.savedVerified"),
    },
  };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("platform.eyebrow")}
        title={t("storage.platformTitle")}
        description={t("storage.platformDescription")}
      />
      <div className="flex items-center gap-2">
        <span className="text-label text-fg-muted">{t("storage.status")}</span>
        <Badge variant={config?.status === "healthy" ? "success" : "outline"}>
          {config?.status === "healthy"
            ? t("storage.statusHealthy")
            : config?.status === "unhealthy"
              ? t("storage.statusUnhealthy")
              : t("storage.statusPending")}
        </Badge>
      </div>
      <StorageConfigForm initial={config} copy={copy} />
    </div>
  );
}

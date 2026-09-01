import { redirect } from "next/navigation";
import Link from "next/link";
import { Activity } from "lucide-react";
import { DirAwareArrowLeft } from "@/components/ui/dir-aware-icon";
import { auth } from "@/lib/auth/config";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { getSocialStatus, SocialServiceError } from "@/lib/social/service";
import { SocialCard } from "./social-card";

export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("agencySocial.title") };
}

/**
 * M4.5 — agency admin social analytics page.
 *
 * Renders the social-card on top of the standard agency-settings
 * chrome. The card is a client component because the enable /
 * rotate / disable / reset-recovery flows are interactive
 * (recovery-key modal, destructive confirm, copy-to-clipboard).
 *
 * The non-admin / non-signed-in paths redirect to /signin.
 * Forbidden (signed in, not admin) shows a friendly page with
 * a back link to /app.
 */
export default async function AgencySocialSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) redirect("/setup");
  const { t } = await tForActive();
  if (!(await isAgencyAdmin(actor, agencyId))) {
    return (
      <div className="space-y-4" data-testid="agency-social-forbidden">
        <PageHeader title={t("agencySocial.title")} description={t("agencySocial.forbiddenBody")} />
        <Link
          href="/app/agency-settings"
          className="text-primary focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        >
          <DirAwareArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("agencySocial.backToAgencySettings")}
        </Link>
      </div>
    );
  }

  let status;
  try {
    status = await getSocialStatus(actor, agencyId);
  } catch (err) {
    if (err instanceof SocialServiceError && err.code === "social.forbidden") {
      return (
        <div className="space-y-4" data-testid="agency-social-forbidden">
          <PageHeader
            title={t("agencySocial.title")}
            description={t("agencySocial.forbiddenBody")}
          />
          <Link
            href="/app/agency-settings"
            className="text-primary focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          >
            <DirAwareArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("agencySocial.backToAgencySettings")}
          </Link>
        </div>
      );
    }
    throw err;
  }

  return (
    <div className="space-y-6" data-testid="agency-social-settings">
      <PageHeader
        eyebrow={t("agencySocial.eyebrow")}
        title={t("agencySocial.title")}
        description={t("agencySocial.description")}
        action={
          <Link
            href="/app/agency-settings"
            className="text-primary focus-visible:ring-focus-ring text-body inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          >
            <DirAwareArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("agencySocial.backToAgencySettings")}
          </Link>
        }
      />

      <SocialCard
        agencyId={agencyId}
        initialStatus={{
          enabled: status.enabled,
          dekKeyVersion: status.enabled ? status.dekKeyVersion : undefined,
          enabledAt: status.enabled ? status.enabledAt.toISOString() : undefined,
          lastRotatedAt: status.enabled ? (status.lastRotatedAt?.toISOString() ?? null) : undefined,
          rotationReason: status.enabled ? status.rotationReason : undefined,
          connectionCount: status.connectionCount,
          platformKekAvailable: status.platformKekAvailable,
        }}
        t={t}
      />

      <div className="border-border bg-surface-subtle text-body text-fg-secondary flex flex-wrap items-start gap-2 rounded-[var(--radius-control)] border p-3">
        <Activity className="text-fg-muted mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <p>{t("agencySocial.dekBlurb", { kek: "SOCIAL_TOKEN_ENCRYPTION_KEY" })}</p>
          <p className="mt-2">{t("agencySocial.rotateBlurb")}</p>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, Plus } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { Button } from "@/components/ui/button";
import { AdvertisingProviderMark } from "@/components/advertising/provider-mark";
import { AdvertisingAdminPanel } from "./advertising-admin-panel";
import { listAdvertisingConnectionsForAdmin, listAdvertisingResourcesForAdmin } from "./actions";

export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("advertising.title") };
}

export default async function AdvertisingSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) redirect("/setup");
  const { t } = await tForActive();
  if (!(await isAgencyAdmin(actor, context.agencyId))) {
    return (
      <div className="space-y-4" data-testid="advertising-forbidden">
        <PageHeader title={t("advertising.title")} description={t("advertising.forbidden")} />
      </div>
    );
  }
  const [connections, resources] = await Promise.all([
    listAdvertisingConnectionsForAdmin(),
    listAdvertisingResourcesForAdmin(),
  ]);
  return (
    <div className="space-y-6" data-testid="advertising-settings">
      <nav aria-label={t("advertising.breadcrumbAria")} className="text-label text-fg-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link className="hover:text-fg-primary transition-colors" href="/app/agency-settings">
              {t("advertising.breadcrumbIntegrations")}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link
              className="hover:text-fg-primary transition-colors"
              href="/app/agency-settings/advertising"
            >
              {t("advertising.breadcrumbAdvertising")}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-fg-primary font-medium" aria-current="page">
            {t("advertising.breadcrumbMetaAds")}
          </li>
        </ol>
      </nav>
      <PageHeader
        eyebrow={t("advertising.eyebrow")}
        title={
          <span className="inline-flex items-center gap-3">
            <AdvertisingProviderMark size="lg" />
            <span>{t("advertising.title")}</span>
          </span>
        }
        description={t("advertising.description")}
        action={
          <>
            <Button asChild variant="secondary" size="sm">
              <a
                href="https://developers.facebook.com/docs/marketing-api"
                target="_blank"
                rel="noreferrer"
              >
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                {t("advertising.viewDocumentation")}
              </a>
            </Button>
            <Button asChild size="sm">
              <a href="#advertising-create-card">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("advertising.addConnection")}
              </a>
            </Button>
          </>
        }
      />
      <AdvertisingAdminPanel
        connections={connections.map((connection) => ({
          ...connection,
          lastValidatedAt: connection.lastValidatedAt?.toISOString() ?? null,
          createdAt: connection.createdAt.toISOString(),
        }))}
        accounts={resources.accounts}
        workspaces={resources.workspaces}
        syncStates={resources.syncStates.map((state) => ({
          ...state,
          lastCompletedAt: state.lastCompletedAt?.toISOString() ?? null,
          nextRunAt: state.nextRunAt?.toISOString() ?? null,
        }))}
        connectionAccounts={resources.connectionAccounts}
        socialIdentities={resources.socialIdentities}
        capabilities={resources.capabilities}
        visibilityGrants={resources.visibilityGrants.map((grant) => ({
          ...grant,
          startsAt: grant.startsAt.toISOString(),
          endsAt: grant.endsAt?.toISOString() ?? null,
          revokedAt: grant.revokedAt?.toISOString() ?? null,
        }))}
        financialAuthorities={resources.financialAuthorities.map((authority) => ({
          ...authority,
          startsAt: authority.startsAt.toISOString(),
          endsAt: authority.endsAt?.toISOString() ?? null,
          revokedAt: authority.revokedAt?.toISOString() ?? null,
        }))}
        validationResults={resources.validationResults.map((result) => ({
          ...result,
          checkedAt: result.checkedAt.toISOString(),
        }))}
        syncRuns={resources.syncRuns.map((run) => ({
          ...run,
          startedAt: run.startedAt.toISOString(),
          completedAt: run.completedAt?.toISOString() ?? null,
        }))}
        reconciliations={resources.reconciliations.map((row) => ({
          ...row,
          checkedAt: row.checkedAt.toISOString(),
        }))}
      />
    </div>
  );
}

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
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
      <PageHeader
        eyebrow={t("advertising.eyebrow")}
        title={t("advertising.title")}
        description={t("advertising.description")}
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
      />
    </div>
  );
}

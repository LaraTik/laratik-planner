import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { canWriteToWorkspace, hasWorkspaceRole } from "@/lib/auth/policy";
import { listSwitcherWorkspaces } from "@/lib/workspaces/context";
import { listMediaAssets } from "@/lib/media/service";
import { tForActive } from "@/lib/i18n/t-for-active";
import { MediaLibraryPage } from "@/components/media/media-library-page";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: t("media.title") };
}

export default async function AgencyMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; trash?: string; view?: string }>;
}) {
  const { t } = await tForActive();
  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor) redirect("/signin");

  const context = await resolveActiveAgencyContext({ actor });
  if (!context?.agencyId) redirect("/setup");
  const filters = await searchParams;
  const { options } = await listSwitcherWorkspaces(actor);
  const rows = await listMediaAssets(actor, {
    agencyId: context.agencyId,
    ...(filters.q ? { query: filters.q } : {}),
    ...(filters.kind ? { kind: filters.kind } : {}),
    includeTrashed: filters.trash === "1",
  });
  const writable = await Promise.all(
    options.map(async (workspace) => canWriteToWorkspace(actor, workspace.id)),
  );
  const writableOptions = options.filter((_, index) => writable[index] === true);
  const managerWorkspaceIds = (
    await Promise.all(
      options.map(async (workspace) =>
        (await hasWorkspaceRole(actor, workspace.id, ["workspace_manager"])) ? workspace.id : null,
      ),
    )
  ).filter((id): id is string => id !== null);

  return (
    <MediaLibraryPage
      title={t("media.title")}
      description={t("media.description")}
      rows={rows}
      workspaceOptions={writableOptions}
      managerWorkspaceIds={managerWorkspaceIds}
      canUpload={writable.some(Boolean)}
      includeTrashed={filters.trash === "1"}
      view={filters.view === "list" ? "list" : "grid"}
      search={filters.q ?? ""}
      kind={filters.kind ?? ""}
      t={t}
    />
  );
}

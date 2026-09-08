import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { canWriteToWorkspace, hasWorkspaceRole } from "@/lib/auth/policy";
import { listSwitcherWorkspaces } from "@/lib/workspaces/context";
import { listMediaAssets, listMediaFolders } from "@/lib/media/service";
import { getAgencyStorageSummary } from "@/lib/storage/config";
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
  searchParams: Promise<{
    q?: string;
    kind?: string;
    trash?: string;
    view?: string;
    workspace?: string;
    folder?: string;
    shared?: string;
  }>;
}) {
  const { t } = await tForActive();
  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor) redirect("/signin");

  const context = await resolveActiveAgencyContext({ actor });
  if (!context?.agencyId) redirect("/setup");
  const filters = await searchParams;
  const { options } = await listSwitcherWorkspaces(actor);
  const selectedWorkspaceId = options.some((workspace) => workspace.id === filters.workspace)
    ? filters.workspace!
    : "";
  const selectedFolderId = filters.folder ?? "";
  const folderOptionsByWorkspace = Object.fromEntries(
    await Promise.all(
      options.map(
        async (workspace) =>
          [
            workspace.id,
            await listMediaFolders(actor, {
              agencyId: context.agencyId,
              workspaceId: workspace.id,
            }),
          ] as const,
      ),
    ),
  );
  const rows = await listMediaAssets(actor, {
    agencyId: context.agencyId,
    ...(selectedWorkspaceId ? { workspaceId: selectedWorkspaceId } : {}),
    ...(filters.q ? { query: filters.q } : {}),
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(selectedFolderId
      ? { folderId: selectedFolderId === "unfiled" ? null : selectedFolderId }
      : {}),
    ...(filters.shared === "1" ? { sharedOnly: true } : {}),
    includeTrashed: filters.trash === "1",
  });
  const storageSummary = await getAgencyStorageSummary(context.agencyId);
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
      folderWorkspaceOptions={options}
      folderOptionsByWorkspace={folderOptionsByWorkspace}
      basePath="/app/media"
      selectedWorkspaceId={selectedWorkspaceId}
      selectedFolderId={selectedFolderId}
      sharedOnly={filters.shared === "1"}
      preserveParams={{
        ...(filters.q ? { q: filters.q } : {}),
        ...(filters.kind ? { kind: filters.kind } : {}),
        ...(filters.trash === "1" ? { trash: "1" } : {}),
        ...(filters.view ? { view: filters.view } : {}),
      }}
      managerWorkspaceIds={managerWorkspaceIds}
      canUpload={writable.some(Boolean)}
      includeTrashed={filters.trash === "1"}
      view={filters.view === "list" ? "list" : "grid"}
      search={filters.q ?? ""}
      kind={filters.kind ?? ""}
      t={t}
      storageSummary={{
        mode: storageSummary.mode,
        bucket: storageSummary.bucket,
        keyPrefix: storageSummary.keyPrefix,
      }}
    />
  );
}

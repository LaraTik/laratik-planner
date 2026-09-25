import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { canWriteToWorkspace, hasWorkspaceRole } from "@/lib/auth/policy";
import { listSwitcherWorkspaces } from "@/lib/workspaces/context";
import {
  listMediaAssetsPage,
  listMediaFolders,
  listMediaFoldersTree,
  type MediaSort,
} from "@/lib/media/service";
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
    sort?: string;
    page?: string;
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
  const sort: MediaSort =
    filters.sort === "uploadedAt" || filters.sort === "updatedAt" ? filters.sort : "name";
  const page = Math.max(Number.parseInt(filters.page ?? "1", 10) || 1, 1);
  const activeWorkspace = options.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;
  const folderTree = selectedWorkspaceId
    ? await listMediaFoldersTree(actor, {
        agencyId: context.agencyId,
        workspaceId: selectedWorkspaceId,
      })
    : [];
  const flatFolders = selectedWorkspaceId
    ? await listMediaFolders(actor, {
        agencyId: context.agencyId,
        workspaceId: selectedWorkspaceId,
      })
    : [];
  const ancestors: { id: string; name: string }[] = [];
  const folderById = new Map(flatFolders.map((f) => [f.id, f]));
  let cursor = folderById.get(selectedFolderId);
  while (cursor && cursor.parentId) {
    const parent = folderById.get(cursor.parentId);
    if (!parent) break;
    ancestors.unshift({ id: parent.id, name: parent.name });
    cursor = parent;
  }
  const activeFolderLabel = !activeWorkspace
    ? t("media.allMedia")
    : selectedFolderId === "unfiled"
      ? t("media.unfiled")
      : filters.shared === "1"
        ? t("media.agencySharedFilter")
        : (flatFolders.find((f) => f.id === selectedFolderId)?.name ?? t("media.allMedia"));
  const mediaPage = await listMediaAssetsPage(actor, {
    agencyId: context.agencyId,
    ...(selectedWorkspaceId ? { workspaceId: selectedWorkspaceId } : {}),
    ...(filters.q ? { query: filters.q } : {}),
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(selectedFolderId
      ? { folderId: selectedFolderId === "unfiled" ? null : selectedFolderId }
      : {}),
    ...(filters.shared === "1" ? { sharedOnly: true } : {}),
    includeTrashed: filters.trash === "1",
    sort,
    page,
    // Cap the agency-wide media page at 24 to keep the initial paint
    // under ~25 preview fetches (the signed-URL Cloudflare pipeline
    // is bandwidth-bound, and a 48-row page routinely produced bursts
    // of 401/proxy-redirect retries on a cold cache). Users can still
    // widen the page with `?size=48` if they want a denser grid.
    pageSize: 24,
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
      mode="agency"
      workspace={
        activeWorkspace
          ? { id: activeWorkspace.id, name: activeWorkspace.name, slug: activeWorkspace.slug }
          : null
      }
      agencyWorkspaces={writableOptions.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      }))}
      rows={mediaPage.rows}
      basePath="/app/media"
      selectedFolderId={selectedFolderId}
      sharedOnly={filters.shared === "1"}
      preserveParams={{
        ...(filters.q ? { q: filters.q } : {}),
        ...(filters.kind ? { kind: filters.kind } : {}),
        ...(filters.trash === "1" ? { trash: "1" } : {}),
        ...(filters.view ? { view: filters.view } : {}),
        ...(sort !== "name" ? { sort } : {}),
      }}
      managerWorkspaceIds={managerWorkspaceIds}
      canUpload={writable.some(Boolean) && Boolean(activeWorkspace)}
      includeTrashed={filters.trash === "1"}
      view={filters.view === "list" ? "list" : "grid"}
      search={filters.q ?? ""}
      kind={filters.kind ?? ""}
      sort={sort}
      pageInfo={mediaPage}
      t={t}
      storageSummary={{
        mode: storageSummary.mode,
        bucket: storageSummary.bucket,
        keyPrefix: storageSummary.keyPrefix,
      }}
      folderTree={folderTree}
      ancestors={ancestors}
      activeFolderLabel={activeFolderLabel}
    />
  );
}

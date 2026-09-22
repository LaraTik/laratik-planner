import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { canWriteToWorkspace, hasWorkspaceRole } from "@/lib/auth/policy";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
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

export default async function WorkspaceMediaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    q?: string;
    kind?: string;
    trash?: string;
    view?: string;
    source?: string;
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
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace(actor, slug);
  if (!workspace) notFound();
  const filters = await searchParams;
  const folders = await listMediaFolders(actor, {
    agencyId: workspace.agencyId,
    workspaceId: workspace.id,
  });
  const folderTree = await listMediaFoldersTree(actor, {
    agencyId: workspace.agencyId,
    workspaceId: workspace.id,
  });
  const selectedFolderId = filters.folder ?? "";
  const sort: MediaSort =
    filters.sort === "uploadedAt" || filters.sort === "updatedAt" ? filters.sort : "name";
  const page = Math.max(Number.parseInt(filters.page ?? "1", 10) || 1, 1);
  const mediaPage = await listMediaAssetsPage(actor, {
    agencyId: workspace.agencyId,
    workspaceId: workspace.id,
    ...(filters.q ? { query: filters.q } : {}),
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(selectedFolderId
      ? { folderId: selectedFolderId === "unfiled" ? null : selectedFolderId }
      : {}),
    ...(filters.shared === "1" ? { sharedOnly: true } : {}),
    includeTrashed: filters.trash === "1",
    sort,
    page,
    pageSize: 48,
  });
  const storageSummary = await getAgencyStorageSummary(workspace.agencyId);

  // PR 3 / Tier 3 (perf/media): issue R2 signed URLs so the browser
  // downloads preview variants straight from the Cloudflare edge instead
  // of streaming them through this Node process. The batch helper keeps
  // the page to one preview-object query and one storage-context lookup;
  // the signer reuses URLs during their safe 15-minute lifetime.
  const { getSignedPreviewUrls } = await import("@/lib/media/thumbnails");
  const signedPreviewUrls = await getSignedPreviewUrls(
    mediaPage.rows.map((row) => ({
      assetId: row.asset.id,
      agencyId: row.asset.agencyId,
      workspaceId: row.asset.ownerWorkspaceId,
      previewStorageObjectId: row.object.previewStorageObjectId,
    })),
  );

  // Resolve the active folder's ancestor chain for the breadcrumb.
  const ancestors: { id: string; name: string }[] = [];
  const folderById = new Map(folders.map((f) => [f.id, f]));
  let cursor = folderById.get(selectedFolderId);
  while (cursor && cursor.parentId) {
    const parent = folderById.get(cursor.parentId);
    if (!parent) break;
    ancestors.unshift({ id: parent.id, name: parent.name });
    cursor = parent;
  }
  const activeFolderLabel =
    selectedFolderId === "unfiled"
      ? t("media.unfiled")
      : filters.shared === "1"
        ? t("media.agencySharedFilter")
        : (folders.find((f) => f.id === selectedFolderId)?.name ?? t("media.allMedia"));

  // Attach the signed URL onto each row so the MediaLibraryPage can emit it
  // directly without re-querying. Rows without a preview keep the proxy
  // fallback used for legacy or not-yet-generated variants.
  const rowsWithSignedUrl = mediaPage.rows.map((row) => ({
    ...row,
    signedPreviewUrl: signedPreviewUrls.get(row.asset.id) ?? null,
  }));

  return (
    <MediaLibraryPage
      mode="workspace"
      workspace={{ id: workspace.id, name: workspace.name, slug: workspace.slug }}
      agencyWorkspaces={[]}
      rows={rowsWithSignedUrl}
      basePath={`/app/w/${workspace.slug}/media`}
      selectedFolderId={selectedFolderId}
      sharedOnly={filters.shared === "1"}
      preserveParams={{
        ...(filters.q ? { q: filters.q } : {}),
        ...(filters.kind ? { kind: filters.kind } : {}),
        ...(filters.trash === "1" ? { trash: "1" } : {}),
        ...(filters.view ? { view: filters.view } : {}),
        ...(filters.source ? { source: filters.source } : {}),
        ...(sort !== "name" ? { sort } : {}),
      }}
      managerWorkspaceIds={
        (await hasWorkspaceRole(actor, workspace.id, ["workspace_manager"])) ? [workspace.id] : []
      }
      canUpload={await canWriteToWorkspace(actor, workspace.id)}
      includeTrashed={filters.trash === "1"}
      view={filters.view === "list" ? "list" : "grid"}
      search={filters.q ?? ""}
      kind={filters.kind ?? ""}
      sort={sort}
      pageInfo={mediaPage}
      initialSource={filters.source === "link" ? "link" : "device"}
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

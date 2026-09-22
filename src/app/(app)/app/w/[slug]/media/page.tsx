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

  // PR 3 / Tier 3 (perf/media): issue per-row R2 signed URLs so the
  // browser downloads the preview variant straight from the
  // Cloudflare edge instead of streaming through this Node process.
  // For 48 rows that's 48 HMAC sigs (~10-30µs each locally, sub-ms
  // for the whole batch). The signed URLs are short-lived (15 min,
  // the adapter's max — see `r2-adapter.ts:143`) so we re-sign on
  // every page render; the browser caches the bytes by URL + ETag
  // within that window. `getSignedPreviewUrl` returns null when
  // the asset has no preview yet or the caller can't read it — the
  // components fall back to `/api/media/assets/[id]/preview`.
  const { getSignedPreviewUrl } = await import("@/lib/media/thumbnails");
  const signedPreviewUrls = await Promise.all(
    mediaPage.rows.map((row) => getSignedPreviewUrl(actor, row.asset.id)),
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

  // Attach the signed URL onto each row so the MediaLibraryPage can
  // emit it directly without re-querying. `Object.assign` keeps the
  // original row's reference (the component's `MediaRow` extends
  // the service's return type).
  const rowsWithSignedUrl = mediaPage.rows.map((row, index) => ({
    ...row,
    signedPreviewUrl: signedPreviewUrls[index] ?? null,
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

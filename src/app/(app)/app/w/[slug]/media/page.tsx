import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { canWriteToWorkspace, hasWorkspaceRole } from "@/lib/auth/policy";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { listMediaAssets } from "@/lib/media/service";
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
  searchParams: Promise<{ q?: string; kind?: string; trash?: string; view?: string }>;
}) {
  const { t } = await tForActive();
  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace(actor, slug);
  if (!workspace) notFound();
  const filters = await searchParams;
  const rows = await listMediaAssets(actor, {
    agencyId: workspace.agencyId,
    workspaceId: workspace.id,
    ...(filters.q ? { query: filters.q } : {}),
    ...(filters.kind ? { kind: filters.kind } : {}),
    includeTrashed: filters.trash === "1",
  });
  const storageSummary = await getAgencyStorageSummary(workspace.agencyId);

  return (
    <MediaLibraryPage
      title={workspace.name}
      description={t("media.workspaceDescription", { workspace: workspace.name })}
      rows={rows}
      workspaceOptions={[workspace]}
      managerWorkspaceIds={
        (await hasWorkspaceRole(actor, workspace.id, ["workspace_manager"])) ? [workspace.id] : []
      }
      canUpload={await canWriteToWorkspace(actor, workspace.id)}
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

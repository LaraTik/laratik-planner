import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { hasWorkspaceRole, INTERNAL_WORKSPACE_ROLES } from "@/lib/auth/policy";
import { getAccessibleWorkspaceAtPath } from "@/lib/workspaces/context";
import { workspaceBasePath } from "@/lib/urls";
import { getAdvertisingReportShare } from "@/lib/advertising/reporting-metadata-service";
import {
  advertisingReportViewConfigSchema,
  advertisingReportViewConfigToSearchParams,
} from "@/lib/advertising/reporting-view-config";
import { tForActive } from "@/lib/i18n/t-for-active";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: t("advertising.reporting.title") };
}

export default async function AdvertisingSharedReportPage({
  params,
}: {
  params: Promise<{ agencySlug: string; slug: string; token: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const { agencySlug, slug, token } = await params;
  const workspace = await getAccessibleWorkspaceAtPath({ id: session.user.id }, agencySlug, slug);
  if (!workspace || !(await hasWorkspaceRole(actor, workspace.id, [...INTERNAL_WORKSPACE_ROLES])))
    notFound();
  const share = await getAdvertisingReportShare(token);
  if (!share || share.workspaceId !== workspace.id || share.agencyId !== workspace.agencyId)
    notFound();
  const parsed = advertisingReportViewConfigSchema.safeParse(share.viewConfig);
  if (!parsed.success || parsed.data.accountId !== share.accountId) notFound();
  const query = advertisingReportViewConfigToSearchParams(parsed.data);
  redirect(`${workspaceBasePath(agencySlug, slug)}/analytics/advertising?${query.toString()}`);
}

import { redirect } from "next/navigation";
import { workspaceBasePath } from "@/lib/urls";

/**
 * Legacy deep-link compatibility route. The canonical settings
 * surface is the combined page with an anchor for Approval mode.
 */
export default async function SettingsApprovalsPage({
  params,
}: {
  params: Promise<{ agencySlug: string; slug: string }>;
}) {
  const { agencySlug, slug } = await params;
  redirect(`${workspaceBasePath(agencySlug, slug)}/settings#approvals`);
}

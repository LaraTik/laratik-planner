import { redirect } from "next/navigation";

/**
 * Legacy deep-link compatibility route. The canonical settings
 * surface is the combined page with an anchor for Approval mode.
 */
export default async function SettingsApprovalsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/app/w/${slug}/settings#approvals`);
}

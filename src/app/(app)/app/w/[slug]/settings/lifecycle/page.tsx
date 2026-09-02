import { redirect } from "next/navigation";

/**
 * Legacy deep-link compatibility route. The canonical settings
 * surface is the combined page with an anchor for Lifecycle.
 */
export default async function SettingsLifecyclePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/app/w/${slug}/settings#lifecycle`);
}

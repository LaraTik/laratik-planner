import { redirect } from "next/navigation";

/**
 * Legacy deep-link compatibility route. The canonical settings
 * surface is the combined page with an anchor for Assignment
 * defaults.
 */
export default async function SettingsDefaultsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/app/w/${slug}/settings#defaults`);
}

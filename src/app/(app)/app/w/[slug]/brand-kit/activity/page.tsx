import { redirect } from "next/navigation";

/**
 * One-line redirect shim. The Activity feed moved out of brand-kit
 * to `/app/w/[slug]/activity` (per Round 2 of ui-ux-pro-max /
 * Team & Access scope expansion). Old deep links should land in the
 * same workspace-wide feed rather than 404.
 *
 * NOTE: This file intentionally keeps no UI. It's a server-side
 * redirect so existing emails / Slack links keep resolving.
 */
export default async function BrandKitActivityRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/app/w/${slug}/activity`);
}

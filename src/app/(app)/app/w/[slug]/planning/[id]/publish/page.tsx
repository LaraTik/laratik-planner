import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { tForActive } from "@/lib/i18n/t-for-active";

/**
 * Phase 7 of the planning-detail refactor (2026-08-30):
 * the standalone `/publish` route was absorbed into the
 * Publishing tab. This page is kept as a server-side redirect
 * so existing deep-links (E2E specs, internal bookmarks,
 * outbound emails) keep working. The target is the planning
 * detail page with the `publishing` hash, which the
 * `WorkspaceShell` listens to and renders the Publishing
 * panel.
 *
 * The redirect happens after the standard auth + workspace
 * gates so a stale link from a logged-out user lands on
 * `/signin` instead of the public detail page.
 */

export const dynamic = "force-dynamic";

export default async function PublishPackageRedirectPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { t } = await tForActive();
  const { slug, id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const ws = await getAccessibleWorkspace(actor, slug);
  if (!ws) {
    // The original page used notFound() here. The redirect
    // target would be the same not-found if the workspace is
    // gone, so we 404 instead of bouncing to a public page.
    return (
      <div className="space-y-4">
        <p className="text-body text-fg-muted">
          {t("contentDetail.publish.redirectFallbackMessage")}
        </p>
        <Link
          href={`/app/w/${slug}/planning/${id}`}
          className="text-primary underline-offset-4 hover:underline"
        >
          {t("contentDetail.publish.redirectFallbackBack")}
        </Link>
      </div>
    );
  }

  redirect(`/app/w/${slug}/planning/${id}#publishing`);
}

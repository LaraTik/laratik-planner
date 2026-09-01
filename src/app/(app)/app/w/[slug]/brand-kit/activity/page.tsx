import { redirect, notFound } from "next/navigation";
import { History } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { listRecentBrandUpdates } from "@/lib/brand/service";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { SectionCard } from "@/components/workspace/section-card";
import { BrandKitBackLink } from "../_components/brand-kit-back-link";
import { RecentUpdatesTable } from "../recent-updates-table";

/**
 * /app/w/[slug]/brand-kit/activity — the Recent Updates page
 * (Phase 7). Was row 6 of the Bento grid; promoted to its own
 * route so the activity feed has room to grow (per-actor
 * filter, type filter, date range) without bloating the overview.
 *
 * Read-only for every workspace role; the list comes from
 * `listRecentBrandUpdates` which already merges the four brand-kit
 * tables and joins each row's actor.
 */
export default async function BrandKitActivityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { t } = await tForActive();
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();

  const recent = await listRecentBrandUpdates(workspace.id);

  return (
    <div className="space-y-6">
      <BrandKitBackLink slug={slug} />
      <PageHeader
        title={t("brandKit.activityTitle")}
        description={t("brandKit.activityDescription")}
      />

      <SectionCard
        id="activity"
        title={
          <>
            <History className="text-fg-secondary h-4 w-4" aria-hidden="true" />
            Recent updates
          </>
        }
        count={recent.length}
        fullWidth
        aria-label="Recent updates"
        data-testid="brand-kit-section-activity"
      >
        <RecentUpdatesTable rows={recent} />
      </SectionCard>
    </div>
  );
}

import { notFound, redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { researchTeardowns, trendSignals } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/workspace/page-header";
import Link from "next/link";
import { getAccessibleWorkspaceAtPath } from "@/lib/workspaces/context";
import { QuickCreateForm } from "./quick-create-form";
import { tForActive } from "@/lib/i18n/t-for-active";
import { querySocialPostObservation } from "@/lib/social/analytics-query";
import { z } from "zod";
import { ResearchTeardownSchema } from "@/lib/research/teardown";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ agencySlug: string; slug: string }>;
}) {
  const { slug } = await params;
  const { t } = await tForActive();
  return { title: t("quickCreate.metaTitle", { slug }) };
}

export default async function QuickCreatePage({
  params,
  searchParams,
}: {
  params: Promise<{ agencySlug: string; slug: string }>;
  searchParams?: Promise<{
    trendSignalId?: string;
    researchPostObservationId?: string;
    researchTeardownId?: string;
  }>;
}) {
  const { agencySlug, slug } = await params;
  const query = (await searchParams) ?? {};
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const ws = await getAccessibleWorkspaceAtPath({ id: session.user.id }, agencySlug, slug);
  if (!ws) notFound();
  const { t } = await tForActive();
  if (
    !(await hasWorkspaceRole({ id: session.user.id }, ws.id, [
      "workspace_manager",
      "content_planner",
    ]))
  ) {
    return (
      <div className="space-y-4">
        <PageHeader
          title={t("quickCreate.deniedTitle")}
          description={t("quickCreate.deniedDescription")}
        />
        <Button asChild variant="ghost">
          <Link href={`/app/w/${slug}/planning`}>{t("quickCreate.backToPlanning")}</Link>
        </Button>
      </div>
    );
  }

  const trendSignal = query.trendSignalId
    ? (
        await db
          .select({ id: trendSignals.id, label: trendSignals.label })
          .from(trendSignals)
          .where(and(eq(trendSignals.id, query.trendSignalId), eq(trendSignals.workspaceId, ws.id)))
          .limit(1)
      )[0]
    : null;

  const researchObservationId = z.string().uuid().safeParse(query.researchPostObservationId);
  const researchPost = researchObservationId.success
    ? await querySocialPostObservation(db, ws.id, researchObservationId.data)
    : null;
  const researchTeardownId = z.string().uuid().safeParse(query.researchTeardownId);
  const researchTeardownRow = researchTeardownId.success
    ? (
        await db
          .select({ id: researchTeardowns.id, result: researchTeardowns.result })
          .from(researchTeardowns)
          .where(
            and(
              eq(researchTeardowns.id, researchTeardownId.data),
              eq(researchTeardowns.workspaceId, ws.id),
            ),
          )
          .limit(1)
      )[0]
    : null;
  const researchTeardown = researchTeardownRow
    ? ResearchTeardownSchema.safeParse(researchTeardownRow.result)
    : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="workspace-planning-new">
      <PageHeader
        title={t("quickCreate.title")}
        description={
          <>
            {t("quickCreate.description")}
            <span className="text-label text-fg-muted border-border bg-surface-subtle ms-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {ws.timezone}
            </span>
          </>
        }
      />
      <QuickCreateForm
        workspaceSlug={slug}
        workspaceTimezone={ws.timezone}
        {...(trendSignal ? { trendSignal } : {})}
        {...(researchPost ? { researchPost } : {})}
        {...(researchTeardown?.success
          ? { researchTeardown: { id: researchTeardownRow!.id, ...researchTeardown.data } }
          : {})}
      />
    </div>
  );
}

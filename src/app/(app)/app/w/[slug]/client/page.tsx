import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { approvalRequests, contentItems, deliveryLinks, deliveryVersions } from "@/lib/db/schema";
import { getClientWorkspace } from "@/lib/workspaces/context";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/workspace/page-header";
import { ClientReviewCard } from "./client-review-card";

export default async function ClientReviewPortalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getClientWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["client_reviewer"])))
    notFound();
  // Deliberately select only client-safe columns. Internal comments, activity,
  // assignments, internal gates, and private notes never enter this result.
  const rows = await db
    .select({
      requestId: approvalRequests.id,
      contentId: contentItems.id,
      title: contentItems.title,
      format: contentItems.format,
      plannedPublishAt: contentItems.plannedPublishAt,
      dueAt: approvalRequests.dueAt,
      deliveryVersionId: approvalRequests.deliveryVersionId,
      deliveryVersion: deliveryVersions.versionNumber,
      deliveryDescription: deliveryVersions.description,
    })
    .from(approvalRequests)
    .innerJoin(contentItems, eq(contentItems.id, approvalRequests.contentItemId))
    .leftJoin(deliveryVersions, eq(deliveryVersions.id, approvalRequests.deliveryVersionId))
    .where(
      and(
        eq(contentItems.workspaceId, workspace.id),
        eq(approvalRequests.gate, "creative_client"),
        eq(approvalRequests.status, "pending"),
        isNull(approvalRequests.invalidatedAt),
      ),
    );
  const versionIds = rows
    .map((row) => row.deliveryVersionId)
    .filter((id): id is string => Boolean(id));
  const links = versionIds.length
    ? await db
        .select({
          id: deliveryLinks.id,
          deliveryVersionId: deliveryLinks.deliveryVersionId,
          label: deliveryLinks.label,
          url: deliveryLinks.url,
        })
        .from(deliveryLinks)
        .where(inArray(deliveryLinks.deliveryVersionId, versionIds))
    : [];
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={workspace.name}
        title="Client review"
        description="Creative deliveries waiting for your decision."
        action={
          <Link
            href={`/app/w/${slug}/client/calendar`}
            className="border-border bg-surface text-body hover:bg-surface-subtle inline-flex min-h-11 items-center rounded-[var(--radius-control)] border px-3 py-2 font-semibold transition-colors"
          >
            View calendar
          </Link>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <ClientReviewCard
            key={row.requestId}
            workspaceSlug={slug}
            requestId={row.requestId}
            title={row.title}
            deliveryDescription={row.deliveryDescription || "Creative delivery"}
            deliveryVersion={row.deliveryVersion}
            plannedPublishAt={row.plannedPublishAt.toISOString()}
            overdue={Boolean(row.dueAt && row.dueAt < new Date())}
            links={links.filter((link) => link.deliveryVersionId === row.deliveryVersionId)}
          />
        ))}
      </div>
      {rows.length === 0 ? (
        <Card padding="lg" className="text-body text-fg-secondary text-center">
          No client reviews are waiting.
        </Card>
      ) : null}
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { hasWorkspaceRole, isAgencyAdmin } from "@/lib/auth/policy";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { getContentItem } from "@/lib/content/service";
import { listDeliveryVersionsForItem } from "@/lib/deliveries/service";
import {
  evaluateReadiness,
  readAllChannelPayloads,
  type ReadinessReport,
  type ReadinessIssue,
} from "@/lib/publishing";
import { mapFormatPayloadToPlatform } from "@/lib/format-payload/mapper";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/workspace/page-header";
import { PublishPackageForm } from "./publish-package-form";

/**
 * M4 — Publish-ready Post and Reel packages route.
 *
 * URL: `/app/w/[slug]/planning/[id]/publish`
 *
 * The page is gated by the (app) layout's auth + workspace
 * resolution. The layout re-validates the workspace on every
 * request; this page adds the content-item + channel
 * readback + readiness evaluation.
 *
 * Layout:
 *
 *   - Desktop (md+): 3-column grid.
 *     Left   = destination profile, schedule, caption/discovery
 *              and platform fields (the per-channel form).
 *     Center = media, accessibility, disclosures and
 *              interaction settings.
 *     Right  = platform preview + publishing-readiness summary.
 *   - Mobile: stacked single column. The first block is the
 *     readiness summary (above the fold), then the per-channel
 *     form, then the preview. Sticky bottom action bar with
 *     Save draft and Ready for publishing.
 *
 * The form is a client component (`PublishPackageForm`) so the
 * user can edit each channel independently; the server action
 * (`savePublishPackageAction`) re-validates and persists the
 * discriminated-union payload.
 */

export async function generateMetadata() {
  return { title: "Publish package" };
}

export const dynamic = "force-dynamic";

export default async function PublishPackagePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const ws = await getAccessibleWorkspace(actor, slug);
  if (!ws) notFound();
  const item = await getContentItem(actor, id);
  if (!item) notFound();
  if (item.workspaceId !== ws.id) notFound();

  const [deliveryVersions, channelPayloads, canEdit, canConfirmReadiness, canApproveFinalCopy] =
    await Promise.all([
      listDeliveryVersionsForItem(actor, id),
      readAllChannelPayloads({
        actor,
        workspaceId: ws.id,
        contentItemId: id,
      }),
      hasWorkspaceRole(actor, ws.id, ["workspace_manager", "content_planner"]),
      hasWorkspaceRole(actor, ws.id, ["workspace_manager", "content_planner", "publisher"]),
      isAgencyAdmin(actor, ws.agencyId),
    ]);

  const readiness: ReadinessReport = await evaluateReadiness({
    actor,
    workspaceId: ws.id,
    contentItemId: id,
  });

  return (
    <div className="space-y-6" data-testid="publish-package-root">
      <Link
        href={`/app/w/${slug}/planning/${id}`}
        className="text-primary focus-visible:ring-focus-ring text-body inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
        data-testid="publish-back"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to content
      </Link>

      <PageHeader
        title="Publish package"
        description={`Configure the per-channel publish package for "${item.title}". Material edits reset approvals and increment the revision.`}
      />

      {/* Readiness summary — at the top on every viewport */}
      <Card padding="lg" data-testid="publish-readiness-summary">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>
              {readiness.canPublish
                ? "Ready for publishing"
                : `${readiness.blockers} blocker${readiness.blockers === 1 ? "" : "s"}`}
            </CardTitle>
            <CardDescription>
              {readiness.requiredCompleted} of {readiness.requiredTotal} required items complete ·{" "}
              {readiness.recommendations} recommendation
              {readiness.recommendations === 1 ? "" : "s"} · revision {readiness.revision}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {readiness.canPublish ? (
              <Badge variant="success" data-testid="publish-ready-badge">
                <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" />
                Ready
              </Badge>
            ) : (
              <Badge variant="danger" data-testid="publish-blocked-badge">
                <XCircle className="mr-1 h-3 w-3" aria-hidden="true" />
                Blocked
              </Badge>
            )}
            {readiness.recommendations > 0 ? (
              <Badge variant="warning">
                <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
                {readiness.recommendations} tip
                {readiness.recommendations === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>
        </div>
        {readiness.issues.length > 0 ? (
          <ul
            className="border-border mt-3 max-h-48 overflow-y-auto rounded-[var(--radius-control)] border p-2 text-sm"
            data-testid="publish-issues-list"
          >
            {(readiness.issues as ReadinessIssue[]).map((issue: ReadinessIssue, i: number) => (
              <li
                key={`${issue.path}-${i}`}
                className="flex items-start gap-2 py-1"
                data-testid={`publish-issue-${issue.code}`}
              >
                {issue.severity === "blocker" ? (
                  <XCircle className="text-danger mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertTriangle
                    className="text-warning mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span>
                  <code className="text-label text-fg-muted">{issue.path}</code>
                  <span className="text-body text-fg-primary ml-2">{issue.message}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <PublishPackageForm
        workspaceId={ws.id}
        workspaceSlug={slug}
        contentItemId={id}
        itemTitle={item.title}
        itemFormat={item.format}
        formatPayloadPreFill={mapFormatPayloadToPlatform({
          format: item.format,
          formatPayload: (item as { formatPayload?: unknown }).formatPayload,
        })}
        channels={item.channels.map((c) => ({
          id: c.id,
          socialChannelId: c.socialChannelId,
          platform: c.platform,
          accountName: c.accountName,
          payload: channelPayloads[c.socialChannelId] ?? null,
        }))}
        deliveryVersions={deliveryVersions.map((d) => ({
          id: d.id,
          versionNumber: d.versionNumber,
          isFinalApproved: d.isFinalApproved,
        }))}
        readiness={readiness}
        canEdit={canEdit}
        canApproveFinalCopy={canApproveFinalCopy}
        canConfirmReadiness={canConfirmReadiness}
      />
    </div>
  );
}

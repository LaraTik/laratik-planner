import { redirect, notFound } from "next/navigation";
import { inArray } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { listUnassignedDesignWork } from "@/lib/content/service";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { PageHeader } from "@/components/workspace/page-header";
import { Clock } from "lucide-react";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { DesignQueueList, type DesignQueueListItem } from "./design-queue-list";

/**
 * /ui-ux-pro-max P3.2 — the design queue answers
 * "what creative work can / should a designer pick up?",
 * not "which items are unassigned?". The page passes the
 * designer-facing context (format, brief excerpt, brief
 * readiness, owner) per row so the card can show the
 * fields a designer needs to triage at a glance.
 */
function briefExcerpt(brief: string | null | undefined): string | null {
  if (!brief) return null;
  const trimmed = brief.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > 140 ? `${trimmed.slice(0, 137).trimEnd()}…` : trimmed;
}

export default async function DesignQueuePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  // FEAT-12 (GAP-FULL-REVIEW-2026-08-25) — delegate to the
  // canonical §14 `listUnassignedDesignWork` query so the page
  // picks up the role-gate, future cursor support, and any
  // downstream filters without further changes here.
  const rows = await listUnassignedDesignWork({ id: session.user.id }, workspace.id);
  // FEAT-14 (GAP-FULL-REVIEW-2026-08-25) — only the planner /
  // manager sees the bulk-action toolbar. Designers still see
  // the queue (so they can claim) but cannot archive in bulk.
  const canBulkArchive = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    "workspace_manager",
    "content_planner",
  ]);

  // Owner name resolution (P3.2). One extra round-trip for
  // every distinct owner id in the unassigned set. The set
  // is bounded by `listUnassignedDesignWork`'s 200-row cap
  // so the IN-clause stays well under the index page size.
  const ownerIds = Array.from(
    new Set(
      rows
        .map((r) => r.contentOwnerId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const ownerRows =
    ownerIds.length > 0
      ? await db
          .select({ id: users.id, displayName: users.displayName, name: users.name })
          .from(users)
          .where(inArray(users.id, ownerIds))
      : [];
  const ownerById = new Map(ownerRows.map((o) => [o.id, o.displayName ?? o.name ?? null]));

  const items: DesignQueueListItem[] = rows.map((r) => {
    const brief = briefExcerpt(r.brief);
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      plannedPublishAtIso: r.plannedPublishAt.toISOString(),
      href: `/app/w/${slug}/planning/${r.id}`,
      format: r.format,
      briefExcerpt: brief,
      ownerDisplayName: r.contentOwnerId ? (ownerById.get(r.contentOwnerId) ?? null) : null,
      updatedAtIso: r.updatedAt.toISOString(),
      briefIsEmpty: !brief,
    };
  });
  return (
    <div className="space-y-6" data-testid="workspace-design-queue">
      <PageHeader
        eyebrow={workspace.name}
        title="Unassigned design queue"
        description={
          <>
            Approved ideas waiting for a designer to claim or be assigned.
            <span className="text-label text-fg-muted border-border bg-surface-subtle ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
      />
      <DesignQueueList workspaceId={workspace.id} items={items} canBulkArchive={canBulkArchive} />
    </div>
  );
}

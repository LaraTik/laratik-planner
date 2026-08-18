import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { isWorkspaceMember } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { listWorkspaceContent } from "@/lib/content/service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { Plus, FileText } from "lucide-react";

/**
 * Planning list (Goal 6 master prompt §3 Monthly Planning List).
 *
 * Shows the current month's content for the workspace, ordered by
 * planned publish date. Defaults to "all" status; status filter is a
 * later enhancement.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return { title: `Planning · ${(await params).slug}` };
}

export default async function PlanningPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, slug)).limit(1);
  if (!ws) notFound();

  const isMember = await isWorkspaceMember({ id: session.user.id }, ws.id);
  if (!isMember) {
    return (
      <div className="space-y-4">
        <h1 className="text-title-page text-fg-primary font-semibold">No access</h1>
        <p className="text-body text-fg-secondary">You&apos;re not a member of this workspace.</p>
        <Link href="/app/workspaces" className="text-primary underline-offset-4 hover:underline">
          ← Back to Workspaces
        </Link>
      </div>
    );
  }

  // Default view: current month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const items = await listWorkspaceContent({ id: session.user.id }, ws.id, {
    monthStart,
    monthEnd,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-label text-fg-muted">{ws.name}</p>
          <h1 className="text-title-page text-fg-primary font-semibold">Planning</h1>
          <p className="text-body text-fg-secondary mt-1">
            {now.toLocaleString("default", { month: "long", year: "numeric" })} · {items.length}{" "}
            item
            {items.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button asChild>
          <Link href={`/app/w/${slug}/planning/new`}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Quick Create
          </Link>
        </Button>
      </header>

      {items.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" aria-hidden="true" />}
          title="Nothing planned for this month"
          description="Use Quick Create to add a draft — it'll show up here ready to schedule."
          action={
            <Button asChild>
              <Link href={`/app/w/${slug}/planning/new`}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Quick Create
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="border-border bg-surface divide-border divide-y overflow-hidden rounded-[var(--radius-card)] border">
          {items.map((it) => (
            <li
              key={it.id}
              className="hover:bg-surface-subtle flex items-center gap-4 px-4 py-3 transition"
            >
              <FileText className="text-fg-muted h-4 w-4" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/app/w/${slug}/planning/${it.id}`}
                  className="text-body text-fg-primary block truncate font-semibold"
                >
                  {it.title}
                </Link>
                <p className="text-label text-fg-muted">
                  {it.format.replace(/_/g, " ")} · {it.plannedPublishAt.toLocaleDateString()}
                </p>
              </div>
              <Badge variant={statusVariant(it.status)}>{it.status.replace(/_/g, " ")}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statusVariant(
  s: string,
): "default" | "primary" | "success" | "warning" | "danger" | "info" {
  if (s === "published" || s === "ready_to_publish") return "success";
  if (s === "blocked" || s === "cancelled") return "danger";
  if (s === "changes_requested") return "warning";
  if (s === "in_design" || s === "creative_review" || s === "content_review") return "info";
  if (s === "partially_published" || s === "approved_for_design") return "primary";
  return "default";
}

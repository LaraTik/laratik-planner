import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { activeAgencyId, isWorkspaceMember } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { contentItems, workspaces } from "@/lib/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { Calendar, FileText, Sparkles } from "lucide-react";

/**
 * Workspace Overview — the master prompt's "Workspace Overview" screen.
 * For Goal 3, this is a placeholder: shows the workspace name, member
 * count, and a "coming soon" note for the other workspace screens.
 * Goal 6 wires in real planning + calendar.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: slug };
}

export default async function WorkspaceOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const agencyId = await activeAgencyId();
  if (!agencyId) redirect("/setup");

  const [ws] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.slug, slug), eq(workspaces.agencyId, agencyId)))
    .limit(1);
  if (!ws) notFound();

  const isMember = await isWorkspaceMember({ id: session.user.id }, ws.id);
  if (!isMember) {
    return (
      <div className="space-y-4">
        <h1 className="text-title-page text-fg-primary font-semibold">No access</h1>
        <p className="text-body text-fg-secondary">
          You&apos;re not a member of this workspace. Ask an admin to add you.
        </p>
        <Link href="/app/workspaces" className="text-primary underline-offset-4 hover:underline">
          ← Back to Workspaces
        </Link>
      </div>
    );
  }

  // Recent items in the workspace (for the Overview card)
  const recentItems = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      status: contentItems.status,
      plannedPublishAt: contentItems.plannedPublishAt,
    })
    .from(contentItems)
    .where(and(eq(contentItems.workspaceId, ws.id), isNull(contentItems.archivedAt)))
    .orderBy(desc(contentItems.plannedPublishAt))
    .limit(8);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-label text-fg-muted">Workspace</p>
          <h1 className="text-title-page text-fg-primary font-semibold">{ws.name}</h1>
          <p className="text-body text-fg-secondary mt-1">{ws.timezone}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/app/w/${slug}/planning`}
            className="border-border bg-surface text-fg-primary hover:bg-surface-subtle text-body rounded-[var(--radius-control)] border px-3 py-1.5 font-semibold transition"
          >
            Planning
          </Link>
          <Link
            href={`/app/w/${slug}/calendar`}
            className="border-border bg-surface text-fg-primary hover:bg-surface-subtle text-body rounded-[var(--radius-control)] border px-3 py-1.5 font-semibold transition"
          >
            Calendar
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="border-border bg-surface rounded-[var(--radius-card)] border p-5">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-title-card text-fg-primary font-semibold">Recent items</h2>
            <Link
              href={`/app/w/${slug}/planning`}
              className="text-label text-primary underline-offset-4 hover:underline"
            >
              View all →
            </Link>
          </header>
          {recentItems.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-8 w-8" aria-hidden="true" />}
              title="No content yet"
              description="Once someone in this workspace creates a draft, it'll show up here."
            />
          ) : (
            <ul className="divide-border divide-y">
              {recentItems.map((it) => (
                <li key={it.id} className="text-body flex items-center gap-3 py-2">
                  <FileText className="text-fg-muted h-4 w-4" aria-hidden="true" />
                  <Link
                    href={`/app/w/${slug}/content/${it.id}`}
                    className="text-fg-primary flex-1 truncate font-semibold"
                  >
                    {it.title}
                  </Link>
                  <span className="text-label text-fg-muted flex items-center gap-1">
                    <Calendar className="h-3 w-3" aria-hidden="true" />
                    {it.plannedPublishAt.toLocaleDateString()}
                  </span>
                  <Badge variant="default">{it.status.replace(/_/g, " ")}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border-border bg-surface rounded-[var(--radius-card)] border p-5">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-title-card text-fg-primary font-semibold">Plan coverage</h2>
            <Badge variant="info">Goal 6</Badge>
          </header>
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <Sparkles className="text-fg-muted h-8 w-8" aria-hidden="true" />
            <p className="text-body text-fg-secondary">
              Coverage and delivery health land in Goal 6.
            </p>
            <p className="text-label text-fg-muted">
              For now, this Overview shows recent activity + nav links.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

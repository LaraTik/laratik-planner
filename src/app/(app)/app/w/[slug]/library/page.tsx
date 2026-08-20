import { redirect, notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { campaigns, contentPillars, contentTemplates } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/workspace/page-header";

export default async function PlanningLibraryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const [campaignRows, pillars, templates] = await Promise.all([
    db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.workspaceId, workspace.id), isNull(campaigns.archivedAt))),
    db
      .select()
      .from(contentPillars)
      .where(and(eq(contentPillars.workspaceId, workspace.id), isNull(contentPillars.archivedAt))),
    db
      .select()
      .from(contentTemplates)
      .where(
        and(eq(contentTemplates.workspaceId, workspace.id), isNull(contentTemplates.archivedAt)),
      ),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={workspace.name}
        title="Planning library"
        description="Reusable campaigns, pillars, and content templates."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <LibrarySection title="Campaigns" empty="No campaigns yet">
          {campaignRows.map((row) => (
            <li
              key={row.id}
              className="border-border flex flex-wrap items-start justify-between gap-2 border-b py-3 last:border-0"
            >
              <span className="text-body font-semibold">{row.name}</span>
              <Badge variant={row.status === "active" ? "success" : "default"}>{row.status}</Badge>
              {row.objective ? (
                <p className="text-label text-fg-secondary w-full">{row.objective}</p>
              ) : null}
            </li>
          ))}
        </LibrarySection>
        <LibrarySection title="Content pillars" empty="No pillars yet">
          {pillars.map((row) => (
            <li key={row.id} className="border-border border-b py-3 last:border-0">
              <span className="text-body font-semibold">{row.name}</span>
              {row.description ? (
                <p className="text-label text-fg-secondary mt-1">{row.description}</p>
              ) : null}
            </li>
          ))}
        </LibrarySection>
        <LibrarySection title="Templates" empty="No templates yet">
          {templates.map((row) => (
            <li key={row.id} className="border-border border-b py-3 last:border-0">
              <span className="text-body font-semibold">{row.name}</span>
              <p className="text-label text-fg-secondary mt-1">{row.format.replace(/_/g, " ")}</p>
            </li>
          ))}
        </LibrarySection>
      </div>
    </div>
  );
}

function LibrarySection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <Card>
      <h2 className="text-title-card text-fg-primary mb-3 font-semibold">{title}</h2>
      {hasChildren ? <ul>{children}</ul> : <p className="text-body text-fg-muted mt-4">{empty}</p>}
    </Card>
  );
}

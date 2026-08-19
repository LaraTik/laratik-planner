import { redirect, notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { socialChannels } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { ScreenHeading } from "@/components/workspace/screen-heading";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { ExternalLink, Radio } from "lucide-react";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { ChannelForm } from "./channel-form";
import { archiveChannelAction } from "./actions";
import { Button } from "@/components/ui/button";

export default async function ChannelsPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const canManage = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    "workspace_manager",
  ]);
  const rows = await db
    .select()
    .from(socialChannels)
    .where(and(eq(socialChannels.workspaceId, workspace.id), isNull(socialChannels.archivedAt)));
  return (
    <div className="space-y-6">
      <ScreenHeading
        eyebrow={workspace.name}
        title="Social channels"
        description="Instagram, Facebook, TikTok, LinkedIn, YouTube, X, Pinterest, Threads, and custom accounts."
      />
      {canManage ? <ChannelForm slug={slug} /> : null}
      {rows.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <article
              key={row.id}
              className="border-border bg-surface rounded-[var(--radius-card)] border p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-body text-fg-primary font-semibold">{row.accountName}</p>
                  <p className="text-label text-fg-secondary mt-1">{row.handle || row.platform}</p>
                </div>
                <Badge variant={row.isActive ? "success" : "outline"}>
                  <Radio className="h-3 w-3" />
                  {row.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="mt-4 flex items-center justify-between">
                {row.url ? (
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-label text-primary inline-flex items-center gap-1"
                  >
                    Open account <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span />
                )}
                {canManage ? (
                  <form action={archiveChannelAction.bind(null, slug, row.id)}>
                    <Button size="sm" variant="ghost" type="submit">
                      Remove
                    </Button>
                  </form>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Radio className="h-8 w-8" />}
          title="No social channels"
          description="A workspace manager can add the brand’s accounts here."
        />
      )}
    </div>
  );
}

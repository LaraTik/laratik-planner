import { redirect, notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { socialChannels } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/workspace/page-header";
import { ExternalLink, Radio } from "lucide-react";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { ChannelForm } from "./channel-form";
import { archiveChannelAction } from "./actions";

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
      <PageHeader
        eyebrow={workspace.name}
        title="Social channels"
        description="Instagram, Facebook, TikTok, LinkedIn, YouTube, X, Pinterest, Threads, and custom accounts."
      />
      {canManage ? <ChannelForm slug={slug} /> : null}
      {rows.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <Card key={row.id}>
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
              <div className="mt-4 flex items-center justify-between gap-2">
                {row.url ? (
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-label text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline"
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
            </Card>
          ))}
        </div>
      ) : (
        <Card variant="dashed" padding="lg">
          <EmptyState
            icon={<Radio className="h-8 w-8" />}
            title="No social channels"
            description="A workspace manager can add the brand’s accounts here."
          />
        </Card>
      )}
    </div>
  );
}

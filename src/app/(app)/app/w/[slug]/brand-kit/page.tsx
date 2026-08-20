import { redirect, notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { brandAssets, brandVoiceRules } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/workspace/page-header";
import { Palette } from "lucide-react";

export default async function BrandKitPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const [assets, rules] = await Promise.all([
    db
      .select()
      .from(brandAssets)
      .where(and(eq(brandAssets.workspaceId, workspace.id), isNull(brandAssets.archivedAt))),
    db.select().from(brandVoiceRules).where(eq(brandVoiceRules.workspaceId, workspace.id)),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={workspace.name}
        title="Brand kit"
        description="The shared source for visual assets and writing guidance."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">Assets</CardTitle>
          {assets.length ? (
            <ul className="divide-border divide-y">
              {assets.map((asset) => (
                <li key={asset.id} className="flex items-center justify-between py-3">
                  <span className="text-body font-semibold">{asset.name}</span>
                  <Badge>{asset.kind}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<Palette className="h-7 w-7" />}
              title="No brand assets"
              description="Add logos, colors, fonts, guidelines, and references."
            />
          )}
        </Card>
        <Card>
          <CardTitle className="mb-3">Voice rules</CardTitle>
          {rules.length ? (
            <ul className="space-y-2">
              {rules.map((rule) => (
                <li key={rule.id} className="bg-surface-subtle rounded-[var(--radius-control)] p-3">
                  <Badge
                    variant={
                      rule.ruleType === "dont"
                        ? "danger"
                        : rule.ruleType === "do"
                          ? "success"
                          : "info"
                    }
                  >
                    {rule.ruleType}
                  </Badge>
                  <p className="text-body text-fg-primary mt-2">{rule.content}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-fg-muted mt-4">No voice guidance has been added.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

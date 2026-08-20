import { redirect, notFound } from "next/navigation";
import { and, count, eq, gte } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { aiUsageEvents } from "@/lib/db/schema";
import { serverEnv } from "@/lib/validation/env";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/workspace/page-header";
import { Bot, ShieldCheck } from "lucide-react";

export default async function AiSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"])))
    notFound();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);
  const [usage] = await db
    .select({ value: count() })
    .from(aiUsageEvents)
    .where(and(eq(aiUsageEvents.workspaceId, workspace.id), gte(aiUsageEvents.createdAt, since)));
  const enabled = serverEnv.AI_FEATURE_ENABLED && !!serverEnv.MINIMAX_API_KEY;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={workspace.name}
        title="AI settings"
        description="Environment-managed assistance with human-controlled insert and replace."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="text-primary h-5 w-5" />
              <CardTitle>MiniMax</CardTitle>
            </div>
            <Badge variant={enabled ? "success" : "outline"}>
              {enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
          <dl className="mt-5 space-y-3">
            <Row label="Model" value={serverEnv.MINIMAX_MODEL} />
            <Row
              label="Credential"
              value={serverEnv.MINIMAX_API_KEY ? "Configured by environment" : "Not configured"}
            />
            <Row label="Requests, last 30 days" value={String(usage?.value ?? 0)} />
          </dl>
        </Card>
        <Card>
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-success h-5 w-5" />
            <CardTitle>Safety boundary</CardTitle>
          </div>
          <ul className="text-body text-fg-secondary mt-4 list-disc space-y-2 pl-5">
            <li>AI can draft text but cannot change status, approve, or publish.</li>
            <li>Only allowlisted content fields are sent to the provider.</li>
            <li>
              Usage logs record categories and token counts, never full prompts or private comments.
            </li>
            <li>Rate limits protect both users and provider spend.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <dt className="text-body text-fg-secondary">{label}</dt>
      <dd className="text-body text-right font-semibold">{value}</dd>
    </div>
  );
}

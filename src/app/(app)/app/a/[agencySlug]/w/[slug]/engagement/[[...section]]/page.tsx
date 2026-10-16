import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { and, count, eq } from "drizzle-orm";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronRight,
  Database,
  FileCheck2,
  Filter,
  Inbox,
  Link2,
  MessageCircle,
  MessageSquare,
  PauseCircle,
  PlayCircle,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import { auth } from "@/lib/auth/config";
import { canManageCommunityInbox, getCommunityWorkspaceAccess } from "@/lib/community/service";
import { db } from "@/lib/db";
import {
  communityAutomationRules,
  communityCapabilities,
  communityConversations,
  communityEvents,
  communityMessages,
  communityPlaybooks,
  communitySendAttempts,
  socialChannels,
} from "@/lib/db/schema";
import { getAccessibleWorkspaceAtPath } from "@/lib/workspaces/context";
import { workspaceBasePath } from "@/lib/urls";
import { tForActive } from "@/lib/i18n/t-for-active";
import { CommunityWorkspaceToggle } from "@/components/community/community-workspace-toggle";
import { CapabilityValidationButton } from "@/components/community/capability-validation-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { KpiTile } from "@/components/workspace/kpi-tile";
import { PageHeader } from "@/components/workspace/page-header";

type Translator = Awaited<ReturnType<typeof tForActive>>["t"];
type CommunitySection =
  | "overview"
  | "inbox"
  | "comments"
  | "reviews"
  | "automations"
  | "playbooks"
  | "test-lab"
  | "analytics"
  | "connections"
  | "team"
  | "settings"
  | "activity"
  | "setup";

const SECTION_KEYS: Record<CommunitySection, { title: string; description: string }> = {
  overview: { title: "overviewTitle", description: "overviewDescription" },
  inbox: { title: "inboxTitle", description: "inboxDescription" },
  comments: { title: "commentsTitle", description: "commentsDescription" },
  reviews: { title: "reviewsTitle", description: "reviewsDescription" },
  automations: { title: "automationsTitle", description: "automationsDescription" },
  playbooks: { title: "playbooksTitle", description: "playbooksDescription" },
  "test-lab": { title: "testLabTitle", description: "testLabDescription" },
  analytics: { title: "analyticsTitle", description: "analyticsDescription" },
  connections: { title: "connectionsTitle", description: "connectionsDescription" },
  team: { title: "teamTitle", description: "teamDescription" },
  settings: { title: "settingsTitle", description: "settingsDescription" },
  activity: { title: "activityTitle", description: "activityDescription" },
  setup: { title: "setupTitle", description: "setupDescription" },
};

const OPERATION_KEYS = [
  "read_comments",
  "reply_comments",
  "read_private_messages",
  "reply_private_messages",
  "webhooks",
  "media_context",
  "conversation_history",
] as const;

function communityText(t: Translator, key: string, params?: Record<string, string | number>) {
  return t(`communityInbox.${key}`, params);
}

async function readMetrics(workspaceId: string) {
  const [
    conversations,
    messages,
    reviews,
    channels,
    capabilityRows,
    sends,
    events,
    rules,
    playbooks,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(communityConversations)
      .where(
        and(
          eq(communityConversations.workspaceId, workspaceId),
          eq(communityConversations.state, "open"),
        ),
      ),
    db
      .select({ value: count() })
      .from(communityMessages)
      .where(eq(communityMessages.workspaceId, workspaceId)),
    db
      .select({ value: count() })
      .from(communityConversations)
      .where(
        and(
          eq(communityConversations.workspaceId, workspaceId),
          eq(communityConversations.state, "waiting_approval"),
        ),
      ),
    db
      .select({ value: count() })
      .from(socialChannels)
      .where(and(eq(socialChannels.workspaceId, workspaceId), eq(socialChannels.isActive, true))),
    db
      .select({
        operation: communityCapabilities.operation,
        state: communityCapabilities.state,
        checkedAt: communityCapabilities.checkedAt,
        detail: communityCapabilities.detail,
      })
      .from(communityCapabilities)
      .where(eq(communityCapabilities.workspaceId, workspaceId)),
    db
      .select({ value: count() })
      .from(communitySendAttempts)
      .where(eq(communitySendAttempts.workspaceId, workspaceId)),
    db
      .select({ value: count() })
      .from(communityEvents)
      .where(eq(communityEvents.workspaceId, workspaceId)),
    db
      .select({ value: count() })
      .from(communityAutomationRules)
      .where(eq(communityAutomationRules.workspaceId, workspaceId)),
    db
      .select({ value: count() })
      .from(communityPlaybooks)
      .where(eq(communityPlaybooks.workspaceId, workspaceId)),
  ]);

  return {
    conversations: conversations[0]?.value ?? 0,
    messages: messages[0]?.value ?? 0,
    reviews: reviews[0]?.value ?? 0,
    channels: channels[0]?.value ?? 0,
    capabilities: capabilityRows.filter((row) => row.state === "available").length,
    capabilityRows,
    sends: sends[0]?.value ?? 0,
    events: events[0]?.value ?? 0,
    rules: rules[0]?.value ?? 0,
    playbooks: playbooks[0]?.value ?? 0,
  };
}

function SectionKpis({
  t,
  metrics,
}: {
  t: Translator;
  metrics: Awaited<ReturnType<typeof readMetrics>>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <KpiTile
        icon={<Inbox className="h-4 w-4" />}
        label={communityText(t, "openConversations")}
        value={metrics.conversations}
      />
      <KpiTile
        icon={<FileCheck2 className="h-4 w-4" />}
        label={communityText(t, "pendingReviews")}
        value={metrics.reviews}
        tone={metrics.reviews > 0 ? "warning" : "default"}
      />
      <KpiTile
        icon={<MessageSquare className="h-4 w-4" />}
        label={communityText(t, "messagesToday")}
        value={metrics.messages}
      />
      <KpiTile
        icon={<Link2 className="h-4 w-4" />}
        label={communityText(t, "connectedChannels")}
        value={metrics.channels}
      />
      <KpiTile
        icon={<Send className="h-4 w-4" />}
        label={communityText(t, "reliability")}
        value={metrics.sends > 0 ? 100 : 0}
        tone={metrics.sends > 0 ? "success" : "default"}
      />
    </div>
  );
}

function ModuleGate({
  t,
  basePath,
  access,
  setupAllowed,
}: {
  t: Translator;
  basePath: string;
  access: Awaited<ReturnType<typeof getCommunityWorkspaceAccess>>;
  setupAllowed: boolean;
}) {
  const title = !access.planIncluded
    ? communityText(t, "moduleUnavailable")
    : communityText(t, "setupRequiredTitle");
  const description = !access.planIncluded
    ? communityText(t, "moduleUnavailable")
    : communityText(t, "setupRequiredDescription");
  return (
    <Card padding="lg" data-testid="community-module-gate">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="bg-primary-subtle text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
        {setupAllowed && access.planIncluded ? (
          <Button asChild size="lg">
            <Link href={`${basePath}/setup`}>
              {communityText(t, "openSetup")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function EmptyCommunity({
  t,
  icon = <Inbox className="h-6 w-6" />,
}: {
  t: Translator;
  icon?: ReactNode;
}) {
  return (
    <EmptyState
      icon={icon}
      title={communityText(t, "noDataTitle")}
      description={communityText(t, "noDataDescription")}
    />
  );
}

function Overview({
  t,
  basePath,
  metrics,
}: {
  t: Translator;
  basePath: string;
  metrics: Awaited<ReturnType<typeof readMetrics>>;
}) {
  return (
    <>
      <section
        className="bg-primary relative overflow-hidden rounded-[var(--radius-card)] p-5 text-white sm:p-7"
        data-testid="community-overview-banner"
      >
        <div className="relative z-10 max-w-2xl">
          <p className="text-label font-semibold tracking-[0.16em] text-white/70 uppercase">
            {communityText(t, "module")}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {communityText(t, "overviewBanner", { count: metrics.conversations })}
          </h2>
          <p className="mt-2 max-w-xl text-sm text-white/80">
            {communityText(t, "overviewDescription")}
          </p>
        </div>
        <MessageCircle
          className="absolute end-5 bottom-[-2.5rem] h-40 w-40 text-white/10 sm:end-12"
          aria-hidden="true"
        />
      </section>
      <SectionKpis t={t} metrics={metrics} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <Card padding="none">
          <CardHeader className="border-border mb-0 border-b px-5 py-4">
            <div>
              <CardTitle>{communityText(t, "attention")}</CardTitle>
              <CardDescription>{communityText(t, "workload")}</CardDescription>
            </div>
            <Badge variant={metrics.conversations > 0 ? "warning" : "success"}>
              {metrics.conversations > 0
                ? communityText(t, "openConversations")
                : communityText(t, "status")}
            </Badge>
          </CardHeader>
          <div className="p-5">
            {metrics.conversations > 0 ? (
              <div className="divide-border divide-y">
                {["urgent", "high", "normal"].map((priority) => (
                  <div
                    key={priority}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="bg-warning h-2.5 w-2.5 rounded-full" aria-hidden="true" />
                      <span className="text-body text-fg-primary font-medium">
                        {communityText(t, priority)}
                      </span>
                    </div>
                    <span className="text-label text-fg-muted">{metrics.conversations}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyCommunity t={t} />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{communityText(t, "channelHealth")}</CardTitle>
              <CardDescription>{communityText(t, "connectedChannels")}</CardDescription>
            </div>
            <Link
              href={`${basePath}/connections`}
              className="text-primary text-label inline-flex items-center gap-1 font-semibold"
            >
              {communityText(t, "review")} <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </CardHeader>
          <div className="space-y-3">
            {metrics.channels > 0 ? (
              <div className="bg-surface-subtle flex items-center justify-between rounded-[var(--radius-control)] p-3">
                <span className="text-body text-fg-primary">{communityText(t, "meta")}</span>
                <Badge variant="success">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {communityText(t, "available")}
                </Badge>
              </div>
            ) : (
              <EmptyCommunity t={t} icon={<Link2 className="h-6 w-6" />} />
            )}
            <div className="border-border flex items-center justify-between border-t pt-3">
              <span className="text-label text-fg-muted">
                {communityText(t, "automationReadiness")}
              </span>
              <Badge variant={metrics.capabilities > 0 ? "info" : "outline"}>
                {metrics.capabilities > 0
                  ? communityText(t, "available")
                  : communityText(t, "notValidated")}
              </Badge>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

function InboxScreen({ t, basePath }: { t: Translator; basePath: string }) {
  return (
    <div
      className="grid min-h-[560px] gap-3 xl:grid-cols-[250px_minmax(0,1fr)_280px]"
      data-testid="community-inbox-screen"
    >
      <Card padding="none" className="min-w-0">
        <div className="border-border flex items-center justify-between border-b p-4">
          <CardTitle>{communityText(t, "inboxTitle")}</CardTitle>
          <Button size="icon" variant="ghost" aria-label={communityText(t, "searchConversations")}>
            <Search className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="border-border flex gap-1 overflow-x-auto border-b p-2">
          <Button size="sm" variant="secondary">
            {communityText(t, "allConversations")}
          </Button>
          <Button size="sm" variant="ghost">
            {communityText(t, "directMessages")}
          </Button>
          <Button size="sm" variant="ghost">
            {communityText(t, "comments")}
          </Button>
        </div>
        <div className="p-3">
          <EmptyCommunity t={t} />
        </div>
      </Card>
      <Card padding="none" className="flex min-w-0 flex-col">
        <div className="border-border flex items-center justify-between border-b p-4">
          <div>
            <CardTitle>{communityText(t, "noDataTitle")}</CardTitle>
            <CardDescription>{communityText(t, "noDataDescription")}</CardDescription>
          </div>
          <Badge variant="outline">{communityText(t, "status")}</Badge>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyCommunity t={t} icon={<MessageSquare className="h-6 w-6" />} />
        </div>
        <div className="border-border border-t p-4">
          <div className="border-border bg-surface-subtle flex items-center gap-2 rounded-[var(--radius-control)] border p-2">
            <span className="text-body text-fg-muted flex-1 px-2">
              {communityText(t, "replyPlaceholder")}
            </span>
            <Button size="icon" aria-label={communityText(t, "sendReply")} disabled>
              <Send className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </Card>
      <Card padding="none" className="min-w-0">
        <div className="border-border border-b p-4">
          <CardTitle>{communityText(t, "source")}</CardTitle>
        </div>
        <div className="space-y-4 p-4">
          <div className="bg-surface-subtle rounded-[var(--radius-control)] p-3">
            <p className="text-label text-fg-muted">{communityText(t, "channelHealth")}</p>
            <p className="text-body text-fg-primary mt-1 font-medium">
              {communityText(t, "notValidated")}
            </p>
          </div>
          <div className="bg-primary-subtle rounded-[var(--radius-control)] p-3">
            <div className="text-primary flex items-center gap-2">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span className="text-label font-semibold">{communityText(t, "aiAssist")}</span>
            </div>
            <p className="text-label text-fg-secondary mt-2">
              {communityText(t, "noProviderActions")}
            </p>
          </div>
          <Link
            href={`${basePath}/connections`}
            className="text-primary text-label inline-flex items-center gap-1 font-semibold"
          >
            {communityText(t, "validate")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </Card>
    </div>
  );
}

function CommentsScreen({
  t,
  metrics,
}: {
  t: Translator;
  metrics: Awaited<ReturnType<typeof readMetrics>>;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.42fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{communityText(t, "source")}</CardTitle>
            <CardDescription>{communityText(t, "commentsTitle")}</CardDescription>
          </div>
          <Badge variant="outline">{metrics.messages}</Badge>
        </CardHeader>
        <div className="bg-surface-subtle flex aspect-[4/3] items-center justify-center rounded-[var(--radius-control)]">
          <MessageCircle className="text-fg-muted h-10 w-10" aria-hidden="true" />
        </div>
        <div className="mt-4 space-y-2">
          <div className="text-body text-fg-primary font-medium">
            {communityText(t, "noDataTitle")}
          </div>
          <p className="text-label text-fg-muted">{communityText(t, "noDataDescription")}</p>
        </div>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{communityText(t, "commentsTitle")}</CardTitle>
            <CardDescription>{communityText(t, "commentsDescription")}</CardDescription>
          </div>
          <Button variant="secondary" disabled>
            <Filter className="h-4 w-4" aria-hidden="true" />
            {communityText(t, "allConversations")}
          </Button>
        </CardHeader>
        <EmptyCommunity t={t} icon={<MessageCircle className="h-6 w-6" />} />
      </Card>
    </div>
  );
}

function ReviewsScreen({
  t,
  metrics,
}: {
  t: Translator;
  metrics: Awaited<ReturnType<typeof readMetrics>>;
}) {
  return (
    <>
      <SectionKpis t={t} metrics={metrics} />
      <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{communityText(t, "reviewsTitle")}</CardTitle>
            <CardDescription>{communityText(t, "pendingReviews")}</CardDescription>
          </CardHeader>
          <EmptyCommunity t={t} icon={<FileCheck2 className="h-6 w-6" />} />
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{communityText(t, "review")}</CardTitle>
            <CardDescription>{communityText(t, "noProviderActions")}</CardDescription>
          </CardHeader>
          <div className="bg-surface-subtle rounded-[var(--radius-control)] p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="text-primary h-4 w-4" aria-hidden="true" />
              <span className="text-label text-fg-primary font-semibold">
                {communityText(t, "whyQueued")}
              </span>
            </div>
            <p className="text-label text-fg-muted mt-2">{communityText(t, "noDataDescription")}</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" disabled>
              <XCircle className="h-4 w-4" aria-hidden="true" />
              {communityText(t, "disabled")}
            </Button>
            <Button disabled>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {communityText(t, "review")}
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}

function AutomationsScreen({
  t,
  metrics,
}: {
  t: Translator;
  metrics: Awaited<ReturnType<typeof readMetrics>>;
}) {
  return (
    <>
      <div className="border-danger/20 bg-danger-subtle flex flex-col gap-3 rounded-[var(--radius-card)] border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <AlertTriangle className="text-danger mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-body text-fg-primary font-semibold">
              {communityText(t, "emergencyStop")}
            </p>
            <p className="text-label text-fg-secondary mt-1">
              {communityText(t, "noProviderActions")}
            </p>
          </div>
        </div>
        <Button variant="destructive" disabled>
          <PauseCircle className="h-4 w-4" aria-hidden="true" />
          {communityText(t, "disabled")}
        </Button>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{communityText(t, "automationsTitle")}</CardTitle>
              <CardDescription>{communityText(t, "ruleStatus")}</CardDescription>
            </div>
            <Badge variant="outline">{metrics.rules}</Badge>
          </CardHeader>
          <EmptyCommunity t={t} icon={<Bot className="h-6 w-6" />} />
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{communityText(t, "noRules")}</CardTitle>
            <Button variant="secondary" disabled>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {communityText(t, "configureAgency")}
            </Button>
          </CardHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="bg-surface-subtle rounded-[var(--radius-control)] p-4">
              <p className="text-label text-fg-muted">{communityText(t, "ifLabel")}</p>
              <p className="text-body text-fg-primary mt-1">{communityText(t, "comments")}</p>
            </div>
            <div className="bg-surface-subtle rounded-[var(--radius-control)] p-4">
              <p className="text-label text-fg-muted">{communityText(t, "thenLabel")}</p>
              <p className="text-body text-fg-primary mt-1">{communityText(t, "review")}</p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

function PlaybooksScreen({
  t,
  metrics,
}: {
  t: Translator;
  metrics: Awaited<ReturnType<typeof readMetrics>>;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
      <Card padding="sm">
        <div className="text-label text-fg-muted mb-3 font-semibold tracking-wider uppercase">
          {communityText(t, "module")}
        </div>
        <div className="space-y-1">
          <Button className="w-full justify-start" variant="secondary">
            {communityText(t, "playbooksTitle")}
          </Button>
          <Button className="w-full justify-start" variant="ghost">
            {communityText(t, "source")}
          </Button>
          <Button className="w-full justify-start" variant="ghost">
            {communityText(t, "status")}
          </Button>
        </div>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{communityText(t, "playbooksTitle")}</CardTitle>
            <CardDescription>{communityText(t, "playbooksDescription")}</CardDescription>
          </div>
          <Badge variant="outline">{metrics.playbooks}</Badge>
        </CardHeader>
        <EmptyCommunity t={t} icon={<Database className="h-6 w-6" />} />
      </Card>
    </div>
  );
}

function TestLabScreen({ t }: { t: Translator }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{communityText(t, "testLabTitle")}</CardTitle>
          <CardDescription>{communityText(t, "testLabDescription")}</CardDescription>
        </CardHeader>
        <div className="space-y-4">
          <div className="bg-surface-subtle rounded-[var(--radius-control)] p-4">
            <p className="text-label text-fg-muted">{communityText(t, "directMessages")}</p>
            <p className="text-body text-fg-primary mt-2">{communityText(t, "replyPlaceholder")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-label text-fg-muted">{communityText(t, "source")}</p>
              <p className="text-body text-fg-primary mt-1">{communityText(t, "meta")}</p>
            </div>
            <div>
              <p className="text-label text-fg-muted">{communityText(t, "comments")}</p>
              <p className="text-body text-fg-primary mt-1">{communityText(t, "notValidated")}</p>
            </div>
          </div>
          <Button disabled>
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
            {communityText(t, "runSimulation")}
          </Button>
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{communityText(t, "simulationOnly")}</CardTitle>
          <CardDescription>{communityText(t, "noProviderActions")}</CardDescription>
        </CardHeader>
        <div className="border-primary/20 bg-primary-subtle rounded-[var(--radius-control)] border p-4">
          <div className="text-primary flex items-center gap-2">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span className="text-body font-semibold">{communityText(t, "aiQuality")}</span>
          </div>
          <p className="text-label text-fg-secondary mt-2">
            {communityText(t, "noDataDescription")}
          </p>
        </div>
      </Card>
    </div>
  );
}

function AnalyticsScreen({
  t,
  metrics,
}: {
  t: Translator;
  metrics: Awaited<ReturnType<typeof readMetrics>>;
}) {
  return (
    <>
      <div className="border-info/20 bg-info-subtle text-info flex items-start gap-3 rounded-[var(--radius-card)] border p-4">
        <BarChart3 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="text-label">{communityText(t, "illustrative")}</p>
      </div>
      <SectionKpis t={t} metrics={metrics} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{communityText(t, "volume")}</CardTitle>
            <Button variant="secondary" disabled>
              {communityText(t, "export")}
            </Button>
          </CardHeader>
          <div
            className="border-border flex h-56 items-end gap-3 border-s-0 border-b px-3 pb-3"
            role="img"
            aria-label={communityText(t, "volume")}
          >
            <div className="bg-primary/20 h-1/4 flex-1 rounded-t" />
            <div className="bg-primary/35 h-2/5 flex-1 rounded-t" />
            <div className="bg-primary/50 h-1/3 flex-1 rounded-t" />
            <div className="bg-primary/70 h-3/5 flex-1 rounded-t" />
            <div className="bg-primary h-1/2 flex-1 rounded-t" />
          </div>
          <p className="text-label text-fg-muted mt-3">{communityText(t, "noDataDescription")}</p>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{communityText(t, "channelHealth")}</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <MetricLine label={communityText(t, "responseSla")} value="—" />
            <MetricLine label={communityText(t, "aiQuality")} value="—" />
            <MetricLine label={communityText(t, "reliability")} value="—" />
          </div>
        </Card>
      </div>
    </>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-label text-fg-secondary">{label}</span>
      <span className="text-body text-fg-primary font-semibold">{value}</span>
    </div>
  );
}

function ConnectionsScreen({
  t,
  metrics,
  agencySlug,
  workspaceSlug,
  canManage,
}: {
  t: Translator;
  metrics: Awaited<ReturnType<typeof readMetrics>>;
  agencySlug: string;
  workspaceSlug: string;
  canManage: boolean;
}) {
  const operationLabels: Record<(typeof OPERATION_KEYS)[number], string> = {
    read_comments: "operationReadComments",
    reply_comments: "operationReplyComments",
    read_private_messages: "operationReadPrivateMessages",
    reply_private_messages: "operationReplyPrivateMessages",
    webhooks: "operationWebhooks",
    media_context: "operationMediaContext",
    conversation_history: "operationConversationHistory",
  };
  return (
    <>
      <div className="border-warning/20 bg-warning-subtle text-warning flex items-start gap-3 rounded-[var(--radius-card)] border p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="text-label">{communityText(t, "connectionsDescription")}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{communityText(t, "meta")}</CardTitle>
              <CardDescription>{communityText(t, "channelHealth")}</CardDescription>
            </div>
            <Badge variant={metrics.channels > 0 ? "success" : "outline"}>
              {metrics.channels > 0
                ? communityText(t, "available")
                : communityText(t, "notValidated")}
            </Badge>
          </CardHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-label text-fg-secondary">
                {communityText(t, "lastChecked")}
              </span>
              <span className="text-label text-fg-muted">
                {metrics.capabilityRows[0]?.checkedAt?.toLocaleString() ?? "—"}
              </span>
            </div>
            <CapabilityValidationButton
              agencySlug={agencySlug}
              workspaceSlug={workspaceSlug}
              canManage={canManage}
              validateLabel={communityText(t, "validate")}
              validatingLabel={communityText(t, "validating")}
              successLabel={communityText(t, "validationSuccess")}
              errorLabel={communityText(t, "validationFailed")}
            />
          </div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{communityText(t, "operation")}</CardTitle>
            <CardDescription>{communityText(t, "status")}</CardDescription>
          </CardHeader>
          <div className="space-y-2">
            {OPERATION_KEYS.slice(0, 4).map((operation) => (
              <div
                key={operation}
                className="bg-surface-subtle flex items-center justify-between gap-3 rounded-[var(--radius-control)] px-3 py-2"
              >
                <span className="text-label text-fg-primary">
                  {communityText(t, operationLabels[operation])}
                </span>
                <Badge
                  variant={
                    metrics.capabilityRows.find((row) => row.operation === operation)?.state ===
                    "available"
                      ? "success"
                      : metrics.capabilityRows.find((row) => row.operation === operation)?.state ===
                          "unavailable"
                        ? "warning"
                        : "outline"
                  }
                >
                  {communityText(
                    t,
                    metrics.capabilityRows.find((row) => row.operation === operation)?.state ??
                      "unknown",
                  )}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function TeamScreen({
  t,
  metrics,
}: {
  t: Translator;
  metrics: Awaited<ReturnType<typeof readMetrics>>;
}) {
  return (
    <>
      <SectionKpis t={t} metrics={metrics} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{communityText(t, "teamTitle")}</CardTitle>
            <CardDescription>{communityText(t, "assign")}</CardDescription>
          </CardHeader>
          <EmptyCommunity t={t} icon={<Users className="h-6 w-6" />} />
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{communityText(t, "workload")}</CardTitle>
            <CardDescription>{communityText(t, "responseSla")}</CardDescription>
          </CardHeader>
          <div className="space-y-3">
            <MetricLine label={communityText(t, "responseSla")} value="—" />
            <MetricLine
              label={communityText(t, "assign")}
              value={communityText(t, "ownerUnassigned")}
            />
          </div>
        </Card>
      </div>
    </>
  );
}

function SettingsScreen({
  t,
  access,
}: {
  t: Translator;
  access: Awaited<ReturnType<typeof getCommunityWorkspaceAccess>>;
}) {
  const modeLabel =
    access.mode === "controlled_auto"
      ? communityText(t, "controlledAutoMode")
      : access.mode === "ai_assist"
        ? communityText(t, "aiAssistMode")
        : communityText(t, "manualMode");
  return (
    <>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{communityText(t, "settingsTitle")}</CardTitle>
            <CardDescription>{communityText(t, "settingsDescription")}</CardDescription>
          </div>
          <Badge variant="primary">{modeLabel}</Badge>
        </CardHeader>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["manualMode", "manual", true],
            ["aiAssistMode", "ai_assist", false],
            ["controlledAutoMode", "controlled_auto", false],
          ].map(([key, mode, recommended]) => (
            <div
              key={mode as string}
              className={`rounded-[var(--radius-control)] border p-4 ${access.mode === mode ? "border-primary bg-primary-subtle" : "border-border bg-surface"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-body text-fg-primary font-semibold">
                  {communityText(t, key as string)}
                </span>
                {recommended ? (
                  <Badge variant="success">{communityText(t, "available")}</Badge>
                ) : null}
              </div>
              <p className="text-label text-fg-muted mt-2">
                {mode === "manual"
                  ? communityText(t, "review")
                  : communityText(t, "noProviderActions")}
              </p>
            </div>
          ))}
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{communityText(t, "emergencyStop")}</CardTitle>
          </CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-body text-fg-primary font-medium">
                {access.emergencyStop
                  ? communityText(t, "disabled")
                  : communityText(t, "available")}
              </p>
              <p className="text-label text-fg-muted mt-1">
                {communityText(t, "noProviderActions")}
              </p>
            </div>
            <Button variant="destructive" disabled>
              <PauseCircle className="h-4 w-4" aria-hidden="true" />
              {communityText(t, "disabled")}
            </Button>
          </div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{communityText(t, "source")}</CardTitle>
          </CardHeader>
          <MetricLine
            label={communityText(t, "settingsTitle")}
            value={communityText(t, "retentionDays", { count: access.retentionDays })}
          />
          <div className="mt-3">
            <Badge variant="outline">{communityText(t, "notValidated")}</Badge>
          </div>
        </Card>
      </div>
    </>
  );
}

function ActivityScreen({
  t,
  metrics,
}: {
  t: Translator;
  metrics: Awaited<ReturnType<typeof readMetrics>>;
}) {
  return (
    <>
      <SectionKpis t={t} metrics={metrics} />
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{communityText(t, "activityTitle")}</CardTitle>
            <CardDescription>{communityText(t, "activityDescription")}</CardDescription>
          </div>
          <Button variant="secondary" disabled>
            <Activity className="h-4 w-4" aria-hidden="true" />
            {communityText(t, "export")}
          </Button>
        </CardHeader>
        {metrics.events > 0 ? (
          <div className="space-y-3" />
        ) : (
          <EmptyCommunity t={t} icon={<Activity className="h-6 w-6" />} />
        )}
      </Card>
    </>
  );
}

function SetupScreen({
  t,
  basePath,
  agencySlug,
  workspaceSlug,
  access,
  canManage,
}: {
  t: Translator;
  basePath: string;
  agencySlug: string;
  workspaceSlug: string;
  access: Awaited<ReturnType<typeof getCommunityWorkspaceAccess>>;
  canManage: boolean;
}) {
  const steps = [
    communityText(t, "connectionsTitle"),
    communityText(t, "validate"),
    communityText(t, "playbooksTitle"),
    communityText(t, "settingsTitle"),
    communityText(t, "enableWorkspace"),
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(220px,0.55fr)_minmax(0,1.45fr)]">
      <Card padding="sm">
        <div className="space-y-1">
          {steps.map((step, index) => (
            <div
              key={step}
              className="flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-3"
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${index === 0 ? "bg-primary text-white" : "bg-surface-subtle text-fg-muted"}`}
              >
                {index + 1}
              </span>
              <span className="text-label text-fg-primary font-medium">{step}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{communityText(t, "setupTitle")}</CardTitle>
            <CardDescription>{communityText(t, "setupDescription")}</CardDescription>
          </div>
          <Badge variant={access.allowed ? "success" : "warning"}>
            {access.allowed ? communityText(t, "available") : communityText(t, "notValidated")}
          </Badge>
        </CardHeader>
        <div className="space-y-3">
          <ReadinessRow
            icon={<Link2 className="h-4 w-4" />}
            label={communityText(t, "connectionsTitle")}
            ready={access.agencyEnabled}
            t={t}
          />
          <ReadinessRow
            icon={<ShieldCheck className="h-4 w-4" />}
            label={communityText(t, "validate")}
            ready={access.planIncluded}
            t={t}
          />
          <ReadinessRow
            icon={<CheckCircle2 className="h-4 w-4" />}
            label={communityText(t, "enableWorkspace")}
            ready={access.workspaceEnabled}
            t={t}
          />
        </div>
        {canManage && !access.workspaceEnabled && access.agencyEnabled ? (
          <div className="border-border mt-5 border-t pt-4">
            <CommunityWorkspaceToggle
              agencySlug={agencySlug}
              workspaceSlug={workspaceSlug}
              basePath={basePath}
              label={communityText(t, "enableWorkspace")}
              errorLabel={t("common.error.body")}
            />
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function ReadinessRow({
  icon,
  label,
  ready,
  t,
}: {
  icon: ReactNode;
  label: string;
  ready: boolean;
  t: Translator;
}) {
  return (
    <div className="border-border flex items-center justify-between gap-3 rounded-[var(--radius-control)] border p-3">
      <div className="flex items-center gap-3">
        <span className={ready ? "text-success" : "text-fg-muted"}>{icon}</span>
        <span className="text-body text-fg-primary">{label}</span>
      </div>
      <Badge variant={ready ? "success" : "outline"}>
        {ready ? communityText(t, "available") : communityText(t, "notValidated")}
      </Badge>
    </div>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: communityText(t, "module") };
}

export default async function CommunityEngagementPage({
  params,
}: {
  params: Promise<{ agencySlug: string; slug: string; section?: string[] }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { agencySlug, slug, section } = await params;
  const workspace = await getAccessibleWorkspaceAtPath({ id: session.user.id }, agencySlug, slug);
  if (!workspace) notFound();
  const { t } = await tForActive();
  const basePath = `${workspaceBasePath(agencySlug, slug)}/engagement`;
  const requested = section?.[0] ?? "overview";
  const currentSection = (
    Object.hasOwn(SECTION_KEYS, requested) ? requested : "overview"
  ) as CommunitySection;
  const access = await getCommunityWorkspaceAccess(workspace.agencyId, workspace.id);
  if (currentSection === "setup" && access.workspaceEnabled) {
    redirect(basePath);
  }
  const canManage = await canManageCommunityInbox({ id: session.user.id }, workspace);
  const metrics = access.planIncluded
    ? await readMetrics(workspace.id)
    : {
        conversations: 0,
        messages: 0,
        reviews: 0,
        channels: 0,
        capabilities: 0,
        capabilityRows: [],
        sends: 0,
        events: 0,
        rules: 0,
        playbooks: 0,
      };
  const spec = SECTION_KEYS[currentSection];
  const title = communityText(t, spec.title);
  const description = communityText(t, spec.description);

  return (
    <div className="space-y-6 pb-8" data-testid={`community-screen-${currentSection}`}>
      <PageHeader
        eyebrow={`${communityText(t, "eyebrow")} / ${currentSection.replaceAll("-", " ")}`}
        title={title}
        description={description}
        action={
          <Badge variant={access.allowed ? "success" : "outline"}>
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {access.allowed ? communityText(t, "available") : communityText(t, "notValidated")}
          </Badge>
        }
      />
      {!access.planIncluded ||
      !access.agencyEnabled ||
      (!access.workspaceEnabled && currentSection !== "setup") ? (
        <ModuleGate
          t={t}
          basePath={basePath}
          access={access}
          setupAllowed={canManage || access.agencyEnabled}
        />
      ) : null}
      {access.planIncluded &&
      access.agencyEnabled &&
      (access.workspaceEnabled || currentSection === "setup") ? (
        currentSection === "overview" ? (
          <Overview t={t} basePath={basePath} metrics={metrics} />
        ) : currentSection === "inbox" ? (
          <InboxScreen t={t} basePath={basePath} />
        ) : currentSection === "comments" ? (
          <CommentsScreen t={t} metrics={metrics} />
        ) : currentSection === "reviews" ? (
          <ReviewsScreen t={t} metrics={metrics} />
        ) : currentSection === "automations" ? (
          <AutomationsScreen t={t} metrics={metrics} />
        ) : currentSection === "playbooks" ? (
          <PlaybooksScreen t={t} metrics={metrics} />
        ) : currentSection === "test-lab" ? (
          <TestLabScreen t={t} />
        ) : currentSection === "analytics" ? (
          <AnalyticsScreen t={t} metrics={metrics} />
        ) : currentSection === "connections" ? (
          <ConnectionsScreen
            t={t}
            metrics={metrics}
            agencySlug={agencySlug}
            workspaceSlug={slug}
            canManage={canManage}
          />
        ) : currentSection === "team" ? (
          <TeamScreen t={t} metrics={metrics} />
        ) : currentSection === "settings" ? (
          <SettingsScreen t={t} access={access} />
        ) : currentSection === "activity" ? (
          <ActivityScreen t={t} metrics={metrics} />
        ) : (
          <SetupScreen
            t={t}
            basePath={basePath}
            agencySlug={agencySlug}
            workspaceSlug={slug}
            access={access}
            canManage={canManage}
          />
        )
      ) : null}
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { and, count, desc, eq, inArray } from "drizzle-orm";
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
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import {
  canManageCommunityInbox,
  canReplyInCommunityInbox,
  getCommunityWorkspaceAccess,
} from "@/lib/community/service";
import {
  firstCapabilityDetail,
  mergeCapabilityRows,
  missingCapabilityScopes,
} from "@/lib/community/capabilities";
import { db } from "@/lib/db";
import {
  communityAutomationRules,
  communityCapabilities,
  communityConversations,
  communityEvents,
  communityMessages,
  communityPlaybooks,
  communitySendAttempts,
  communitySyncStates,
  socialChannels,
  users,
  workspaceMemberships,
  workspaceMembershipRoles,
} from "@/lib/db/schema";
import { getAccessibleWorkspaceAtPath } from "@/lib/workspaces/context";
import { workspaceBasePath } from "@/lib/urls";
import { tForActive } from "@/lib/i18n/t-for-active";
import { DateFormat, formatDate } from "@/lib/i18n/format-locale";
import type { LocaleCode } from "@/lib/i18n/locales";
import { CommunityWorkspaceToggle } from "@/components/community/community-workspace-toggle";
import { CapabilityValidationButton } from "@/components/community/capability-validation-button";
import { CommentSyncButton } from "@/components/community/comment-sync-button";
import { CommunityReplyForm } from "@/components/community/community-reply-form";
import { PrivateMessageSyncButton } from "@/components/community/private-message-sync-button";
import { CommunityAssignmentForm } from "@/components/community/community-assignment-form";
import { CommunityTestLab } from "@/components/community/community-test-lab";
import { CommunityEmergencyStopControl } from "@/components/community/community-emergency-stop-control";
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

async function readMetrics(
  workspaceId: string,
  view: { selectedConversationId?: string; kind?: string; query?: string } = {},
) {
  const [
    conversations,
    priorities,
    messages,
    reviews,
    channels,
    capabilityRows,
    sends,
    syncStates,
    events,
    rules,
    playbooks,
    recentEvents,
    automationRows,
    playbookRows,
    conversationRows,
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
      .select({ priority: communityConversations.priority, value: count() })
      .from(communityConversations)
      .where(
        and(
          eq(communityConversations.workspaceId, workspaceId),
          eq(communityConversations.state, "open"),
        ),
      )
      .groupBy(communityConversations.priority),
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
      .select({
        syncKind: communitySyncStates.syncKind,
        status: communitySyncStates.status,
        lastCompletedAt: communitySyncStates.lastCompletedAt,
        lastErrorCode: communitySyncStates.lastErrorCode,
      })
      .from(communitySyncStates)
      .where(eq(communitySyncStates.workspaceId, workspaceId)),
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
    db
      .select({
        id: communityEvents.id,
        kind: communityEvents.kind,
        detail: communityEvents.detail,
        createdAt: communityEvents.createdAt,
      })
      .from(communityEvents)
      .where(eq(communityEvents.workspaceId, workspaceId))
      .orderBy(desc(communityEvents.createdAt))
      .limit(20),
    db
      .select({
        id: communityAutomationRules.id,
        name: communityAutomationRules.name,
        mode: communityAutomationRules.mode,
        status: communityAutomationRules.status,
      })
      .from(communityAutomationRules)
      .where(eq(communityAutomationRules.workspaceId, workspaceId))
      .orderBy(desc(communityAutomationRules.updatedAt))
      .limit(25),
    db
      .select({
        id: communityPlaybooks.id,
        name: communityPlaybooks.name,
        status: communityPlaybooks.status,
        revision: communityPlaybooks.revision,
        expiresAt: communityPlaybooks.expiresAt,
      })
      .from(communityPlaybooks)
      .where(eq(communityPlaybooks.workspaceId, workspaceId))
      .orderBy(desc(communityPlaybooks.updatedAt))
      .limit(25),
    db
      .select({
        id: communityConversations.id,
        channelType: communityConversations.channelType,
        lastMessageAt: communityConversations.lastMessageAt,
        state: communityConversations.state,
        assignedTo: communityConversations.assignedTo,
        priority: communityConversations.priority,
        externalPostId: communityConversations.externalPostId,
      })
      .from(communityConversations)
      .where(eq(communityConversations.workspaceId, workspaceId))
      .orderBy(desc(communityConversations.lastMessageAt))
      .limit(100),
  ]);

  const mergedCapabilityRows = mergeCapabilityRows(capabilityRows);

  const boundedConversations = conversationRows.slice(0, 100);
  const conversationIds = boundedConversations.map((row) => row.id);
  const messageRows = conversationIds.length
    ? await db
        .select({
          id: communityMessages.id,
          conversationId: communityMessages.conversationId,
          body: communityMessages.body,
          authorName: communityMessages.authorName,
          direction: communityMessages.direction,
          visibility: communityMessages.visibility,
          postedAt: communityMessages.postedAt,
          deliveryState: communityMessages.deliveryState,
        })
        .from(communityMessages)
        .where(
          and(
            eq(communityMessages.workspaceId, workspaceId),
            inArray(communityMessages.conversationId, conversationIds),
          ),
        )
        .orderBy(desc(communityMessages.postedAt))
        .limit(1000)
    : [];
  const latestByConversation = new Map<string, (typeof messageRows)[number]>();
  for (const message of messageRows) {
    if (!latestByConversation.has(message.conversationId)) {
      latestByConversation.set(message.conversationId, message);
    }
  }
  const conversationItems = boundedConversations.flatMap((conversation) => {
    const latestMessage = latestByConversation.get(conversation.id);
    if (!latestMessage) return [];
    return [
      {
        ...conversation,
        body: latestMessage.body,
        authorName: latestMessage.authorName,
        direction: latestMessage.direction,
        visibility: latestMessage.visibility,
        lastMessageId: latestMessage.id,
        lastMessageAt: latestMessage.postedAt,
        deliveryState: latestMessage.deliveryState,
      },
    ];
  });
  let inboxItems = conversationItems;
  if (view.kind === "dms") inboxItems = inboxItems.filter((item) => item.visibility === "private");
  if (view.kind === "comments")
    inboxItems = inboxItems.filter((item) => item.visibility !== "private");
  const query = view.query?.trim().toLocaleLowerCase();
  if (query) {
    inboxItems = inboxItems.filter((item) =>
      `${item.body} ${item.authorName ?? ""} ${item.channelType}`
        .toLocaleLowerCase()
        .includes(query),
    );
  }
  inboxItems = inboxItems.slice(0, 25);
  const selectedConversation =
    inboxItems.find((item) => item.id === view.selectedConversationId) ?? inboxItems[0] ?? null;
  const selectedThread = selectedConversation
    ? await db
        .select({
          id: communityMessages.id,
          body: communityMessages.body,
          authorName: communityMessages.authorName,
          direction: communityMessages.direction,
          visibility: communityMessages.visibility,
          postedAt: communityMessages.postedAt,
          deliveryState: communityMessages.deliveryState,
        })
        .from(communityMessages)
        .where(
          and(
            eq(communityMessages.workspaceId, workspaceId),
            eq(communityMessages.conversationId, selectedConversation.id),
          ),
        )
        .orderBy(desc(communityMessages.postedAt))
        .limit(100)
    : [];
  const memberRows = await db
    .select({
      id: users.id,
      name: users.displayName,
      status: workspaceMemberships.status,
      role: workspaceMembershipRoles.role,
    })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .leftJoin(
      workspaceMembershipRoles,
      eq(workspaceMembershipRoles.workspaceMembershipId, workspaceMemberships.id),
    )
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.status, "active"),
      ),
    );
  const assigneeMap = new Map<
    string,
    { id: string; name: string; roles: Set<string>; openCount: number }
  >();
  for (const row of memberRows) {
    const member = assigneeMap.get(row.id) ?? {
      id: row.id,
      name: row.name,
      roles: new Set<string>(),
      openCount: 0,
    };
    if (row.role) member.roles.add(row.role);
    assigneeMap.set(row.id, member);
  }
  for (const conversation of conversationItems) {
    if (conversation.assignedTo) {
      const member = assigneeMap.get(conversation.assignedTo);
      if (member && !["resolved", "spam"].includes(conversation.state)) member.openCount += 1;
    }
  }

  return {
    conversations: conversations[0]?.value ?? 0,
    priorityCounts: Object.fromEntries(priorities.map((row) => [row.priority, row.value])),
    messages: messages[0]?.value ?? 0,
    reviews: reviews[0]?.value ?? 0,
    channels: channels[0]?.value ?? 0,
    capabilities: mergedCapabilityRows.filter((row) => row.state === "available").length,
    capabilityRows: mergedCapabilityRows,
    sends: sends[0]?.value ?? 0,
    syncStates,
    events: events[0]?.value ?? 0,
    rules: rules[0]?.value ?? 0,
    playbooks: playbooks[0]?.value ?? 0,
    recentEvents,
    automationRows,
    playbookRows,
    inboxItems,
    selectedConversation,
    selectedThread: selectedThread.reverse(),
    kind: view.kind === "dms" || view.kind === "comments" ? view.kind : "all",
    query: view.query ?? "",
    assignees: Array.from(assigneeMap.values()).map(({ id, name, openCount }) => ({
      id,
      name,
      openCount,
    })),
    teamConversations: conversationItems,
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
        label={communityText(t, "messagesStored")}
        value={metrics.messages}
      />
      <KpiTile
        icon={<Link2 className="h-4 w-4" />}
        label={communityText(t, "connectedChannels")}
        value={metrics.channels}
      />
      <KpiTile
        icon={<Send className="h-4 w-4" />}
        label={communityText(t, "sendAttempts")}
        value={metrics.sends}
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
          <p className="text-label font-semibold tracking-[0.16em] text-white uppercase">
            {communityText(t, "module")}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {communityText(t, "overviewBanner", { count: metrics.conversations })}
          </h2>
          <p className="mt-2 max-w-xl text-sm text-white">
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
                {["urgent", "high", "normal", "low"].map((priority) => (
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
                    <span className="text-label text-fg-muted">
                      {metrics.priorityCounts[priority] ?? 0}
                    </span>
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

function InboxScreen({
  t,
  basePath,
  metrics,
  agencySlug,
  workspaceSlug,
  canManage,
  canAssign,
  canReply,
}: {
  t: Translator;
  basePath: string;
  metrics: Awaited<ReturnType<typeof readMetrics>>;
  agencySlug: string;
  workspaceSlug: string;
  canManage: boolean;
  canAssign: boolean;
  canReply: boolean;
}) {
  const selectedConversation = metrics.selectedConversation;
  return (
    <div
      className="grid min-h-[560px] gap-3 xl:grid-cols-[250px_minmax(0,1fr)_280px]"
      data-testid="community-inbox-screen"
    >
      <Card padding="none" className="min-w-0">
        <div className="border-border flex items-center justify-between border-b p-4">
          <CardTitle>{communityText(t, "inboxTitle")}</CardTitle>
          <Button
            size="icon"
            variant="ghost"
            aria-label={communityText(t, "searchConversations")}
            type="submit"
            form="community-inbox-search"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <form id="community-inbox-search" method="get" className="border-border border-b p-2">
          <input type="hidden" name="kind" value={metrics.kind} />
          <input
            name="q"
            type="search"
            defaultValue={metrics.query}
            aria-label={communityText(t, "searchConversations")}
            placeholder={communityText(t, "searchConversations")}
            className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring min-h-10 w-full rounded-[var(--radius-control)] border px-3 focus:outline-none focus-visible:ring-2"
          />
        </form>
        <div className="border-border flex gap-1 overflow-x-auto border-b p-2">
          {(["all", "dms", "comments"] as const).map((kind) => (
            <Button
              key={kind}
              asChild
              size="sm"
              variant={metrics.kind === kind ? "secondary" : "ghost"}
            >
              <Link
                href={`${basePath}/inbox?kind=${kind}${metrics.query ? `&q=${encodeURIComponent(metrics.query)}` : ""}`}
              >
                {communityText(
                  t,
                  kind === "all"
                    ? "allConversations"
                    : kind === "dms"
                      ? "directMessages"
                      : "comments",
                )}
              </Link>
            </Button>
          ))}
        </div>
        <div className="space-y-2 p-3">
          {metrics.inboxItems.length > 0 ? (
            metrics.inboxItems.map((item) => (
              <Link
                key={item.id}
                href={`${basePath}/inbox?conversation=${item.id}&kind=${metrics.kind}${metrics.query ? `&q=${encodeURIComponent(metrics.query)}` : ""}`}
                aria-current={selectedConversation?.id === item.id ? "true" : undefined}
                className={`border-border bg-surface-subtle hover:border-primary focus-visible:ring-focus-ring block rounded-[var(--radius-control)] border p-3 focus:outline-none focus-visible:ring-2 ${selectedConversation?.id === item.id ? "border-primary bg-primary-subtle" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-label text-fg-muted uppercase">{item.channelType}</span>
                  <Badge variant={item.state === "open" ? "info" : "outline"}>
                    {communityText(
                      t,
                      item.direction === "outgoing" ? "waitingCustomer" : item.state,
                    )}
                  </Badge>
                </div>
                <p className="text-body text-fg-primary mt-2 line-clamp-2">{item.body}</p>
                <p className="text-label text-fg-muted mt-2">
                  {item.authorName ?? communityText(t, "authorUnavailable")}
                </p>
              </Link>
            ))
          ) : (
            <EmptyCommunity t={t} />
          )}
        </div>
      </Card>
      <Card padding="none" className="flex min-w-0 flex-col">
        <div className="border-border flex items-center justify-between border-b p-4">
          <div>
            <CardTitle>{communityText(t, "inboxTitle")}</CardTitle>
            <CardDescription>
              {metrics.inboxItems.length > 0
                ? communityText(t, "inboxLoadedDescription")
                : communityText(t, "noDataDescription")}
            </CardDescription>
          </div>
          <CommentSyncButton
            agencySlug={agencySlug}
            workspaceSlug={workspaceSlug}
            canManage={canManage}
            label={communityText(t, "syncComments")}
            pendingLabel={communityText(t, "syncingComments")}
            successLabel={communityText(t, "syncSuccess")}
            failureLabel={communityText(t, "syncFailure")}
          />
          <PrivateMessageSyncButton
            agencySlug={agencySlug}
            workspaceSlug={workspaceSlug}
            canManage={canManage}
            label={communityText(t, "syncPrivateMessages")}
            pendingLabel={communityText(t, "syncingPrivateMessages")}
            successLabel={communityText(t, "privateSyncSuccess")}
            failureLabel={communityText(t, "syncFailure")}
          />
        </div>
        <div className="flex flex-1 flex-col p-6">
          {selectedConversation ? (
            <div className="border-border bg-surface-subtle rounded-[var(--radius-control)] border p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-label text-fg-muted uppercase">
                  {selectedConversation.channelType}
                </span>
                <Badge variant="outline">
                  {communityText(
                    t,
                    selectedConversation.direction === "outgoing"
                      ? "waitingCustomer"
                      : selectedConversation.state,
                  )}
                </Badge>
              </div>
              <div className="mt-4 space-y-3">
                {metrics.selectedThread.map((message) => (
                  <div
                    key={message.id}
                    className="border-border bg-surface rounded-[var(--radius-control)] border p-3"
                  >
                    <div className="text-label text-fg-muted flex items-center justify-between gap-3">
                      <span>{message.authorName ?? communityText(t, "authorUnavailable")}</span>
                      <span>
                        {message.direction === "outgoing"
                          ? communityText(t, "teamReply")
                          : communityText(t, "customerMessage")}
                      </span>
                    </div>
                    <p className="text-body text-fg-primary mt-2 whitespace-pre-wrap" dir="auto">
                      {message.body}
                    </p>
                  </div>
                ))}
              </div>
              {canManage ? (
                <div className="border-border mt-4 border-t pt-4">
                  <CommunityAssignmentForm
                    agencySlug={agencySlug}
                    workspaceSlug={workspaceSlug}
                    conversationId={selectedConversation.id}
                    assignedTo={selectedConversation.assignedTo}
                    assignees={metrics.assignees}
                    canAssign={canAssign}
                    label={communityText(t, "assign")}
                    unassignedLabel={communityText(t, "ownerUnassigned")}
                    saveLabel={communityText(t, "saveAssignment")}
                    savingLabel={communityText(t, "savingAssignment")}
                    savedLabel={communityText(t, "assignmentSaved")}
                    failedLabel={communityText(t, "assignmentFailed")}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <EmptyCommunity t={t} icon={<MessageSquare className="h-6 w-6" />} />
            </div>
          )}
        </div>
        <div className="border-border border-t p-4">
          <CommunityReplyForm
            agencySlug={agencySlug}
            workspaceSlug={workspaceSlug}
            conversationId={selectedConversation?.id ?? null}
            canReply={canReply}
            visibility={selectedConversation?.visibility === "private" ? "private" : "public"}
            placeholder={communityText(t, "replyPlaceholder")}
            sendLabel={communityText(t, "sendReply")}
            sendingLabel={communityText(t, "sendingReply")}
            successLabel={communityText(t, "replySuccess")}
            failureLabel={communityText(t, "replyFailure")}
            alreadyRepliedLabel={communityText(t, "alreadyReplied")}
            disabledLabel={communityText(t, "replyUnavailable")}
          />
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
              {metrics.capabilityRows.some(
                (row) => row.operation === "read_comments" && row.state === "available",
              )
                ? communityText(t, "available")
                : communityText(t, "notValidated")}
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
  basePath,
  metrics,
}: {
  t: Translator;
  basePath: string;
  metrics: Awaited<ReturnType<typeof readMetrics>>;
}) {
  const comments = metrics.inboxItems.filter((item) => item.visibility !== "private");
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
            {communityText(t, "commentsContext")}
          </div>
          <p className="text-label text-fg-muted">{communityText(t, "commentsDescription")}</p>
        </div>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{communityText(t, "commentsTitle")}</CardTitle>
            <CardDescription>{communityText(t, "commentsDescription")}</CardDescription>
          </div>
          <Button asChild variant="secondary">
            <Link href={`${basePath}/inbox?kind=comments`}>
              <Filter className="h-4 w-4" aria-hidden="true" />
              {communityText(t, "openInbox")}
            </Link>
          </Button>
        </CardHeader>
        {comments.length === 0 ? (
          <EmptyCommunity t={t} icon={<MessageCircle className="h-6 w-6" />} />
        ) : (
          <ul className="divide-border divide-y">
            {comments.map((item) => (
              <li key={item.id}>
                <Link
                  href={`${basePath}/inbox?conversation=${item.id}&kind=comments`}
                  className="hover:bg-surface-subtle focus-visible:ring-focus-ring block rounded-[var(--radius-control)] px-3 py-4 focus:outline-none focus-visible:ring-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-label text-fg-muted uppercase">{item.channelType}</span>
                    <Badge variant={item.state === "open" ? "info" : "outline"}>
                      {communityText(t, item.state)}
                    </Badge>
                  </div>
                  <p className="text-body text-fg-primary mt-2 line-clamp-3" dir="auto">
                    {item.body}
                  </p>
                  <p className="text-label text-fg-muted mt-2">
                    {item.authorName ?? communityText(t, "authorUnavailable")}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ReviewsScreen({
  t,
  basePath,
  metrics,
}: {
  t: Translator;
  basePath: string;
  metrics: Awaited<ReturnType<typeof readMetrics>>;
}) {
  const queued = metrics.teamConversations.filter(
    (conversation) => conversation.state === "waiting_approval",
  );
  return (
    <>
      <SectionKpis t={t} metrics={metrics} />
      <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{communityText(t, "reviewsTitle")}</CardTitle>
            <CardDescription>{communityText(t, "pendingReviews")}</CardDescription>
          </CardHeader>
          {queued.length === 0 ? (
            <EmptyCommunity t={t} icon={<FileCheck2 className="h-6 w-6" />} />
          ) : (
            <ul className="divide-border divide-y">
              {queued.map((conversation) => (
                <li key={conversation.id} className="py-3 first:pt-0">
                  <Link
                    href={`${basePath}/inbox?conversation=${conversation.id}`}
                    className="text-body text-primary font-semibold hover:underline"
                    dir="auto"
                  >
                    {conversation.body}
                  </Link>
                  <p className="text-label text-fg-muted mt-1">
                    {conversation.authorName ?? communityText(t, "authorUnavailable")} ·{" "}
                    {conversation.channelType}
                  </p>
                </li>
              ))}
            </ul>
          )}
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
            <Button variant="secondary" disabled data-testid="community-review-reject-disabled">
              <XCircle className="h-4 w-4" aria-hidden="true" />
              {communityText(t, "disabled")}
            </Button>
            <Button disabled data-testid="community-review-approve-disabled">
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
  access,
  agencySlug,
  workspaceSlug,
  canManage,
}: {
  t: Translator;
  metrics: Awaited<ReturnType<typeof readMetrics>>;
  access: Awaited<ReturnType<typeof getCommunityWorkspaceAccess>>;
  agencySlug: string;
  workspaceSlug: string;
  canManage: boolean;
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
        <CommunityEmergencyStopControl
          agencySlug={agencySlug}
          workspaceSlug={workspaceSlug}
          emergencyStop={access.emergencyStop}
          canManage={canManage}
          stopLabel={communityText(t, "stopCommunityActions")}
          resumeLabel={communityText(t, "resumeCommunityActions")}
          stoppedLabel={communityText(t, "communityActionsStopped")}
          runningLabel={communityText(t, "communityActionsRunning")}
          stopTitle={communityText(t, "stopCommunityActionsTitle")}
          stopDescription={communityText(t, "stopCommunityActionsDescription")}
          resumeTitle={communityText(t, "resumeCommunityActionsTitle")}
          resumeDescription={communityText(t, "resumeCommunityActionsDescription")}
          confirmLabel={communityText(t, "confirmSafetyChange")}
          cancelLabel={communityText(t, "cancel")}
          closeLabel={communityText(t, "close")}
          successLabel={communityText(t, "safetyChangeSaved")}
          failureLabel={communityText(t, "safetyChangeFailed")}
        />
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
          {metrics.automationRows.length === 0 ? (
            <EmptyCommunity t={t} icon={<Bot className="h-6 w-6" />} />
          ) : (
            <ul className="divide-border divide-y">
              {metrics.automationRows.map((rule) => (
                <li
                  key={rule.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <span className="text-body text-fg-primary font-medium">{rule.name}</span>
                  <span className="flex gap-2">
                    <Badge variant="outline">{communityText(t, rule.mode)}</Badge>
                    <Badge variant={rule.status === "published" ? "success" : "outline"}>
                      {communityText(t, rule.status)}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{communityText(t, "noRules")}</CardTitle>
            <Button
              variant="secondary"
              disabled
              data-testid="community-automation-configure-disabled"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {communityText(t, "configureAgency")}
            </Button>
          </CardHeader>
          <p className="text-label text-fg-secondary mt-3">
            {communityText(t, "automationSetupUnavailable")}
          </p>
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
          <p className="text-label text-fg-secondary px-3 py-2">
            {communityText(t, "playbooksReadOnly")}
          </p>
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
        {metrics.playbookRows.length === 0 ? (
          <EmptyCommunity t={t} icon={<Database className="h-6 w-6" />} />
        ) : (
          <ul className="divide-border divide-y">
            {metrics.playbookRows.map((playbook) => (
              <li
                key={playbook.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="text-body text-fg-primary font-medium">{playbook.name}</p>
                  <p className="text-label text-fg-muted">
                    {communityText(t, "revisionLabel", { count: playbook.revision })}
                  </p>
                </div>
                <Badge variant={playbook.status === "published" ? "success" : "outline"}>
                  {communityText(t, playbook.status)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function TestLabScreen({
  t,
  agencySlug,
  workspaceSlug,
}: {
  t: Translator;
  agencySlug: string;
  workspaceSlug: string;
}) {
  return (
    <CommunityTestLab
      agencySlug={agencySlug}
      workspaceSlug={workspaceSlug}
      copy={{
        title: communityText(t, "testLabTitle"),
        description: communityText(t, "testLabDescription"),
        channel: communityText(t, "testLabChannel"),
        message: communityText(t, "testLabMessage"),
        scenario: communityText(t, "testLabScenario"),
        scenarioHint: communityText(t, "testLabScenarioHint"),
        messagePlaceholder: communityText(t, "testLabMessagePlaceholder"),
        scenarioPlaceholder: communityText(t, "testLabScenarioPlaceholder"),
        run: communityText(t, "testLabRun"),
        running: communityText(t, "testLabRunning"),
        result: communityText(t, "testLabResult"),
        draft: communityText(t, "testLabDraft"),
        decision: communityText(t, "testLabDecision"),
        explanation: communityText(t, "testLabExplanation"),
        safety: communityText(t, "testLabSafety"),
        noProviderGuarantee: communityText(t, "testLabNoProviderGuarantee"),
        inputRequired: communityText(t, "testLabInputRequired"),
        providerUnavailable: communityText(t, "testLabProviderUnavailable"),
        blocked: communityText(t, "testLabBlocked"),
        needsReview: communityText(t, "testLabNeedsReview"),
        draftDecision: communityText(t, "testLabDraftDecision"),
        escalateDecision: communityText(t, "testLabEscalateDecision"),
        safe: communityText(t, "testLabSafe"),
        review: communityText(t, "testLabReview"),
        safetyBlocked: communityText(t, "testLabSafetyBlocked"),
        noResult: communityText(t, "testLabNoResult"),
        channelFacebookComments: communityText(t, "testLabChannelFacebookComments"),
        channelFacebookPrivateMessages: communityText(t, "testLabChannelFacebookPrivateMessages"),
        channelInstagramComments: communityText(t, "testLabChannelInstagramComments"),
        channelInstagramPrivateMessages: communityText(t, "testLabChannelInstagramPrivateMessages"),
      }}
    />
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
      <SectionKpis t={t} metrics={metrics} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{communityText(t, "volume")}</CardTitle>
          </CardHeader>
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" />}
            title={communityText(t, "analyticsUnavailableTitle")}
            description={communityText(t, "analyticsUnavailableDescription")}
          />
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{communityText(t, "channelHealth")}</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <MetricLine
              label={communityText(t, "responseSla")}
              value={communityText(t, "notMeasured")}
            />
            <MetricLine
              label={communityText(t, "aiQuality")}
              value={communityText(t, "notMeasured")}
            />
            <MetricLine
              label={communityText(t, "reliability")}
              value={communityText(t, "notMeasured")}
            />
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
  locale,
  metrics,
  agencySlug,
  workspaceSlug,
  canManage,
}: {
  t: Translator;
  locale: LocaleCode;
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
  const capabilityDetailLabels: Record<string, string> = {
    mutation_uat_required: "capabilityDetailMutationUat",
    read_not_implemented: "capabilityDetailReadNotImplemented",
    webhooks_not_enabled: "capabilityDetailWebhooks",
    media_context_not_implemented: "capabilityDetailMediaContext",
    conversation_history_not_implemented: "capabilityDetailConversationHistory",
  };
  const readCommentsAvailable = metrics.capabilityRows.some(
    (row) => row.operation === "read_comments" && row.state === "available",
  );
  const syncKinds = [
    { key: "comments" as const, label: communityText(t, "syncComments") },
    { key: "private_messages" as const, label: communityText(t, "syncPrivateMessages") },
  ];
  return (
    <>
      <div className="border-warning/20 bg-warning-subtle text-warning flex items-start gap-3 rounded-[var(--radius-card)] border p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="text-label">{communityText(t, "connectionsDescription")}</p>
        <Link
          href={`${workspaceBasePath(agencySlug, workspaceSlug)}/channels`}
          className="text-warning text-label ms-auto shrink-0 font-semibold underline underline-offset-2"
        >
          {communityText(t, "reconnectMeta")}
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{communityText(t, "meta")}</CardTitle>
              <CardDescription>{communityText(t, "channelHealth")}</CardDescription>
            </div>
            <Badge variant={readCommentsAvailable ? "success" : "outline"}>
              {readCommentsAvailable
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
                {metrics.capabilityRows[0]?.checkedAt
                  ? formatDate(metrics.capabilityRows[0].checkedAt, locale, DateFormat.long)
                  : "—"}
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
            <div className="border-border bg-surface-subtle mt-4 space-y-3 rounded-[var(--radius-control)] border p-3">
              <p className="text-label text-fg-secondary">{communityText(t, "syncStatus")}</p>
              {syncKinds.map(({ key, label }) => {
                const states = metrics.syncStates.filter((state) => state.syncKind === key);
                const failed = states.some((state) => state.status === "failed");
                const running = states.some((state) => state.status === "running");
                const lastCompleted = states
                  .map((state) => state.lastCompletedAt)
                  .filter((value): value is Date => value instanceof Date)
                  .sort((a, b) => b.getTime() - a.getTime())[0];
                return (
                  <div
                    key={key}
                    className="border-border border-t pt-2 first:border-t-0 first:pt-0"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-label text-fg-primary">{label}</span>
                      <Badge variant={failed ? "warning" : running ? "info" : "outline"}>
                        {communityText(
                          t,
                          failed ? "syncFailed" : running ? "syncRunning" : "syncIdle",
                        )}
                      </Badge>
                    </div>
                    <p className="text-label text-fg-muted mt-1">
                      {lastCompleted
                        ? `${communityText(t, "syncLastCompleted")}: ${lastCompleted.toLocaleString()}`
                        : communityText(t, "syncNeverRun")}
                    </p>
                    {failed ? (
                      <p className="text-label text-danger">{communityText(t, "syncError")}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{communityText(t, "operation")}</CardTitle>
            <CardDescription>{communityText(t, "status")}</CardDescription>
          </CardHeader>
          <div className="space-y-2">
            {OPERATION_KEYS.map((operation) => (
              <div
                key={operation}
                className="bg-surface-subtle rounded-[var(--radius-control)] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-label text-fg-primary">
                    {communityText(t, operationLabels[operation])}
                  </span>
                  <Badge
                    variant={
                      metrics.capabilityRows.find((row) => row.operation === operation)?.state ===
                      "available"
                        ? "success"
                        : metrics.capabilityRows.find((row) => row.operation === operation)
                              ?.state === "unavailable"
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
                {(() => {
                  const detail = metrics.capabilityRows.find(
                    (row) => row.operation === operation,
                  )?.detail;
                  const detailCode = firstCapabilityDetail(detail);
                  const missingScopes = missingCapabilityScopes(detailCode);
                  const detailKey =
                    missingScopes.length > 0
                      ? "capabilityDetailMissingScope"
                      : detailCode
                        ? capabilityDetailLabels[detailCode]
                        : undefined;
                  return detailKey ? (
                    <p className="text-label text-fg-muted mt-1">
                      {communityText(t, detailKey, {
                        scopes: missingScopes.join(" or "),
                      })}
                    </p>
                  ) : null;
                })()}
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
  agencySlug,
  workspaceSlug,
  canAssign,
  metrics,
}: {
  t: Translator;
  agencySlug: string;
  workspaceSlug: string;
  canAssign: boolean;
  metrics: Awaited<ReturnType<typeof readMetrics>>;
}) {
  const unassigned = metrics.teamConversations.filter((conversation) => !conversation.assignedTo);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile
          icon={<Users className="h-4 w-4" />}
          label={communityText(t, "teamMembers")}
          value={metrics.assignees.length}
        />
        <KpiTile
          icon={<Inbox className="h-4 w-4" />}
          label={communityText(t, "unassignedConversations")}
          value={unassigned.length}
          tone={unassigned.length ? "warning" : "default"}
        />
        <KpiTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          label={communityText(t, "assignedConversations")}
          value={metrics.teamConversations.length - unassigned.length}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.7fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{communityText(t, "teamTitle")}</CardTitle>
            <CardDescription>{communityText(t, "teamRoutingDescription")}</CardDescription>
          </CardHeader>
          {metrics.assignees.length ? (
            <ul className="space-y-2">
              {metrics.assignees.map((member) => (
                <li
                  key={member.id}
                  className="border-border flex items-center justify-between gap-3 rounded-[var(--radius-control)] border p-3"
                >
                  <span className="text-body text-fg-primary font-medium">{member.name}</span>
                  <Badge variant="outline">
                    {member.openCount} {communityText(t, "assignedConversations")}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyCommunity t={t} icon={<Users className="h-6 w-6" />} />
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{communityText(t, "assignmentQueue")}</CardTitle>
            <CardDescription>{communityText(t, "assignUnassignedHelp")}</CardDescription>
          </CardHeader>
          {metrics.teamConversations.length === 0 ? (
            <EmptyCommunity t={t} icon={<Inbox className="h-6 w-6" />} />
          ) : (
            <ul className="divide-border divide-y">
              {metrics.teamConversations.slice(0, 25).map((conversation) => (
                <li key={conversation.id} className="space-y-3 py-4 first:pt-0">
                  <Link
                    href={`${workspaceBasePath(agencySlug, workspaceSlug)}/engagement/inbox?conversation=${conversation.id}`}
                    className="text-body text-primary block font-semibold hover:underline"
                    dir="auto"
                  >
                    {conversation.body}
                  </Link>
                  <p className="text-label text-fg-muted">
                    {conversation.authorName ?? communityText(t, "authorUnavailable")} ·{" "}
                    {conversation.channelType} · {communityText(t, conversation.state)}
                  </p>
                  <CommunityAssignmentForm
                    agencySlug={agencySlug}
                    workspaceSlug={workspaceSlug}
                    conversationId={conversation.id}
                    assignedTo={conversation.assignedTo}
                    assignees={metrics.assignees}
                    canAssign={canAssign}
                    label={communityText(t, "assign")}
                    unassignedLabel={communityText(t, "ownerUnassigned")}
                    saveLabel={communityText(t, "saveAssignment")}
                    savingLabel={communityText(t, "savingAssignment")}
                    savedLabel={communityText(t, "assignmentSaved")}
                    failedLabel={communityText(t, "assignmentFailed")}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function SettingsScreen({
  t,
  access,
  agencySlug,
  workspaceSlug,
  canManage,
}: {
  t: Translator;
  access: Awaited<ReturnType<typeof getCommunityWorkspaceAccess>>;
  agencySlug: string;
  workspaceSlug: string;
  canManage: boolean;
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
          <CommunityEmergencyStopControl
            agencySlug={agencySlug}
            workspaceSlug={workspaceSlug}
            emergencyStop={access.emergencyStop}
            canManage={canManage}
            stopLabel={communityText(t, "stopCommunityActions")}
            resumeLabel={communityText(t, "resumeCommunityActions")}
            stoppedLabel={communityText(t, "communityActionsStopped")}
            runningLabel={communityText(t, "communityActionsRunning")}
            stopTitle={communityText(t, "stopCommunityActionsTitle")}
            stopDescription={communityText(t, "stopCommunityActionsDescription")}
            resumeTitle={communityText(t, "resumeCommunityActionsTitle")}
            resumeDescription={communityText(t, "resumeCommunityActionsDescription")}
            confirmLabel={communityText(t, "confirmSafetyChange")}
            cancelLabel={communityText(t, "cancel")}
            closeLabel={communityText(t, "close")}
            successLabel={communityText(t, "safetyChangeSaved")}
            failureLabel={communityText(t, "safetyChangeFailed")}
          />
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
  locale,
  metrics,
}: {
  t: Translator;
  locale: LocaleCode;
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
          <Button variant="secondary" disabled data-testid="community-activity-export-disabled">
            <Activity className="h-4 w-4" aria-hidden="true" />
            {communityText(t, "export")}
          </Button>
        </CardHeader>
        {metrics.recentEvents.length > 0 ? (
          <ul className="divide-border divide-y">
            {metrics.recentEvents.map((event) => (
              <li key={event.id} className="py-3 first:pt-0">
                <p className="text-body text-fg-primary font-medium">
                  {event.detail === "community_emergency_stop_enabled" ||
                  event.detail === "community_emergency_stop_disabled"
                    ? communityText(t, event.detail)
                    : event.detail}
                </p>
                <p className="text-label text-fg-muted mt-1">
                  {communityText(t, event.kind)} ·{" "}
                  {formatDate(event.createdAt, locale, DateFormat.long)}
                </p>
              </li>
            ))}
          </ul>
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
  const stepHrefs = [
    `${basePath}/connections`,
    `${basePath}/connections`,
    `${basePath}/playbooks`,
    `${basePath}/settings`,
    `${basePath}/setup`,
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(220px,0.55fr)_minmax(0,1.45fr)]">
      <Card padding="sm">
        <div className="space-y-1">
          {steps.map((step, index) => (
            <Link
              key={step}
              href={stepHrefs[index] ?? basePath}
              className="hover:bg-surface-subtle focus-visible:ring-focus-ring flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-3 focus:outline-none focus-visible:ring-2"
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${index === 0 ? "bg-primary text-white" : "bg-surface-subtle text-fg-muted"}`}
              >
                {index + 1}
              </span>
              <span className="text-label text-fg-primary font-medium">{step}</span>
            </Link>
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
  searchParams,
}: {
  params: Promise<{ agencySlug: string; slug: string; section?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { agencySlug, slug, section } = await params;
  const routeQuery = await searchParams;
  const selectedConversationId =
    typeof routeQuery.conversation === "string" ? routeQuery.conversation : undefined;
  const requestedKind = typeof routeQuery.kind === "string" ? routeQuery.kind : undefined;
  const conversationQuery = typeof routeQuery.q === "string" ? routeQuery.q : undefined;
  const workspace = await getAccessibleWorkspaceAtPath({ id: session.user.id }, agencySlug, slug);
  if (!workspace) notFound();
  const { t, code } = await tForActive();
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
  const canAssign =
    canManage ||
    (await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["content_planner"]));
  const canReply = await canReplyInCommunityInbox({ id: session.user.id }, workspace);
  const metrics = access.planIncluded
    ? await readMetrics(workspace.id, {
        ...(selectedConversationId ? { selectedConversationId } : {}),
        ...(requestedKind ? { kind: requestedKind } : {}),
        ...(conversationQuery ? { query: conversationQuery } : {}),
      })
    : {
        conversations: 0,
        priorityCounts: {},
        messages: 0,
        reviews: 0,
        channels: 0,
        capabilities: 0,
        capabilityRows: [],
        sends: 0,
        syncStates: [],
        events: 0,
        rules: 0,
        playbooks: 0,
        recentEvents: [],
        automationRows: [],
        playbookRows: [],
        inboxItems: [],
        selectedConversation: null,
        selectedThread: [],
        kind: "all",
        query: "",
        assignees: [],
        teamConversations: [],
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
            {access.allowed ? communityText(t, "moduleEnabled") : communityText(t, "notValidated")}
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
          <InboxScreen
            t={t}
            basePath={basePath}
            metrics={metrics}
            agencySlug={agencySlug}
            workspaceSlug={slug}
            canManage={canManage}
            canAssign={canAssign}
            canReply={canReply}
          />
        ) : currentSection === "comments" ? (
          <CommentsScreen t={t} basePath={basePath} metrics={metrics} />
        ) : currentSection === "reviews" ? (
          <ReviewsScreen t={t} basePath={basePath} metrics={metrics} />
        ) : currentSection === "automations" ? (
          <AutomationsScreen
            t={t}
            metrics={metrics}
            access={access}
            agencySlug={agencySlug}
            workspaceSlug={slug}
            canManage={canManage}
          />
        ) : currentSection === "playbooks" ? (
          <PlaybooksScreen t={t} metrics={metrics} />
        ) : currentSection === "test-lab" ? (
          <TestLabScreen t={t} agencySlug={agencySlug} workspaceSlug={slug} />
        ) : currentSection === "analytics" ? (
          <AnalyticsScreen t={t} metrics={metrics} />
        ) : currentSection === "connections" ? (
          <ConnectionsScreen
            t={t}
            locale={code as LocaleCode}
            metrics={metrics}
            agencySlug={agencySlug}
            workspaceSlug={slug}
            canManage={canManage}
          />
        ) : currentSection === "team" ? (
          <TeamScreen
            t={t}
            agencySlug={agencySlug}
            workspaceSlug={slug}
            canAssign={canAssign}
            metrics={metrics}
          />
        ) : currentSection === "settings" ? (
          <SettingsScreen
            t={t}
            access={access}
            agencySlug={agencySlug}
            workspaceSlug={slug}
            canManage={canManage}
          />
        ) : currentSection === "activity" ? (
          <ActivityScreen t={t} locale={code as LocaleCode} metrics={metrics} />
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

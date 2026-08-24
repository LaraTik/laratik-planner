import Link from "next/link";
import { notFound } from "next/navigation";
import { count, desc, eq, sql } from "drizzle-orm";
import { ArrowLeft, Building2, Sparkles, Users2, Workflow } from "lucide-react";
import { db } from "@/lib/db";
import { agencyMemberships, agencies, aiUsageEvents, workspaces } from "@/lib/db/schema";
import { PageHeader } from "@/components/workspace/page-header";
import { KpiTile } from "@/components/workspace/kpi-tile";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { EmptyState } from "@/components/feedback/empty-state";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import { PlanAiSections } from "./plan-ai-sections";
import { SupportAccessSection } from "./support-section";
import { PlatformEditAgencyForm } from "./edit-agency-form";

/**
 * Platform · Agency detail — Stitch screen
 * `f8ea956a96644f0f9e39b5d9e368e457`.
 *
 * The page combines the M1 overview with M2 plan, usage, AI, and
 * lifecycle controls. All mutations remain platform-admin gated.
 */
export const metadata = { title: "Platform · Agency" };

// See /app/platform/overview for the rationale.
export const dynamic = "force-dynamic";

type AgencyDetail = {
  id: string;
  name: string;
  slug: string;
  locale: string;
  timezone: string;
  createdAt: Date;
  bootstrapCompletedAt: Date | null;
  memberCount: number;
  workspaceCount: number;
  totalAiCalls: number;
  recentWorkspaces: Array<{ id: string; name: string; slug: string; updatedAt: Date }>;
};

async function loadAgencyDetail(agencyId: string): Promise<AgencyDetail | null> {
  const [agency] = await db
    .select({
      id: agencies.id,
      name: agencies.name,
      slug: agencies.slug,
      locale: agencies.locale,
      timezone: agencies.timezone,
      createdAt: agencies.createdAt,
      bootstrapCompletedAt: agencies.bootstrapCompletedAt,
    })
    .from(agencies)
    .where(eq(agencies.id, agencyId))
    .limit(1);
  if (!agency) return null;

  const [memberRow, workspaceRow, aiRow] = await Promise.all([
    db
      .select({ value: sql<number>`count(distinct ${agencyMemberships.userId})` })
      .from(agencyMemberships)
      .where(
        sql`${agencyMemberships.agencyId} = ${agencyId} and ${agencyMemberships.status} = 'active'`,
      ),
    db
      .select({ value: count() })
      .from(workspaces)
      .where(sql`${workspaces.agencyId} = ${agencyId} and ${workspaces.archivedAt} is null`),
    db
      .select({ value: count() })
      .from(aiUsageEvents)
      .where(sql`${aiUsageEvents.agencyId} = ${agencyId} and ${aiUsageEvents.succeeded} = true`),
  ]);

  const recentWorkspaces = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      updatedAt: workspaces.updatedAt,
    })
    .from(workspaces)
    .where(eq(workspaces.agencyId, agencyId))
    .orderBy(desc(workspaces.updatedAt))
    .limit(10);

  return {
    id: agency.id,
    name: agency.name,
    slug: agency.slug,
    locale: agency.locale,
    timezone: agency.timezone,
    createdAt: agency.createdAt,
    bootstrapCompletedAt: agency.bootstrapCompletedAt,
    memberCount: Number(memberRow[0]?.value ?? 0),
    workspaceCount: Number(workspaceRow[0]?.value ?? 0),
    totalAiCalls: Number(aiRow[0]?.value ?? 0),
    recentWorkspaces,
  };
}

export default async function PlatformAgencyDetailPage({
  params,
}: {
  params: Promise<{ agencyId: string }>;
}) {
  const { agencyId } = await params;
  const detail = await loadAgencyDetail(agencyId);
  if (!detail) notFound();

  return (
    <>
      <Link
        href="/app/platform/agencies"
        className="text-primary focus-visible:ring-focus-ring text-body inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
        data-testid="platform-agency-back"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to agencies
      </Link>

      <PageHeader
        eyebrow="Platform · Agency"
        title={detail.name}
        description={
          <>
            Slug <span className="text-fg-primary font-semibold">{detail.slug}</span> · created{" "}
            {formatRelativeDate(detail.createdAt)}
            {detail.bootstrapCompletedAt ? (
              <> · bootstrap completed {formatRelativeDate(detail.bootstrapCompletedAt)}</>
            ) : null}
          </>
        }
        action={
          <Link
            href={`/app/platform/agencies/${detail.id}#plan`}
            className="border-border bg-surface text-fg-primary hover:bg-surface-subtle focus-visible:ring-focus-ring text-button inline-flex items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2 font-semibold focus:outline-none focus-visible:ring-2"
            data-testid="platform-agency-view-plan"
          >
            View plan
          </Link>
        }
      />

      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        data-testid="platform-agency-kpi-row"
      >
        <KpiTile
          icon={<Users2 className="h-4 w-4" aria-hidden="true" />}
          label="Active members"
          value={detail.memberCount}
          data-testid="platform-agency-kpi-members"
        />
        <KpiTile
          icon={<Workflow className="h-4 w-4" aria-hidden="true" />}
          label="Workspaces"
          value={detail.workspaceCount}
          data-testid="platform-agency-kpi-workspaces"
        />
        <KpiTile
          icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
          label="AI usage (calls)"
          value={detail.totalAiCalls}
          tone="success"
          data-testid="platform-agency-kpi-ai"
        />
      </div>

      {/* Anchor nav (M3.4 — agency detail polish). Each link
          jumps to the corresponding section id; the existing
          PlanAiSections already exposes id="plan", id="usage",
          and id="ai" anchors, and the form below exposes
          id="identity". This is the lightweight version of the
          plan's tab refactor: the page stays a single scroll,
          but the user can deep-link to any section via the
          URL hash, and the nav strip keeps the affordance
          discoverable. */}
      <nav
        aria-label="Agency detail sections"
        className="border-border bg-surface-subtle flex flex-wrap items-center gap-1 rounded-[var(--radius-control)] border p-1"
        data-testid="platform-agency-section-nav"
      >
        {[
          { href: "identity", label: "Identity" },
          { href: "workspaces", label: "Workspaces" },
          { href: "plan", label: "Plan and usage" },
          { href: "ai", label: "AI" },
          { href: "security", label: "Security" },
        ].map((s) => (
          <a
            key={s.href}
            href={`#${s.href}`}
            className="text-body text-fg-secondary hover:bg-surface focus-visible:ring-focus-ring rounded-[var(--radius-control)] px-3 py-1.5 font-semibold focus:outline-none focus-visible:ring-2"
            data-testid={`platform-agency-section-nav-${s.href}`}
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div data-testid="platform-agency-identity-section" id="identity">
        <PlatformEditAgencyForm
          agencyId={detail.id}
          initialName={detail.name}
          initialSlug={detail.slug}
          initialLocale={detail.locale}
          initialTimezone={detail.timezone}
        />
      </div>

      <Card id="workspaces" padding="lg" className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Workspaces in this agency</CardTitle>
            <CardDescription>
              The 10 most recently updated workspaces in this tenant.
            </CardDescription>
          </div>
          <span
            className="text-fg-muted text-label"
            data-testid="platform-agency-workspace-total"
            title="Total non-archived workspaces"
          >
            {detail.workspaceCount} total
          </span>
        </div>
        {detail.recentWorkspaces.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-8 w-8" aria-hidden="true" />}
            title="No workspaces yet"
            description="The agency has not created any workspaces. Workspace creation happens inside the agency, not from the platform console."
          />
        ) : (
          <DataTable
            data-testid="platform-agency-workspaces-table"
            getRowKey={(w) => w.id}
            getRowTestId={(w) => `platform-agency-ws-row-${w.id}`}
            rows={detail.recentWorkspaces}
            columns={workspaceColumns()}
          />
        )}
      </Card>

      <PlanAiSections agencyId={detail.id} />

      <div id="security">
        <SupportAccessSection agencyId={detail.id} />
      </div>
    </>
  );
}

function workspaceColumns(): DataTableColumnDef<{
  id: string;
  name: string;
  slug: string;
  updatedAt: Date;
}>[] {
  return [
    {
      key: "name",
      header: "Workspace",
      headerClassName: "w-1/2",
      cell: (w) => (
        <div className="min-w-0">
          <p className="text-body text-fg-primary truncate font-semibold">{w.name}</p>
          <p className="text-label text-fg-muted truncate">{w.slug}</p>
        </div>
      ),
    },
    {
      key: "updated",
      header: "Last activity",
      cell: (w) => formatRelativeDate(w.updatedAt),
    },
    {
      key: "hint",
      header: "",
      cellClassName: "text-right",
      cell: () => (
        <span
          className="bg-surface-subtle text-fg-muted text-label rounded-[var(--radius-control)] px-2 py-0.5"
          title="Cross-tenant navigation is restricted; M2 will provide a safe deep-link."
        >
          tenant-only
        </span>
      ),
    },
  ];
}

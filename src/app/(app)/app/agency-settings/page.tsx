import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, KeyRound, Server, Users2 } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies, agencyMemberships, workspaces } from "@/lib/db/schema";
import { serverEnv } from "@/lib/validation/env";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/workspace/page-header";
import { EditAgencyForm } from "@/components/forms/edit-agency-form";

/**
 * Agency-level identity and operational configuration (M3.4 — agency CRUD).
 *
 * The agency admin can now edit the agency's own identity
 * (name, slug, locale, timezone). The page renders a four-card
 * row: identity (editable for admins), footprint (read-only),
 * plan (read-only, links to /app/agency-settings/plan), and
 * managed services (read-only status board).
 *
 * The non-admin / non-signed-in paths redirect to /signin.
 * Forbidden (signed in, not admin) shows a friendly page with
 * a back link to /app.
 */
export const metadata = { title: "Agency Settings" };

export default async function AgencySettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) redirect("/setup");
  const isAdmin = await isAgencyAdmin(actor, agencyId);
  if (!isAdmin) {
    return (
      <div className="space-y-4" data-testid="agency-settings-forbidden">
        <PageHeader
          title="Forbidden"
          description="Only agency admins can change agency settings."
        />
        <Link
          href="/app"
          className="text-primary focus-visible:ring-focus-ring inline-block rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        >
          ← Back to My Work
        </Link>
      </div>
    );
  }

  const [[agency], [workspaceCount], [memberCount]] = await Promise.all([
    db
      .select({
        id: agencies.id,
        name: agencies.name,
        slug: agencies.slug,
        locale: agencies.locale,
        timezone: agencies.timezone,
      })
      .from(agencies)
      .where(eq(agencies.id, agencyId))
      .limit(1),
    db.select({ value: count() }).from(workspaces).where(eq(workspaces.agencyId, agencyId)),
    db
      .select({ value: count() })
      .from(agencyMemberships)
      .where(eq(agencyMemberships.agencyId, agencyId)),
  ]);
  if (!agency) redirect("/setup");

  // Pre-compute the managed-services status (read-only display).
  const envEnabled = serverEnv.AI_FEATURE_ENABLED && !!serverEnv.MINIMAX_API_KEY;

  return (
    <div className="space-y-6" data-testid="agency-settings">
      <PageHeader
        title="Agency Settings"
        description="Agency identity, access footprint, and environment-managed services."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card data-testid="agency-settings-footprint">
          <div className="text-primary mb-2 flex items-center gap-2">
            <Building2 className="h-5 w-5" aria-hidden="true" />
            <CardTitle>Footprint</CardTitle>
          </div>
          <CardDescription className="mb-4">
            Live counts for this agency. The numbers are read-only — they update as workspaces,
            members, and content change.
          </CardDescription>
          <dl className="space-y-3">
            <Row label="Workspaces" value={String(workspaceCount?.value ?? 0)} />
            <Row
              label="Members"
              value={String(memberCount?.value ?? 0)}
              href="/app/users"
              testId="agency-settings-members-link"
            />
          </dl>
        </Card>

        <Card data-testid="agency-settings-plan-link">
          <div className="text-primary mb-2 flex items-center gap-2">
            <Users2 className="h-5 w-5" aria-hidden="true" />
            <CardTitle>Plan and usage</CardTitle>
          </div>
          <CardDescription className="mb-4">
            Read-only plan limits and live usage counters.
          </CardDescription>
          <Link
            href="/app/agency-settings/plan"
            className="text-primary focus-visible:ring-focus-ring text-body inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            data-testid="agency-settings-plan-link-anchor"
          >
            Open plan and usage →
          </Link>
        </Card>

        <Card data-testid="agency-settings-services">
          <div className="text-primary mb-2 flex items-center gap-2">
            <Server className="h-5 w-5" aria-hidden="true" />
            <CardTitle>Managed services</CardTitle>
          </div>
          <CardDescription className="mb-4">
            Status of environment-managed credentials. Keys are never shown here.
          </CardDescription>
          <div className="space-y-3">
            <Service
              label="Google OAuth"
              enabled={!!(serverEnv.GOOGLE_CLIENT_ID && serverEnv.GOOGLE_CLIENT_SECRET)}
              testId="agency-service-google-oauth"
            />
            <Service
              label="Magic-link email"
              enabled={!!(serverEnv.SMTP_HOST && serverEnv.SMTP_USER)}
              testId="agency-service-magic-link"
            />
            <Service
              label="AI provider"
              enabled={envEnabled}
              testId="agency-service-minimax-ai"
              href="/app/agency-settings/ai"
            />
            <Service
              label="Sentry"
              enabled={!!serverEnv.SENTRY_DSN}
              testId="agency-service-sentry"
            />
          </div>
          <p className="text-label text-fg-muted mt-4 flex items-start gap-1.5">
            <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Credentials are managed by the deployment environment and are never shown here.
            </span>
          </p>
        </Card>
      </div>

      <EditAgencyForm
        initialName={agency.name}
        initialSlug={agency.slug}
        initialLocale={agency.locale}
        initialTimezone={agency.timezone}
      />
    </div>
  );
}

function Row({
  label,
  value,
  href,
  testId,
}: {
  label: string;
  value: string;
  href?: string;
  testId?: string;
}) {
  const inner = (
    <div
      className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0 last:pb-0"
      data-testid={testId}
    >
      <dt className="text-body text-fg-secondary">{label}</dt>
      <dd className="text-body text-fg-primary font-semibold break-all">{value}</dd>
    </div>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="text-primary focus-visible:ring-focus-ring block rounded-[var(--radius-control)] px-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}

function Service({
  label,
  enabled,
  testId,
  href,
}: {
  label: string;
  enabled: boolean;
  testId?: string;
  href?: string;
}) {
  const inner = (
    <>
      <span className="text-body text-fg-primary">{label}</span>
      <Badge variant={enabled ? "success" : "outline"}>{enabled ? "Configured" : "Disabled"}</Badge>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="border-border focus-visible:ring-focus-ring flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border-b pb-3 last:border-0 last:pb-0 hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        data-testid={testId}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div
      className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0 last:pb-0"
      data-testid={testId}
    >
      {inner}
    </div>
  );
}

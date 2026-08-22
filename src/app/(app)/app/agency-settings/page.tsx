import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { firstAgencyForBootstrap, isAgencyAdmin } from "@/lib/auth/policy";
import { redirect } from "next/navigation";
import { ArrowLeft, Building2, KeyRound, Server } from "lucide-react";
import { db } from "@/lib/db";
import { agencies, agencyMemberships, workspaces } from "@/lib/db/schema";
import { count, eq } from "drizzle-orm";
import { serverEnv } from "@/lib/validation/env";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/workspace/page-header";

/**
 * Agency-level identity and operational configuration summary.
 *
 * This page is read-only: every field is derived from either the
 * `agencies` row or environment-managed credentials (OAuth client,
 * SMTP, AI provider, Sentry). There are no inputs on this page —
 * mutations happen via `/app/users` (invitations) and the platform
 * deployment environment (credentials). The "Managed services" card
 * is therefore a status board, not a form.
 *
 * Layout: two cards in a `sm:grid-cols-2` row — agency identity
 * (name / slug / workspace count / member count) and managed services
 * (Google OAuth / SMTP / AI / Sentry). Each managed service is a row
 * with a `Badge` (Configured / Disabled) so the status is announced
 * both visually and to screen readers.
 */
export const metadata = { title: "Agency Settings" };

export default async function AgencySettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const agencyId = await firstAgencyForBootstrap();
  if (!agencyId) redirect("/setup");
  if (!(await isAgencyAdmin({ id: session.user.id }, agencyId))) {
    return (
      <div className="space-y-4" data-testid="agency-settings-forbidden">
        <PageHeader
          title="Forbidden"
          description="Only agency admins can change agency settings."
        />
        <Link
          href="/app"
          className="text-primary focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          data-testid="agency-settings-back"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to My Work
        </Link>
      </div>
    );
  }

  const [[agency], [workspaceCount], [memberCount]] = await Promise.all([
    db.select().from(agencies).where(eq(agencies.id, agencyId)).limit(1),
    db.select({ value: count() }).from(workspaces).where(eq(workspaces.agencyId, agencyId)),
    db
      .select({ value: count() })
      .from(agencyMemberships)
      .where(eq(agencyMemberships.agencyId, agencyId)),
  ]);
  if (!agency) redirect("/setup");
  return (
    <div className="space-y-6" data-testid="agency-settings">
      <PageHeader
        title="Agency Settings"
        description="Agency identity, access footprint, and environment-managed services."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card data-testid="agency-settings-identity">
          <div className="text-primary mb-2 flex items-center gap-2">
            <Building2 className="h-5 w-5" aria-hidden="true" />
            <CardTitle>Agency</CardTitle>
          </div>
          <CardDescription className="mb-4">
            The shared identity for every workspace in your agency.
          </CardDescription>
          <dl className="space-y-3">
            <Row label="Name" value={agency.name} testId="agency-name" />
            <Row label="Slug" value={agency.slug} testId="agency-slug" />
            <Row
              label="Workspaces"
              value={String(workspaceCount?.value ?? 0)}
              testId="agency-workspace-count"
            />
            <Row
              label="Members"
              value={String(memberCount?.value ?? 0)}
              testId="agency-member-count"
            />
          </dl>
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
              label="MiniMax AI"
              enabled={serverEnv.AI_FEATURE_ENABLED && !!serverEnv.MINIMAX_API_KEY}
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
    </div>
  );
}

function Row({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div
      className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0 last:pb-0"
      data-testid={testId}
    >
      <dt className="text-body text-fg-secondary">{label}</dt>
      <dd className="text-body text-fg-primary font-semibold break-all">{value}</dd>
    </div>
  );
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
        data-testid={testId}
        className="border-border focus-visible:ring-focus-ring flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border-b pb-3 last:border-0 last:pb-0 hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
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

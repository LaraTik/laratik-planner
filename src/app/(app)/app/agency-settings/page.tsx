import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { activeAgencyId, isAgencyAdmin } from "@/lib/auth/policy";
import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { db } from "@/lib/db";
import { agencies, agencyMemberships, workspaces } from "@/lib/db/schema";
import { count, eq } from "drizzle-orm";
import { serverEnv } from "@/lib/validation/env";
import { Badge } from "@/components/ui/badge";

/**
 * Agency-level identity and operational configuration summary.
 */
export const metadata = { title: "Agency Settings" };

export default async function AgencySettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const agencyId = await activeAgencyId();
  if (!agencyId) redirect("/setup");
  if (!(await isAgencyAdmin({ id: session.user.id }, agencyId))) {
    return (
      <div className="space-y-4">
        <h1 className="text-title-page text-fg-primary font-semibold">Forbidden</h1>
        <p className="text-body text-fg-secondary">
          Only agency admins can change agency settings.
        </p>
        <Link href="/app" className="text-primary underline-offset-4 hover:underline">
          ← Back to My Work
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
    <div className="space-y-6">
      <header>
        <h1 className="text-title-page text-fg-primary font-semibold">Agency Settings</h1>
        <p className="text-body text-fg-secondary mt-1">
          Agency identity, access footprint, and environment-managed services.
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="border-border bg-surface rounded-[var(--radius-card)] border p-5">
          <div className="text-primary flex items-center gap-2">
            <Settings className="h-5 w-5" />
            <h2 className="text-title-card text-fg-primary font-semibold">Agency</h2>
          </div>
          <dl className="mt-4 space-y-3">
            <Row label="Name" value={agency.name} />
            <Row label="Slug" value={agency.slug} />
            <Row label="Workspaces" value={String(workspaceCount?.value ?? 0)} />
            <Row label="Members" value={String(memberCount?.value ?? 0)} />
          </dl>
        </section>
        <section className="border-border bg-surface rounded-[var(--radius-card)] border p-5">
          <h2 className="text-title-card font-semibold">Managed services</h2>
          <div className="mt-4 space-y-3">
            <Service
              label="Google OAuth"
              enabled={!!(serverEnv.GOOGLE_CLIENT_ID && serverEnv.GOOGLE_CLIENT_SECRET)}
            />
            <Service
              label="Magic-link email"
              enabled={!!(serverEnv.SMTP_HOST && serverEnv.SMTP_USER)}
            />
            <Service
              label="MiniMax AI"
              enabled={serverEnv.AI_FEATURE_ENABLED && !!serverEnv.MINIMAX_API_KEY}
            />
            <Service label="Sentry" enabled={!!serverEnv.SENTRY_DSN} />
          </div>
          <p className="text-label text-fg-muted mt-4">
            Credentials are managed by the deployment environment and are never shown here.
          </p>
        </section>
      </div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-body text-fg-secondary">{label}</dt>
      <dd className="text-body font-semibold">{value}</dd>
    </div>
  );
}
function Service({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-body">{label}</span>
      <Badge variant={enabled ? "success" : "outline"}>{enabled ? "Configured" : "Disabled"}</Badge>
    </div>
  );
}

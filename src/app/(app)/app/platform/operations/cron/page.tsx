import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  KeyRound,
  PlayCircle,
  RefreshCcw,
  ServerOff,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { KpiTile } from "@/components/workspace/kpi-tile";
import { PageHeader } from "@/components/workspace/page-header";
import { PermissionNotice } from "@/components/platform/permission-notice";
import { currentActor } from "@/lib/auth/current-actor";
import { requirePlatformPermission } from "@/lib/auth/platform-access";
import { runSocialMetricsNowAction } from "@/app/(app)/app/platform/operations/cron/actions";
import {
  ageTone,
  EXPECTED_CADENCE_MS,
  getCronHealth,
  getMultiCronLogTail,
  type CronHealth,
} from "@/lib/cron/health";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import { cn } from "@/lib/utils";

/**
 * Platform console — Cron health (M4.7 / Phase 2 of the
 * social-cron-admin plan).
 *
 * Read-only view of every cron that has written at least one row
 * to `cron_tick_history` in the last 30 days. One card per cron
 * with: last-tick age (color-coded), 24h aggregate counts, a
 * 24-tick sparkline, and an expandable "log tail" of the last 30
 * ticks across all crons. The page also surfaces three env-level
 * master switches the operator needs to see at a glance:
 *
 *   - `SOCIAL_SYNC_ENABLED` — master kill switch for the
 *     social-metrics cron
 *   - `SOCIAL_TOKEN_ENCRYPTION_KEY` — the platform KEK; the
 *     social-metrics tick becomes a no-op when missing
 *   - `CRON_SECRET` — bearer-secret that authenticates every
 *     `/api/cron/*` request
 *
 * Gating: `platform.console.read` (the same permission the rest
 * of the platform console uses). The Run-now action in Phase 3
 * uses `platform.console.manage`; that permission check lives in
 * the action handler, not here, so the read-only surface is
 * available to read-only platform auditors.
 *
 * Refresh: the page is `force-dynamic`. After a Run-now mutation
 * we call `revalidatePath('/app/platform/operations/cron')` so
 * the card updates on the same response cycle.
 */

export const metadata = { title: "Platform · Cron health" };
export const dynamic = "force-dynamic";

const PAGE_SIZE_LOG_TAIL = 30;

export default async function PlatformCronHealthPage() {
  const actor = await currentActor();
  if (!actor) {
    return (
      <PermissionNotice
        title="Sign in required"
        description="Sign in to view the platform cron health page."
      />
    );
  }
  try {
    await requirePlatformPermission(actor, "platform.console.read");
  } catch {
    return (
      <PermissionNotice
        title="Cron health unavailable"
        description="Your platform role does not include the console.read permission."
      />
    );
  }

  // Capture the request-time clock once. The strict react-hooks
  // purity rule complains about bare `Date.now()` calls; this is
  // the established pattern across the platform console
  // (see /app/platform/errors/page.tsx).
  const now = new Date();
  const { crons, socialSyncEnabled, platformKekAvailable, cronSecretConfigured } =
    await getCronHealth(now);
  const logTail = await getMultiCronLogTail(
    crons.map((c) => c.cronName),
    PAGE_SIZE_LOG_TAIL,
  );

  // Quick regression: if a "Run now" landed on a server-rendered
  // /signin fallback (cookie missing), bail to the sign-in page
  // rather than rendering the page on a missing auth state.
  // (Defense in depth — the action's auth check should already
  // have caught this.)
  if (!actor) redirect("/signin");

  return (
    <div className="space-y-6" data-testid="platform-cron-health">
      <PageHeader
        eyebrow="Platform / Operations"
        title="Cron health"
        description="Heartbeat of every cron that writes to cron_tick_history. The 15-min social-metrics cron is the headline card; the rest follow the same pattern."
        action={
          <Link
            href="/app/platform/overview"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            data-testid="platform-cron-back"
          >
            Back to overview
          </Link>
        }
      />

      <EnvSwitchesStrip
        socialSyncEnabled={socialSyncEnabled}
        platformKekAvailable={platformKekAvailable}
        cronSecretConfigured={cronSecretConfigured}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="platform-cron-kpis">
        <KpiTile
          icon={<Activity className="h-4 w-4" aria-hidden={true} />}
          label="Active crons"
          value={crons.length}
          data-testid="platform-cron-kpi-active"
        />
        <KpiTile
          icon={<AlertTriangle className="h-4 w-4" aria-hidden={true} />}
          label="Errors in last 24h"
          value={crons.reduce((acc, c) => acc + c.rollup24h.errorCount, 0)}
          tone={
            crons.reduce((acc, c) => acc + c.rollup24h.errorCount, 0) > 0 ? "warning" : "default"
          }
          data-testid="platform-cron-kpi-errors"
        />
        <KpiTile
          icon={<Timer className="h-4 w-4" aria-hidden={true} />}
          label="Ticks in last 24h"
          value={crons.reduce((acc, c) => acc + c.rollup24h.ticks, 0)}
          data-testid="platform-cron-kpi-ticks"
        />
      </div>

      {crons.length === 0 ? (
        <Card padding="lg" data-testid="platform-cron-empty">
          <EmptyState
            icon={<ServerOff className="h-8 w-8" aria-hidden={true} />}
            title="No cron ticks recorded yet"
            description="The cron routes write one row per tick to cron_tick_history. After the next 15-minute tick lands, this page will populate."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4" data-testid="platform-cron-cards">
          {crons.map((c) => (
            <CronCard key={c.cronName} cron={c} now={now} />
          ))}
        </div>
      )}

      <Card padding="none" data-testid="platform-cron-log-tail">
        <header className="border-border border-b px-4 py-3">
          <CardTitle>Recent ticks (last 30)</CardTitle>
          <CardDescription>
            Newest first across every active cron. Each row is one tick; the outcome column is the
            raw enum (`success` / `soft_deadline` / `error` / `skipped`).
          </CardDescription>
        </header>
        {logTail.length === 0 ? (
          <div className="p-6" data-testid="platform-cron-log-tail-empty">
            <EmptyState
              icon={<Clock className="h-6 w-6" aria-hidden={true} />}
              title="No ticks yet"
              description="Once a cron ticks, the latest row will appear here."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="platform-cron-log-tail-table">
              <thead className="border-border bg-surface-subtle text-label text-fg-secondary">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">When</th>
                  <th className="px-3 py-2 text-left font-semibold">Cron</th>
                  <th className="px-3 py-2 text-left font-semibold">Outcome</th>
                  <th className="px-3 py-2 text-right font-semibold">Claimed</th>
                  <th className="px-3 py-2 text-right font-semibold">Ok</th>
                  <th className="px-3 py-2 text-right font-semibold">Failed</th>
                  <th className="px-3 py-2 text-left font-semibold">Trigger</th>
                  <th className="px-3 py-2 text-left font-semibold">Note</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {logTail.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-surface-subtle"
                    data-testid={`platform-cron-log-row-${row.id}`}
                  >
                    <td className="text-body text-fg-secondary px-3 py-2 font-mono">
                      {formatRelativeDate(row.startedAt, now)}
                    </td>
                    <td className="text-body text-fg-primary px-3 py-2 font-mono">
                      {row.cronName}
                    </td>
                    <td className="px-3 py-2">
                      <OutcomeBadge outcome={row.outcome} />
                    </td>
                    <td className="text-body text-fg-primary px-3 py-2 text-right tabular-nums">
                      {row.claimed}
                    </td>
                    <td className="text-body text-fg-primary px-3 py-2 text-right tabular-nums">
                      {row.succeeded}
                    </td>
                    <td className="text-body text-fg-primary px-3 py-2 text-right tabular-nums">
                      {row.failed}
                    </td>
                    <td className="text-label text-fg-muted px-3 py-2 font-mono">
                      {row.triggeredBy}
                    </td>
                    <td className="text-label text-fg-secondary px-3 py-2">
                      {row.errorText ? (
                        <span className="text-danger line-clamp-1" title={row.errorText}>
                          {row.errorText}
                        </span>
                      ) : (
                        <span className="text-fg-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card padding="lg" variant="subtle" data-testid="platform-cron-explainer">
        <CardTitle>What this shows</CardTitle>
        <CardDescription>
          Every cron route (`/api/cron/social-metrics`, `/api/cron/outbox`, etc.) writes one row to{" "}
          <code className="text-label bg-surface mx-1 rounded px-1.5 py-0.5 font-mono">
            cron_tick_history
          </code>{" "}
          at the end of every tick — success, soft deadline, flag-off short-circuit, or exception.
          The last-tick dot is green when the age is within 2× the cron&apos;s expected cadence,
          amber inside 4×, red beyond that. Retention is 30 days (
          <code className="text-label bg-surface mx-1 rounded px-1.5 py-0.5 font-mono">
            CRON_TICK_RETENTION_DAYS
          </code>
          ).
        </CardDescription>
      </Card>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function EnvSwitchesStrip({
  socialSyncEnabled,
  platformKekAvailable,
  cronSecretConfigured,
}: {
  socialSyncEnabled: boolean;
  platformKekAvailable: boolean;
  cronSecretConfigured: boolean;
}) {
  return (
    <div
      className="border-border bg-surface-subtle grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-3"
      data-testid="platform-cron-env-strip"
    >
      <EnvSwitch
        label="SOCIAL_SYNC_ENABLED"
        ok={socialSyncEnabled}
        okText="on"
        badText="off"
        icon={<PlayCircle className="h-4 w-4" aria-hidden={true} />}
        testId="platform-cron-env-social-sync"
      />
      <EnvSwitch
        label="SOCIAL_TOKEN_ENCRYPTION_KEY"
        ok={platformKekAvailable}
        okText="set"
        badText="missing"
        icon={<KeyRound className="h-4 w-4" aria-hidden={true} />}
        testId="platform-cron-env-kek"
      />
      <EnvSwitch
        label="CRON_SECRET"
        ok={cronSecretConfigured}
        okText="set"
        badText="missing"
        icon={<ShieldCheck className="h-4 w-4" aria-hidden={true} />}
        testId="platform-cron-env-cron-secret"
      />
    </div>
  );
}

function EnvSwitch({
  label,
  ok,
  okText,
  badText,
  icon,
  testId,
}: {
  label: string;
  ok: boolean;
  okText: string;
  badText: string;
  icon: React.ReactNode;
  testId: string;
}) {
  return (
    <div className="flex items-center gap-2" data-testid={testId} data-state={ok ? "ok" : "bad"}>
      <span className={ok ? "text-success" : "text-danger"} aria-hidden={true}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-label text-fg-muted font-mono">{label}</p>
        <p className="text-body text-fg-primary font-semibold">{ok ? okText : badText}</p>
      </div>
      <Badge variant={ok ? "success" : "danger"} data-testid={`${testId}-badge`}>
        {ok ? "ok" : "alert"}
      </Badge>
    </div>
  );
}

function CronCard({ cron, now }: { cron: CronHealth; now: Date }) {
  const ageMs = cron.latest
    ? now.getTime() - cron.latest.startedAt.getTime()
    : Number.POSITIVE_INFINITY;
  const tone = cron.latest ? ageTone(ageMs, cron.cronName) : "red";
  const expectedCadenceMs = EXPECTED_CADENCE_MS[cron.cronName] ?? 15 * 60_000;
  const cadenceLabel = formatCadence(expectedCadenceMs);

  return (
    <Card padding="lg" data-testid={`platform-cron-card-${cron.cronName}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 inline-flex h-2.5 w-2.5 shrink-0 rounded-full",
              tone === "green" && "bg-success",
              tone === "amber" && "bg-warning",
              tone === "red" && "bg-danger",
            )}
            aria-hidden={true}
            data-testid={`platform-cron-card-${cron.cronName}-dot`}
            data-tone={tone}
          />
          <div>
            <CardTitle>
              <code className="font-mono text-base">{cron.cronName}</code>
            </CardTitle>
            <CardDescription>
              Expected cadence: every {cadenceLabel}.{" "}
              {tone === "red" && cron.latest ? "Last tick is overdue — investigate." : null}
            </CardDescription>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <p
            className="text-label text-fg-muted font-mono"
            data-testid={`platform-cron-card-${cron.cronName}-last`}
          >
            {cron.latest
              ? `last tick ${formatRelativeDate(cron.latest.startedAt, now)}`
              : "no ticks recorded"}
          </p>
          <p className="text-label text-fg-muted">
            {cron.latest ? new Date(cron.latest.startedAt).toISOString().slice(0, 19) + "Z" : "—"}
          </p>
        </div>
      </header>

      <div
        className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"
        data-testid={`platform-cron-card-${cron.cronName}-counts`}
      >
        <CountCell label="24h ticks" value={cron.rollup24h.ticks} testId="ticks" />
        <CountCell label="24h claimed" value={cron.rollup24h.claimed} testId="claimed" />
        <CountCell
          label="24h failed"
          value={cron.rollup24h.failed}
          testId="failed"
          danger={cron.rollup24h.failed > 0}
        />
        <CountCell
          label="24h needs-reauth"
          value={cron.rollup24h.needsReauth}
          testId="needs-reauth"
          danger={cron.rollup24h.needsReauth > 0}
        />
      </div>

      <div className="mt-4">
        <p className="text-label text-fg-muted mb-1">Last 24 ticks (claim count per tick)</p>
        <Sparkline
          values={cron.recent24.map((r) => r.claimed).reverse()}
          testId={`platform-cron-card-${cron.cronName}-sparkline`}
        />
      </div>

      {cron.rollup24h.lastErrorText ? (
        <div
          className="border-danger/30 bg-danger/5 text-danger mt-4 flex items-start gap-2 rounded-md border p-3"
          data-testid={`platform-cron-card-${cron.cronName}-error`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden={true} />
          <div className="min-w-0">
            <p className="text-body font-semibold">Last error</p>
            <p className="text-label text-fg-secondary mt-0.5 break-all">
              {cron.rollup24h.lastErrorText}
            </p>
          </div>
        </div>
      ) : null}

      {cron.cronName === "social-metrics" ? (
        <form
          action={async (formData: FormData) => {
            // The action ignores formData — the Run-now target
            // is hardcoded to the social-metrics cron. We swallow
            // the result because the page's `revalidatePath`
            // already re-renders the card on the next request.
            void formData;
            await runSocialMetricsNowAction();
          }}
          className="mt-4 flex flex-wrap items-center justify-between gap-2"
        >
          <p className="text-label text-fg-muted">
            Trigger a synchronous social-metrics tick. Audit-logged.
          </p>
          <button
            type="submit"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
            data-testid="platform-cron-run-now-social-metrics"
          >
            <RefreshCcw className="h-4 w-4" aria-hidden={true} />
            Run now
          </button>
        </form>
      ) : null}
    </Card>
  );
}

function CountCell({
  label,
  value,
  testId,
  danger = false,
}: {
  label: string;
  value: number;
  testId: string;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border p-3",
        danger ? "border-danger/30 bg-danger/5" : "border-border bg-surface-subtle",
      )}
      data-testid={`platform-cron-count-${testId}`}
    >
      <p className="text-label text-fg-muted">{label}</p>
      <p
        className={cn(
          "text-title-card mt-1 font-semibold tabular-nums",
          danger ? "text-danger" : "text-fg-primary",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: "success" | "soft_deadline" | "error" | "skipped" }) {
  switch (outcome) {
    case "success":
      return (
        <Badge variant="success" data-testid="outcome-success">
          <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden={true} />
          success
        </Badge>
      );
    case "soft_deadline":
      return (
        <Badge variant="warning" data-testid="outcome-soft-deadline">
          <Clock className="mr-1 h-3 w-3" aria-hidden={true} />
          soft_deadline
        </Badge>
      );
    case "error":
      return (
        <Badge variant="danger" data-testid="outcome-error">
          <AlertTriangle className="mr-1 h-3 w-3" aria-hidden={true} />
          error
        </Badge>
      );
    case "skipped":
      return (
        <Badge variant="outline" data-testid="outcome-skipped">
          <Database className="mr-1 h-3 w-3" aria-hidden={true} />
          skipped
        </Badge>
      );
  }
}

function Sparkline({ values, testId }: { values: number[]; testId: string }) {
  if (values.length === 0) {
    return (
      <p className="text-label text-fg-muted" data-testid={testId} data-empty="true">
        No ticks in the last 24h.
      </p>
    );
  }
  const width = 240;
  const height = 32;
  const max = Math.max(1, ...values);
  const barW = Math.max(2, Math.floor(width / values.length) - 1);
  return (
    <svg
      role="img"
      aria-label={`Claim count over the last ${values.length} ticks`}
      data-testid={testId}
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full max-w-full"
      preserveAspectRatio="none"
    >
      {values.map((v, i) => {
        const h = Math.max(1, Math.round((v / max) * (height - 4)));
        const x = i * (barW + 1);
        const y = height - h;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={h}
            rx={1}
            fill="currentColor"
            className="text-primary/70"
            data-value={v}
          />
        );
      })}
    </svg>
  );
}

function formatCadence(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

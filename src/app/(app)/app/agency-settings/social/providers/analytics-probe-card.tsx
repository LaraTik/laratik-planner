"use client";

import { useState } from "react";
import { Activity, CheckCircle2, Info, MinusCircle, ShieldCheck, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocaleT } from "@/components/i18n/locale-provider";

type ProbeProfile = {
  channelId: string;
  workspaceId: string;
  workspaceName: string;
  accountName: string;
  platform: "facebook" | "instagram" | "tiktok";
};

type ProbeResponse = {
  profile: ProbeProfile;
  permissions: Array<{ permission: string; status: string }>;
  metrics: Record<string, { status: string; providerErrorCode?: string }>;
  testedAt: string;
};

export function AnalyticsProbeCard({ profiles }: { profiles: ProbeProfile[] }) {
  const t = useLocaleT();
  const [channelId, setChannelId] = useState(profiles[0]?.channelId ?? "");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ProbeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tr = (key: string, fallback: string) => t?.(key) ?? fallback;

  async function runProbe() {
    if (!channelId) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/social/providers/analytics-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channelId }),
      });
      const payload = (await response.json().catch(() => null)) as
        ProbeResponse | { error?: string } | null;
      if (!response.ok || !payload || !("metrics" in payload)) {
        setError(
          tr("agencyProviders.analyticsProbeFailed", "The analytics probe could not be completed."),
        );
        return;
      }
      setResult(payload);
    } catch {
      setError(
        tr("agencyProviders.analyticsProbeFailed", "The analytics probe could not be completed."),
      );
    } finally {
      setPending(false);
    }
  }

  const groups = [
    ...new Map(profiles.map((profile) => [profile.workspaceId, profile.workspaceName])).entries(),
  ];
  return (
    <Card padding="md" data-testid="analytics-probe-card">
      <header className="flex items-center gap-2">
        <ShieldCheck className="text-primary h-4 w-4" aria-hidden="true" />
        <h3 className="text-body text-fg-primary font-semibold">
          {tr("agencyProviders.analyticsProbeHeading", "Analytics permission probe")}
        </h3>
      </header>
      <p className="text-label text-fg-secondary mt-1">
        {tr(
          "agencyProviders.analyticsProbeBody",
          "Select a connected profile to verify the Meta scopes and current metric access without changing stored analytics data.",
        )}
      </p>
      {profiles.length === 0 ? (
        <p className="text-label text-fg-muted mt-4">
          {tr("agencyProviders.analyticsProbeEmpty", "No connected Meta profiles are available.")}
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-label text-fg-secondary flex min-w-64 flex-1 flex-col gap-1">
            {tr("agencyProviders.analyticsProbeProfile", "Profile")}
            <select
              value={channelId}
              onChange={(event) => setChannelId(event.target.value)}
              className="border-border bg-surface text-fg-primary text-body min-h-10 rounded-md border px-3"
              data-testid="analytics-probe-profile"
            >
              {groups.map(([workspaceId, workspaceName]) => (
                <optgroup key={workspaceId} label={workspaceName}>
                  {profiles
                    .filter((profile) => profile.workspaceId === workspaceId)
                    .map((profile) => (
                      <option key={profile.channelId} value={profile.channelId}>
                        {profile.accountName} · {profile.platform}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <Button
            type="button"
            onClick={runProbe}
            disabled={pending || !channelId}
            data-testid="analytics-probe-run"
          >
            <Activity className="me-1.5 h-4 w-4" aria-hidden="true" />
            {pending
              ? tr("agencyProviders.analyticsProbePending", "Checking…")
              : tr("agencyProviders.analyticsProbeRun", "Run probe")}
          </Button>
        </div>
      )}
      {error ? (
        <p className="text-label text-danger mt-3" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <div
          className="border-border bg-surface-subtle mt-4 rounded-md border p-3"
          data-testid="analytics-probe-result"
        >
          <p className="text-label text-fg-primary font-semibold">{result.profile.accountName}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {Object.entries(result.metrics).map(([metric, status]) => {
              // Status → icon + tooltip mapping. The four statuses
              // mean four different things; do not collapse them.
              //   available   → green check (data flowing)
              //   unsupported → muted info  (platform contract — e.g.
              //                 Pages have no accounts_engaged in v25.0)
              //   no_data     → muted minus (metric is supported but
              //                 Meta returned an empty window, e.g. a
              //                 new account that has not accrued data)
              //   error       → warning X    (Meta rejected the call;
              //                 see providerErrorCode for the reason)
              // 2026-09-05: the previous shape used a single XCircle
              // for every non-available status, which made the
              // by-design `unsupported` row on the Page branch
              // (engagedAccounts) look identical to a real failure
              // (reach / views with metric_unavailable). The new
              // shape distinguishes them with a colour-coded icon
              // and a per-status hover title that points operators at
              // the diagnostic they need.
              const StatusIcon =
                {
                  available: CheckCircle2,
                  unsupported: Info,
                  no_data: MinusCircle,
                  error: XCircle,
                }[status.status] ?? XCircle;
              const iconClass =
                {
                  available: "text-success",
                  unsupported: "text-fg-muted",
                  no_data: "text-fg-muted",
                  error: "text-warning",
                }[status.status] ?? "text-warning";
              const title = probeStatusTitle({
                metric,
                platform: result.profile.platform,
                status: status.status,
                providerErrorCode: status.providerErrorCode,
                tr,
              });
              return (
                <p
                  key={metric}
                  className="text-label text-fg-secondary inline-flex items-center gap-1.5"
                  data-testid={`analytics-probe-metric-${metric}`}
                  data-status={status.status}
                  title={title}
                >
                  <StatusIcon className={`${iconClass} h-3.5 w-3.5`} aria-hidden="true" />
                  {metric}: {status.status}
                  {status.providerErrorCode ? ` · ${status.providerErrorCode}` : ""}
                </p>
              );
            })}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * Build the hover title for a single probe row. Operators see the
 * probe card while triaging which channels need attention; the
 * tooltip replaces the old one-line `X unavailable` with a
 * status-specific reason and, for the most common by-design case
 * (engagedAccounts on a Facebook Page), the platform contract that
 * justifies the row.
 *
 * 2026-09-05: introduced to disambiguate `unsupported` (platform
 * contract) from `error` (real failure) on the operator card. The
 * two cases were visually identical before; operators were
 * filing "engagedAccounts is broken on every Facebook Page" tickets
 * when the row is in fact the correct render. See
 * `docs/decisions/0005-platform-aware-social-metric-contract.md`.
 */
function probeStatusTitle(args: {
  metric: string;
  platform: "facebook" | "instagram" | "tiktok";
  status: string;
  providerErrorCode: string | undefined;
  tr: (key: string, fallback: string) => string;
}): string {
  const { metric, platform, status, providerErrorCode, tr } = args;

  if (status === "available") {
    return tr(
      "agencyProviders.analyticsProbeTooltipAvailable",
      "Metric is supported and Meta returned a value for the current window.",
    );
  }

  if (status === "unsupported") {
    if (metric === "engagedAccounts" && platform === "facebook") {
      return tr(
        "agencyProviders.analyticsProbeTooltipUnsupportedFacebookEngaged",
        "Facebook Pages do not expose an accounts_engaged metric in the Graph API. Use the daily engaged users number in Page Insights UI instead. See ADR 0005.",
      );
    }
    return tr(
      "agencyProviders.analyticsProbeTooltipUnsupportedGeneric",
      "This platform does not expose this metric. The capability registry in src/lib/social/metrics.ts is the source of truth; see ADR 0005.",
    );
  }

  if (status === "no_data") {
    return tr(
      "agencyProviders.analyticsProbeTooltipNoData",
      "Metric is supported but Meta returned an empty window — usually a new account or a period with no activity. Re-test in 24-48h.",
    );
  }

  // status === "error"
  if (providerErrorCode === "metric_unavailable") {
    return tr(
      "agencyProviders.analyticsProbeTooltipErrorMetricUnavailable",
      "Meta returned error code 100 for this metric — usually app mode (In Development), missing Standard Access on App Review, or a Page access token missing a task. Triage: docs/operations/meta-devtools-mcp.md.",
    );
  }
  if (providerErrorCode === "permission_denied") {
    return tr(
      "agencyProviders.analyticsProbeTooltipErrorPermissionDenied",
      "The connector's access token is missing a required scope. Reconnect the channel from /app/agency-settings/social to refresh the token.",
    );
  }
  if (providerErrorCode === "auth_expired") {
    return tr(
      "agencyProviders.analyticsProbeTooltipErrorAuthExpired",
      "The connector's access token has expired or been revoked. Reconnect the channel.",
    );
  }
  if (providerErrorCode === "rate_limited") {
    return tr(
      "agencyProviders.analyticsProbeTooltipErrorRateLimited",
      "Meta throttled the request. The probe will retry on the next tick — usually < 1h.",
    );
  }
  return tr(
    "agencyProviders.analyticsProbeTooltipErrorGeneric",
    `Meta returned an error (${providerErrorCode ?? "unknown"}). See the MCP triage doc.`,
  );
}

"use client";

import { useState } from "react";
import { Activity, CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
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
            {Object.entries(result.metrics).map(([metric, status]) => (
              <p
                key={metric}
                className="text-label text-fg-secondary inline-flex items-center gap-1.5"
              >
                {status.status === "available" ? (
                  <CheckCircle2 className="text-success h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <XCircle className="text-warning h-3.5 w-3.5" aria-hidden="true" />
                )}
                {metric}: {status.status}
                {status.providerErrorCode ? ` · ${status.providerErrorCode}` : ""}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

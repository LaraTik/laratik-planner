import { GitCommitHorizontal, Server } from "lucide-react";
import type { BuildInfo } from "@/lib/build-info";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { CopyBuildInfoButton } from "./copy-build-info";

export function ApplicationInfoCard({ buildInfo }: { buildInfo: BuildInfo }) {
  return (
    <Card aria-labelledby="application-info-heading" data-testid="application-info-card">
      <CardTitle id="application-info-heading" className="mb-1 flex items-center gap-2">
        <GitCommitHorizontal className="h-4 w-4" aria-hidden="true" />
        Application information
      </CardTitle>
      <p className="text-body text-fg-muted mb-5">Use these details when reporting a problem.</p>

      <dl className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-start">
        <dt className="text-body text-fg-muted flex items-center gap-1.5">
          <GitCommitHorizontal className="h-3.5 w-3.5" aria-hidden="true" /> Build
        </dt>
        <dd
          className="border-border bg-surface-subtle text-fg-primary min-w-0 rounded-[var(--radius-control)] border px-3 py-2 font-mono text-[13px] leading-5 break-all"
          data-testid="application-build-sha"
        >
          {buildInfo.fullSha ?? buildInfo.displayLabel}
        </dd>
        <dt className="text-body text-fg-muted flex items-center gap-1.5">
          <Server className="h-3.5 w-3.5" aria-hidden="true" /> Environment
        </dt>
        <dd>
          <Badge variant="default">{buildInfo.environmentLabel}</Badge>
        </dd>
      </dl>

      <CopyBuildInfoButton buildInfo={buildInfo} />
    </Card>
  );
}

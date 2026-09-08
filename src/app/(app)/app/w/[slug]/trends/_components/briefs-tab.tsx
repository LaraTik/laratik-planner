"use client";

import * as React from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { useLocaleT } from "@/components/i18n/locale-provider";

export function TrendsBriefsTab({ workspaceSlug: _workspaceSlug }: { workspaceSlug: string }) {
  const t = useLocaleT();
  const [briefs, setBriefs] = React.useState<
    Array<{
      id: string;
      contentItemId: string;
      title: string;
      status: string;
      signalLabel: string | null;
      velocityAtSchedule: number | null;
    }>
  >([]);
  React.useEffect(() => {
    void fetch(`/api/trends/briefs?workspace=${encodeURIComponent(_workspaceSlug)}`)
      .then((response) => (response.ok ? response.json() : { briefs: [] }))
      .then((body: { briefs?: typeof briefs }) => setBriefs(body.briefs ?? []))
      .catch(() => setBriefs([]));
  }, [_workspaceSlug]);
  return (
    <div
      data-testid="trends-briefs"
      className="border-border bg-surface-subtle rounded-[var(--radius-card)] border p-8 text-center"
    >
      <FileText className="text-fg-muted mx-auto h-10 w-10" aria-hidden="true" />
      <h2 className="text-title-card text-fg-primary mt-3 font-semibold">
        {t("trends.briefs.title") || "Closed-loop briefs"}
      </h2>
      {briefs.length === 0 ? (
        <p className="text-body text-fg-secondary mx-auto mt-2 max-w-md">
          {t("trends.briefs.body") || "Briefs created with Use in brief will appear here."}
        </p>
      ) : (
        <ul className="mt-5 space-y-2 text-start">
          {briefs.map((brief) => (
            <li
              key={brief.id}
              className="border-border bg-surface-card rounded-[var(--radius-control)] border p-3"
            >
              <Link
                className="text-title-card text-fg-primary font-semibold hover:underline"
                href={`/app/w/${_workspaceSlug}/planning/${brief.contentItemId}`}
              >
                {brief.title}
              </Link>
              <p className="text-label text-fg-muted mt-1">
                {brief.signalLabel ?? "Trend signal"} · {brief.status}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

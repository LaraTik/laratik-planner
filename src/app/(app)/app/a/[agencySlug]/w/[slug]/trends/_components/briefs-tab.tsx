"use client";

import * as React from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";
import { formatDate } from "@/lib/i18n/format-locale";

export function TrendsBriefsTab({
  workspaceSlug: _workspaceSlug,
  workspaceTimezone,
}: {
  workspaceSlug: string;
  workspaceTimezone: string;
}) {
  const t = useLocaleT();
  const locale = useLocaleCode();
  const [briefs, setBriefs] = React.useState<
    Array<{
      id: string;
      contentItemId: string;
      title: string;
      status: string;
      signalLabel: string | null;
      velocityAtSchedule: number | null;
      createdAt: string;
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
                <bdi dir="auto">{brief.title}</bdi>
              </Link>
              <p className="text-label text-fg-muted mt-1">
                <bdi dir="auto">{brief.signalLabel ?? t("trends.briefs.signalFallback")}</bdi>
                {" · "}
                {t(
                  `trends.briefs.status${brief.status
                    .split("_")
                    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                    .join("")}`,
                ) || brief.status}
              </p>
              <p className="text-label text-fg-muted mt-1">
                {t("trends.briefs.created", {
                  value: formatDate(new Date(brief.createdAt), locale, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    timeZone: workspaceTimezone,
                  }),
                })}
              </p>
              <span className="sr-only">{t("trends.briefs.open") || "Open brief"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

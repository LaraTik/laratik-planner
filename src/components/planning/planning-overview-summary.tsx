import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, Clock3 } from "lucide-react";
import type { PlanningAttentionItem } from "@/lib/planning/presentation";

type Translator = (key: string, params?: Record<string, string | number>) => string;

export interface PlanningOverviewSummaryProps {
  statusLabel: string;
  formatLabel: string;
  plannedPublishAt: string;
  channelsSummary: string;
  ownerName: string | null;
  updatedAt: string;
  readinessBlockers: number;
  readinessCanPublish: boolean;
  readiness: Array<{
    id: string;
    label: string;
    status: "ready" | "warning" | "danger" | "neutral";
    detail?: string;
    href?: string;
  }>;
  attention: PlanningAttentionItem[];
  recentActivity: Array<{
    id: string;
    summary: string;
    actorName: string;
    occurredAt: string;
  }>;
  totalActivityCount: number;
  t: Translator;
}

function workspaceHref(href: string | undefined): string {
  const tab = href?.replace(/^#/, "");
  if (tab === "content" || tab === "delivery" || tab === "assets-versions") return "#create";
  if (tab === "copy" || tab === "preview" || tab === "publishing" || tab === "messages") {
    return "#publish";
  }
  if (tab === "activity") return "#activity";
  return "#overview";
}

function statusIcon(status: PlanningOverviewSummaryProps["readiness"][number]["status"]) {
  if (status === "ready") return CheckCircle2;
  if (status === "danger") return AlertTriangle;
  return Circle;
}

export function PlanningOverviewSummary({
  statusLabel,
  formatLabel,
  plannedPublishAt,
  channelsSummary,
  ownerName,
  updatedAt,
  readinessBlockers,
  readinessCanPublish,
  readiness,
  attention,
  recentActivity,
  totalActivityCount,
  t,
}: PlanningOverviewSummaryProps) {
  const createReady = readiness.find((line) => line.id === "content")?.status === "ready";
  const deliveryReady = readiness.find((line) => line.id === "assets")?.status === "ready";
  const publishReady = readiness.find((line) => line.id === "publishing")?.status === "ready";
  const stages = [
    { id: "create", label: t("contentDetail.tabs.create"), ready: createReady, href: "#create" },
    {
      id: "delivery",
      label: t("contentDetail.overview.deliveryStage"),
      ready: deliveryReady,
      href: "#create",
    },
    {
      id: "publish",
      label: t("contentDetail.tabs.publish"),
      ready: publishReady,
      href: "#publish",
    },
  ];

  return (
    <div className="space-y-6" data-testid="planning-overview-summary">
      <header className="border-border bg-surface rounded-[var(--radius-card)] border p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-label text-fg-secondary font-semibold uppercase">
              {t("contentDetail.overview.progress")}
            </p>
            <p className="text-body text-fg-secondary mt-2">{statusLabel}</p>
          </div>
          <div className="text-label text-fg-secondary flex flex-wrap gap-x-4 gap-y-2">
            <span>{formatLabel}</span>
            <span>{channelsSummary}</span>
            <span>{plannedPublishAt}</span>
          </div>
        </div>

        <ol
          className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3"
          aria-label={t("contentDetail.overview.progress")}
        >
          {stages.map((stage, index) => {
            const Icon = stage.ready
              ? CheckCircle2
              : index === 0 || stages[index - 1]?.ready
                ? Circle
                : Clock3;
            return (
              <li key={stage.id}>
                <Link
                  href={stage.href}
                  className="border-border bg-surface-subtle hover:bg-surface flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Icon
                    className={stage.ready ? "text-success h-4 w-4" : "text-fg-muted h-4 w-4"}
                    aria-hidden="true"
                  />
                  <span className="text-body text-fg-primary font-semibold">{stage.label}</span>
                  <span className="text-label text-fg-muted ms-auto">
                    {stage.ready
                      ? t("contentDetail.overview.complete")
                      : t("contentDetail.overview.open")}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </header>

      <section
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        aria-label={t("contentDetail.overview.details")}
      >
        <div className="border-border bg-surface rounded-[var(--radius-card)] border p-4">
          <h3 className="text-section-title text-fg-primary font-semibold">
            {t("contentDetail.overview.details")}
          </h3>
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-label text-fg-secondary">{t("contentDetail.overview.owner")}</dt>
              <dd className="text-body text-fg-primary mt-1 font-medium">
                {ownerName ?? t("contentDetail.overview.unassigned")}
              </dd>
            </div>
            <div>
              <dt className="text-label text-fg-secondary">
                {t("contentDetail.overview.lastUpdated")}
              </dt>
              <dd className="text-body text-fg-primary mt-1 font-medium">{updatedAt}</dd>
            </div>
          </dl>
        </div>

        <div
          className="border-border bg-surface rounded-[var(--radius-card)] border p-4"
          data-testid="overview-needs-attention"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-section-title text-fg-primary font-semibold">
              {t("contentDetail.overview.needsAttention")}
            </h3>
            <span className="text-label text-fg-muted">
              {t("contentDetail.overview.attentionCount", { count: attention.length })}
            </span>
          </div>
          {attention.length > 0 ? (
            <ul className="divide-border mt-3 divide-y">
              {attention.slice(0, 5).map((item) => (
                <li key={`${item.path}:${item.code}`}>
                  <Link
                    href={workspaceHref(item.destinationTab)}
                    className="text-body text-fg-primary flex min-h-11 items-start gap-2 py-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <AlertTriangle
                      className="text-warning mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{item.messageKey ? t(item.messageKey) : item.message}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-fg-secondary mt-3">
              {t("contentDetail.overview.noAttention")}
            </p>
          )}
        </div>
      </section>

      <section
        className="border-border bg-surface rounded-[var(--radius-card)] border p-4"
        data-testid="overview-readiness-summary"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-section-title text-fg-primary font-semibold">
            {t("contentDetail.overview.readiness")}
          </h3>
          <span
            className={
              readinessCanPublish
                ? "text-label text-success font-semibold"
                : "text-label text-warning font-semibold"
            }
          >
            {readinessCanPublish
              ? t("contentDetail.overview.readyToPublish")
              : t("contentDetail.overview.remaining", { count: readinessBlockers })}
          </span>
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {readiness.map((line) => {
            const Icon = statusIcon(line.status);
            const content = (
              <>
                <Icon
                  className={
                    line.status === "ready" ? "text-success h-4 w-4" : "text-warning h-4 w-4"
                  }
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="text-body text-fg-primary block font-semibold">
                    {line.label}
                  </span>
                  {line.detail ? (
                    <span className="text-label text-fg-secondary mt-0.5 block">{line.detail}</span>
                  ) : null}
                </span>
              </>
            );
            return (
              <li key={line.id}>
                {line.href ? (
                  <Link
                    href={workspaceHref(line.href)}
                    className="border-border bg-surface-subtle hover:bg-surface flex min-h-11 items-start gap-2 rounded-[var(--radius-control)] border p-3 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="border-border bg-surface-subtle flex min-h-11 items-start gap-2 rounded-[var(--radius-control)] border p-3">
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section
        className="border-border bg-surface rounded-[var(--radius-card)] border p-4"
        data-testid="overview-recent-activity"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-section-title text-fg-primary font-semibold">
            {t("contentDetail.overview.recentActivity")}
          </h3>
          <Link
            href="#activity"
            className="text-label text-primary inline-flex min-h-11 items-center font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {t("contentDetail.overview.viewAll")} ({totalActivityCount})
          </Link>
        </div>
        {recentActivity.length > 0 ? (
          <ol className="divide-border mt-2 divide-y">
            {recentActivity.map((event) => (
              <li key={event.id} className="py-3">
                <p className="text-body text-fg-primary">{event.summary}</p>
                <p className="text-label text-fg-muted mt-1">
                  <bdi>{event.actorName}</bdi> ·{" "}
                  <time dateTime={event.occurredAt}>{event.occurredAt}</time>
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-body text-fg-secondary mt-3">
            {t("contentDetail.overview.noActivity")}
          </p>
        )}
      </section>
    </div>
  );
}

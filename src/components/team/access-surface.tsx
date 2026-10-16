import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function AccessHero({
  scope,
  title,
  description,
  icon,
  action,
  tone = "agency",
}: {
  scope: string;
  title: React.ReactNode;
  description: React.ReactNode;
  icon: React.ReactNode;
  action?: React.ReactNode;
  tone?: "agency" | "workspace";
}) {
  return (
    <section
      className={cn(
        "access-hero rounded-[var(--radius-card)] border p-4 sm:p-5 lg:p-6",
        tone === "agency" ? "access-hero-agency" : "access-hero-workspace",
      )}
      aria-labelledby="access-surface-title"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <span
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] shadow-sm sm:h-14 sm:w-14",
              tone === "agency"
                ? "bg-primary text-primary-foreground"
                : "bg-info text-primary-foreground",
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1
                id="access-surface-title"
                className="text-title-section text-fg-primary font-semibold text-balance"
              >
                {title}
              </h1>
              <Badge variant={tone === "agency" ? "primary" : "info"}>{scope}</Badge>
            </div>
            <p className="text-body text-fg-secondary max-w-3xl text-pretty">{description}</p>
          </div>
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    </section>
  );
}

export function AccessStat({
  label,
  value,
  detail,
  icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  detail?: string;
  icon: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const toneClasses = {
    default: "border-s-fg-muted text-fg-muted",
    success: "border-s-success text-success",
    warning: "border-s-warning text-warning",
    danger: "border-s-danger text-danger",
    info: "border-s-info text-info",
  } as const;

  return (
    <Card
      padding="sm"
      className={cn("border-s-4", toneClasses[tone])}
      data-testid={`access-stat-${label.toLowerCase().replaceAll(" ", "-")}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-label text-fg-muted font-semibold tracking-wide uppercase">{label}</p>
          <p className="text-title-page text-fg-primary mt-1 font-semibold tabular-nums">{value}</p>
          {detail ? <p className="text-label text-fg-muted mt-1">{detail}</p> : null}
        </div>
        <span
          className="bg-surface-subtle flex h-9 w-9 items-center justify-center rounded-full"
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>
    </Card>
  );
}

export function RoleDistribution({
  title,
  roles,
  emptyLabel,
}: {
  title: string;
  roles: ReadonlyArray<{
    label: string;
    count: number;
    tone: "primary" | "success" | "warning" | "info" | "default";
  }>;
  emptyLabel: string;
}) {
  return (
    <Card padding="sm" className="min-w-0" aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-title-card text-fg-primary font-semibold">{title}</h2>
        <span className="bg-primary-subtle text-primary rounded-full px-2 py-1 text-xs font-semibold">
          {roles.reduce((sum, role) => sum + role.count, 0)}
        </span>
      </div>
      {roles.length === 0 ? (
        <p className="text-body text-fg-muted">{emptyLabel}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {roles.map((role) => (
            <Badge key={role.label} variant={role.tone}>
              <span className="tabular-nums">{role.count}</span>
              <span className="ms-1">{role.label}</span>
            </Badge>
          ))}
        </div>
      )}
    </Card>
  );
}

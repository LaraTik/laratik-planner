import * as React from "react";
import { CalendarCheck2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LeadTimeDeadline — a small helper that renders the date
 * the cycle lands on if the workspace started a post today.
 *
 * Renders "If you start today, deadline lands on Mon 28 Oct"
 * in the workspace's timezone. Live-updates as the form's
 * total cycle time changes (the parent passes the current
 * `totalDays` and a `Date` for 'today').
 *
 * Calendar math: business days = Mon-Fri. We add 1 calendar
 * day for every 5 business days to approximate (4 business
 * days per calendar week). Close enough for a "what date
 * would this be?" preview; the planning surface uses the
 * real timezone-aware calendar for the authoritative number.
 */
export function LeadTimeDeadline({
  totalDays,
  today,
  timezone,
}: {
  totalDays: number;
  today: Date;
  timezone: string;
}) {
  if (totalDays <= 0) {
    return (
      <p
        className="text-label text-fg-muted inline-flex items-center gap-1"
        data-testid="lead-times-deadline"
      >
        <CalendarCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
        Set at least one lead time to see the deadline preview.
      </p>
    );
  }
  const deadline = addBusinessDays(today, totalDays);
  const label = formatDate(deadline, timezone);
  const isFarOut = totalDays > 45;
  return (
    <p
      className={cn(
        "text-label inline-flex items-center gap-1",
        isFarOut ? "text-warning" : "text-fg-muted",
      )}
      data-testid="lead-times-deadline"
    >
      <CalendarCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
      <span>
        If you start today, the deadline lands on{" "}
        <span
          className={cn("font-bold", isFarOut ? "text-warning" : "text-fg-primary")}
          data-testid="lead-times-deadline-date"
        >
          {label}
        </span>
        {isFarOut ? " — that's a long cycle." : "."}
      </span>
    </p>
  );
}

function addBusinessDays(start: Date, days: number): Date {
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

function formatDate(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: timezone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(date);
  }
}

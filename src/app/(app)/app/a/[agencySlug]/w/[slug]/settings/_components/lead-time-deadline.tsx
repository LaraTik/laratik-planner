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
  live = false,
}: {
  totalDays: number;
  today: Date;
  timezone: string;
  /** When true, the line is rendered as a live preview that
   *  updates as the form's draft changes. The wording flips
   *  to a more conversational "with these buffers" so the
   *  user knows the date is the live draft, not the saved
   *  value. */
  live?: boolean;
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
        {live ? "With these buffers," : "If you start today,"} the deadline lands on{" "}
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
    const parts = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
      timeZone: timezone,
    })
      .formatToParts(date)
      .reduce<Record<string, string>>((result, part) => {
        result[part.type] = part.value;
        return result;
      }, {});
    const month = Number(parts.month);
    const day = Number(parts.day);
    const weekday = new Date(Date.UTC(Number(parts.year), month - 1, day)).getUTCDay();
    return `${WEEKDAYS[weekday]} ${day} ${MONTHS[month - 1]}`;
  } catch {
    return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  }
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

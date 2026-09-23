import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CheckSquare2, FileText } from "lucide-react";
import { toZonedTime } from "date-fns-tz";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import {
  getAgencyCalendarView,
  getAgencyTimezone,
  type AgencyCalendarEvent,
} from "@/lib/planning/calendar";
import { workspaceMonthRange } from "@/lib/i18n/workspace-month";
import { formatDate } from "@/lib/i18n/format-locale";
import { tForActive } from "@/lib/i18n/t-for-active";
import type { LocaleCode } from "@/lib/i18n/locales";
import { PageHeader } from "@/components/workspace/page-header";
import { MonthNav } from "@/components/workspace/month-nav";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: t("calendar.globalTitle") };
}

function weekdays(code: LocaleCode) {
  return Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(code, { weekday: "short" }).format(new Date(2024, 0, 7 + index)),
  );
}

function eventLabel(
  event: AgencyCalendarEvent,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  return event.kind === "task"
    ? t(`tasks.status.${event.status}`)
    : t(`planningFilters.statusLabels.${event.status}`);
}

function EventCard({
  event,
  t,
}: {
  event: AgencyCalendarEvent;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <Link
      href={event.href}
      className="border-border bg-surface hover:border-primary/50 focus-visible:ring-focus-ring block rounded-[var(--radius-control)] border p-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <span className="text-label text-fg-muted inline-flex items-center gap-1 font-semibold">
        {event.kind === "task" ? (
          <CheckSquare2 className="h-3 w-3" aria-hidden="true" />
        ) : (
          <FileText className="h-3 w-3" aria-hidden="true" />
        )}
        {event.kind === "task" ? t("calendar.globalTask") : t("calendar.globalPlan")}
      </span>
      <span className="text-label text-fg-primary mt-1 block font-semibold wrap-break-word">
        {event.title}
      </span>
      <span className="text-label text-fg-muted mt-1 block truncate">
        {event.workspaceName ?? t("calendar.globalNoWorkspace")}
      </span>
      <span className="text-label text-fg-secondary mt-1 block">{eventLabel(event, t)}</span>
    </Link>
  );
}

export default async function GlobalCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { t, code } = await tForActive();
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) redirect("/setup");
  const requested = (await searchParams).month;
  const valid = requested?.match(/^(\d{4})-(\d{2})$/);
  const agencyTimezone = await getAgencyTimezone(actor, context.agencyId);
  const now = new Date();
  const zonedNow = toZonedTime(now, agencyTimezone);
  const year = valid ? Number(valid[1]) : zonedNow.getFullYear();
  const month = valid ? Number(valid[2]) - 1 : zonedNow.getMonth();
  const reference = new Date(year, month, 1);
  const monthRange = workspaceMonthRange(year, month, agencyTimezone);
  const calendar = await getAgencyCalendarView(
    actor,
    context.agencyId,
    monthRange.start,
    monthRange.end,
  );
  const firstWeekday = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from(
    { length: Math.ceil((firstWeekday + days) / 7) * 7 },
    (_, index) => index - firstWeekday + 1,
  );
  const monthHref = (offset: number) => {
    const date = new Date(year, month + offset, 1);
    return `?month=${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  };
  const dayEvents = (day: number) =>
    calendar.events.filter((event) => {
      const date = toZonedTime(event.startsAt, agencyTimezone);
      return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
    });
  return (
    <div className="space-y-6" data-testid="global-calendar">
      <PageHeader
        title={t("calendar.globalTitle")}
        description={
          <>
            {t("calendar.globalDescription")}
            <span className="text-label text-fg-muted border-border bg-surface-subtle ms-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <CalendarDays className="h-3 w-3" aria-hidden="true" />
              {calendar.agencyTimezone}
            </span>
          </>
        }
        action={
          <MonthNav month={reference} buildHref={monthHref} locale={code as LocaleCode} t={t} />
        }
      />
      <section className="space-y-2 md:hidden" aria-label={t("calendar.globalAgendaAriaLabel")}>
        {calendar.events.length === 0 ? (
          <div className="border-border bg-surface text-body text-fg-secondary rounded-[var(--radius-card)] border p-4">
            {t("calendar.globalEmptyMonth")}
          </div>
        ) : (
          calendar.events.map((event) => (
            <div
              key={`${event.kind}-${event.id}`}
              className="border-border bg-surface grid grid-cols-[5rem_minmax(0,1fr)] gap-3 rounded-[var(--radius-card)] border p-3"
            >
              <time className="text-label text-fg-secondary font-semibold">
                {formatDate(event.startsAt, code, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  timeZone: agencyTimezone,
                })}
              </time>
              <EventCard event={event} t={t} />
            </div>
          ))
        )}
      </section>
      <div className="border-border bg-surface hidden overflow-x-auto rounded-[var(--radius-card)] border md:block">
        <div className="grid min-w-[900px] grid-cols-7">
          {weekdays(code as LocaleCode).map((day) => (
            <div
              key={day}
              className="border-border text-label text-fg-muted border-b p-3 font-semibold"
            >
              {day}
            </div>
          ))}
          {cells.map((day, index) => {
            const inMonth = day >= 1 && day <= days;
            const events = inMonth ? dayEvents(day) : [];
            return (
              <div
                key={index}
                className={cn(
                  "border-border min-h-36 border-e border-b p-2",
                  !inMonth && "bg-surface-subtle/40",
                )}
              >
                <span className={cn("text-label", inMonth ? "text-fg-muted" : "invisible")}>
                  {day}
                </span>
                <div className="mt-2 space-y-1">
                  {events.slice(0, 5).map((event) => (
                    <EventCard key={`${event.kind}-${event.id}`} event={event} t={t} />
                  ))}
                  {events.length > 5 ? (
                    <p className="text-label text-fg-muted px-1">+{events.length - 5}</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

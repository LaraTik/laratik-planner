import { formatDate, DateFormat } from "@/lib/i18n/format-locale";
import type { LocaleCode } from "@/lib/i18n/locales";

type Props = {
  events: { id: string; kind: string; detail: string; createdAt: Date }[];
  labels: Record<string, string>;
  fallbackLabel: string;
  emptyLabel: string;
  locale: LocaleCode;
  timeZone: string;
};

export function CommunityActivity({
  events,
  labels,
  fallbackLabel,
  emptyLabel,
  locale,
  timeZone,
}: Props) {
  if (!events.length) return <p className="text-label text-fg-muted py-6">{emptyLabel}</p>;
  return (
    <ol className="divide-border divide-y" data-testid="community-activity-list">
      {events.map((event) => (
        <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <span className="text-body text-fg-primary">
            {(Object.hasOwn(labels, event.detail) ? labels[event.detail] : undefined) ??
              (Object.hasOwn(labels, event.kind) ? labels[event.kind] : undefined) ??
              fallbackLabel}
          </span>
          <time className="text-label text-fg-muted" dateTime={event.createdAt.toISOString()}>
            {formatDate(event.createdAt, locale, {
              ...DateFormat.dateTime,
              timeZone,
              hour12: false,
            })}
          </time>
        </li>
      ))}
    </ol>
  );
}

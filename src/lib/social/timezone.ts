import { fromZonedTime } from "date-fns-tz";

type ZonedDateParts = { year: number; month: number; day: number };

function calendarParts(date: Date, timeZone: string): ZonedDateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

/** Return the calendar date at an instant in the workspace timezone. */
export function metricDateInTimeZone(date: Date, timeZone: string): string {
  const { year, month, day } = calendarParts(date, timeZone);
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

/**
 * Calculate the next scheduled sync as 03:15 on the next workspace-local
 * calendar day. Converting the wall-clock time after adding the local day
 * keeps the result correct on DST transition days.
 */
export function nextDailySyncAt(now: Date, timeZone: string): Date {
  const { year, month, day } = calendarParts(now, timeZone);
  const localWallClock = new Date(year, month - 1, day + 1, 3, 15, 0, 0);
  return fromZonedTime(localWallClock, timeZone);
}

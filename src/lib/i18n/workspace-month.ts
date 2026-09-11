import { fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * Return the UTC instants that bound the current calendar month in a
 * workspace's timezone. Content timestamps are stored as instants, while
 * users understand "this month" in the workspace's wall-clock calendar.
 */
export function currentWorkspaceMonthRange(
  now: Date,
  timeZone: string,
): { start: Date; end: Date } {
  const zonedNow = toZonedTime(now, timeZone);
  const year = zonedNow.getFullYear();
  const month = zonedNow.getMonth();
  return {
    start: fromZonedTime(new Date(year, month, 1, 0, 0, 0, 0), timeZone),
    end: fromZonedTime(new Date(year, month + 1, 1, 0, 0, 0, 0), timeZone),
  };
}

export function taskDurationMinutes(
  startedAt: Date | null,
  completedAt: Date | null,
  now: Date = new Date(),
) {
  if (!startedAt) return null;
  const end = completedAt ?? new Date(now);
  return Math.max(0, Math.floor((end.getTime() - startedAt.getTime()) / 60_000));
}

export function formatTaskDuration(
  minutes: number,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (minutes < 60) return t("tasks.durationMinutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder
    ? t("tasks.durationHoursMinutes", { hours, minutes: remainder })
    : t("tasks.durationHours", { hours });
}

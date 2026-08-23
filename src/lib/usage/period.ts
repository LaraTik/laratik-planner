export function usagePeriodKey(resource: string, date: Date): string | null {
  const iso = date.toISOString();
  if (resource.startsWith("daily_ai_requests:")) return iso.slice(0, 10);
  if (resource.endsWith("_month")) return iso.slice(0, 7);
  return null;
}

export function currentCounterValue(
  resource: string,
  storedValue: number,
  lastRecordedAt: Date,
  now = new Date(),
): number {
  const currentPeriod = usagePeriodKey(resource, now);
  if (!currentPeriod) return storedValue;
  return usagePeriodKey(resource, lastRecordedAt) === currentPeriod ? storedValue : 0;
}

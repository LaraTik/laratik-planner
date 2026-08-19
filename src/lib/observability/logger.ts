const PRIVATE_KEY =
  /(authorization|cookie|secret|token|password|api.?key|brief|body|content|prompt)/i;

export function sanitizeLogContext(value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: "[redacted]" };
  if (Array.isArray(value)) return value.map(sanitizeLogContext);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      PRIVATE_KEY.test(key) ? "[redacted]" : sanitizeLogContext(item),
    ]),
  );
}

export function logError(event: string, context: Record<string, unknown> = {}) {
  console.error(
    JSON.stringify({
      level: "error",
      event,
      timestamp: new Date().toISOString(),
      ...(sanitizeLogContext(context) as Record<string, unknown>),
    }),
  );
}

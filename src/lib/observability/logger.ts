import { getRequestId } from "@/lib/observability/request-context";

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

/**
 * Merge the per-request `requestId` (when available) into the log
 * context. Caller-supplied `requestId` wins so a log line that
 * explicitly references an upstream request keeps that id; the ALS
 * value is the tiebreaker for code paths that don't know their
 * own id.
 */
function withRequestId(context: Record<string, unknown>): Record<string, unknown> {
  if (context.requestId !== undefined) return context;
  const requestId = getRequestId();
  if (!requestId) return context;
  return { requestId, ...context };
}

export function logError(event: string, context: Record<string, unknown> = {}) {
  console.error(
    JSON.stringify({
      level: "error",
      event,
      timestamp: new Date().toISOString(),
      ...(sanitizeLogContext(withRequestId(context)) as Record<string, unknown>),
    }),
  );
}

export function logWarn(event: string, context: Record<string, unknown> = {}) {
  console.warn(
    JSON.stringify({
      level: "warn",
      event,
      timestamp: new Date().toISOString(),
      ...(sanitizeLogContext(withRequestId(context)) as Record<string, unknown>),
    }),
  );
}

import {
  getRequestId,
  pushRequestLog,
  type BufferedLogEntry,
} from "@/lib/observability/request-context";
import { serializeError } from "@/lib/observability/redact";

/**
 * Structured log stream (OBS-001).
 *
 * Two independent sanitization axes, and it is worth keeping them
 * straight:
 *
 *  1. **Key-name redaction** (this file). A context-map entry whose *key*
 *     looks sensitive has its whole value replaced. This is a denylist
 *     over caller-supplied key names — `authorization`, `cookie`,
 *     `secret`, `token`, `password`, `api_key`, `brief`, `body`,
 *     `content`, `prompt`. Unchanged from the original implementation.
 *
 *  2. **Value scrubbing** (`redact.ts`). A free-text value — an error
 *     message, a stack, a context string — is scanned for credential
 *     *shapes*. This is what replaced the old behaviour where every
 *     `Error` was collapsed to `{ name, message: "[redacted]" }`, which
 *     meant the log stream could not say what had actually failed.
 *
 * ## Request log buffer
 *
 * Every emitted `error` / `warn` line is also pushed into the current
 * request's ring buffer (`request-context.ts`). The object pushed is the
 * **same already-sanitized** object that went to the console, so the
 * buffer can never hold a credential that the console did not. When the
 * request later fails, `captureAppError` flushes that buffer into
 * `app_error_event.context.logs`.
 */

const PRIVATE_KEY =
  /(authorization|cookie|secret|token|password|api.?key|brief|body|content|prompt)/i;

export function sanitizeLogContext(value: unknown): unknown {
  // An `Error` is serialized structurally — name, message, stack, and one
  // level of cause — with every string run through the scrubber. A client
  // component cannot hand a real `Error` across the server-action
  // boundary, so this branch also accepts error-*like* plain objects
  // (`{ name, message, stack, cause }`); see `serializeError`.
  if (value instanceof Error) return serializeError(value);
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

/**
 * Emit a structured line and (for error/warn) mirror it into the request
 * ring buffer.
 *
 * The sanitized context is computed exactly once and shared by both
 * sinks — that is deliberate. Sanitizing twice would be wasteful, and
 * sanitizing only for the buffer would risk the two sinks disagreeing
 * about what is safe to persist.
 */
function emit(
  level: "error" | "warn",
  event: string,
  context: Record<string, unknown>,
  write: (line: string) => void,
): void {
  const safe = sanitizeLogContext(withRequestId(context)) as Record<string, unknown>;
  const line = JSON.stringify({ level, event, timestamp: new Date().toISOString(), ...safe });
  write(line);
  const entry: BufferedLogEntry = {
    ts: new Date().toISOString(),
    level,
    event,
    ctx: safe,
  };
  pushRequestLog(entry);
}

export function logError(event: string, context: Record<string, unknown> = {}) {
  try {
    emit("error", event, context, (line) => console.error(line));
  } catch {
    // A circular structure in the context must not take down the caller
    // — the logger is on the failure path, so it is the last thing that
    // is allowed to throw.
    console.error(
      JSON.stringify({
        level: "error",
        event,
        timestamp: new Date().toISOString(),
        serializationError: true,
      }),
    );
  }
}

export function logWarn(event: string, context: Record<string, unknown> = {}) {
  try {
    emit("warn", event, context, (line) => console.warn(line));
  } catch {
    console.warn(
      JSON.stringify({
        level: "warn",
        event,
        timestamp: new Date().toISOString(),
        serializationError: true,
      }),
    );
  }
}

/**
 * Secret scrubber for the structured log stream and the in-app error mirror.
 *
 * ## Why this exists
 *
 * `sanitizeLogContext` used to serialize every `Error` as
 * `{ name, message: "[redacted]" }`. That is safe but useless: every
 * `logError` / `captureError` line shipped without a message, without a
 * stack, and without a cause, so the log stream could not answer "what
 * went wrong". On top of that, the lines only reach Docker's `json-file`
 * driver at `10m × 5` (~50 MB), so they are gone within hours.
 *
 * The fix is **not** "stop redacting". It is "redact the secret, keep the
 * diagnosis". The rule table below replaces blanket redaction with a
 * targeted scrub.
 *
 * ## Two independent axes
 *
 * 1. **Key-name redaction** (unchanged, lives in `logger.ts`): a context
 *    map entry whose *key* looks sensitive (`token`, `cookie`, `brief`,
 *    `content`, …) has its whole value replaced. That axis is a denylist
 *    over caller-supplied keys and it stays exactly as it was.
 * 2. **Value scrubbing** (this file): a free-text value — an error
 *    message, a stack frame, a log context string — is scanned for
 *    credential *shapes*. Names are not enough: a Postgres error puts a
 *    value inside `Key (col)=(value)`, and a fetch failure puts a token
 *    inside a URL.
 *
 * ## Invariants
 *
 * - **Fail closed.** If a rule throws, `scrubText` returns
 *   `"[unavailable]"` — never the raw input. A crash in a regex must not
 *   become a credential in the log.
 * - **Idempotent.** `scrubText(scrubText(x)) === scrubText(x)`, so a value
 *   that is scrubbed twice (once on the way to the log, once on the way
 *   to the database) is stable.
 * - **No over-redaction of ordinary text.** A normal message, SQL
 *   fragment, file path, or Arabic string must come through
 *   byte-identical. Over-redaction destroys the diagnostic value just as
 *   surely as a leak, so the negative fixtures in
 *   `tests/unit/observability-redact.test.ts` matter as much as the
 *   positive ones.
 *
 * This module is intentionally dependency-free (no `node:*` imports) so
 * it is safe to import from any runtime.
 */

/** Default byte budget for a scrubbed message. */
const DEFAULT_MESSAGE_LIMIT = 2_000;
/** Default byte budget for a scrubbed stack. */
const DEFAULT_STACK_LIMIT = 4_000;

/** Truncation marker appended when a value exceeds its budget. */
const TRUNCATED = "…(truncated)";

/**
 * Ordered scrub rules.
 *
 * Order is load-bearing. `Bearer sk-…` must be caught by the bearer rule
 * (1) so the provider-key rule (4) never sees the token, and a JWT
 * (2) must be caught before the generic blob rule (10) so the output
 * stays readable.
 *
 * Each rule is `{ pattern, replacement }` where `replacement` is a plain
 * string (so `$1`-style group references still work) or a function.
 */
type ScrubRule = {
  pattern: RegExp;
  replacement: string | ((substring: string, ...args: never[]) => string);
};

const RULES: ScrubRule[] = [
  // 1. Authorization headers / bearer tokens. Covers
  //    `Authorization: Bearer abc`, `bearer abc`, and a bare
  //    `Bearer abc` embedded in a message.
  {
    pattern: /\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    replacement: "$1 [redacted]",
  },
  // 2. JSON Web Tokens. Three base64url segments, each non-trivial.
  {
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
    replacement: "[jwt]",
  },
  // 3. LaraTik MCP access tokens (`src/lib/mcp/tokens.ts`): `lpm_` + 32
  //    random bytes, base64url-encoded.
  {
    pattern: /\blpm_[A-Za-z0-9_-]{20,}/g,
    replacement: "[mcp-token]",
  },
  // 4. Recognisable provider credential prefixes. `sk-` covers both
  //    OpenAI-style keys and the longer `sk-ant-…` Anthropic shape
  //    (the `-ant-` part is simply part of the matched run), plus
  //    GitHub, GitLab, Slack, and AWS access-key-id forms.
  {
    pattern:
      /\b(?:sk-ant-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g,
    replacement: "[key]",
  },
  // 5. Credential-bearing connection strings. `scheme://user:pass@host`
  //    is the shape every driver uses (`postgres://`, `redis://`,
  //    `mongodb://`, `amqp://`, …) and it carried the highest-value
  //    secret in this stack straight through: `DATABASE_URL` matches no
  //    key name in rule 6, has no query parameter for rule 9, and is
  //    usually far shorter than rule 10's 64-character floor.
  //
  //    Only the password half is replaced. Scheme, user, host, port and
  //    database are the diagnostic part — "which database refused the
  //    connection" is exactly the question this mirror exists to answer.
  //    The userinfo must be present (`:` and `@` together) so an ordinary
  //    `https://example.com:8080/health` never matches.
  {
    pattern: /(\b[a-z][a-z0-9+.-]*:\/\/)([^/\s:@]*):([^/\s:@]*)@/gi,
    replacement: "$1$2:[redacted]@",
  },
  // 6. `secret-ish key = value` / `secret-ish key: value` pairs. The
  //    separator is mandatory, which is what keeps ordinary prose safe:
  //    "auth failed" and "session expired" never match, but
  //    `password=hunter2` and `authorization: Bearer x` do.
  //
  //    The key deliberately excludes `.`. Otherwise a *file path* whose
  //    segment happens to be sensitive-looking would take its line
  //    numbers with it — `drizzle-orm/pg-core/session.js:1:1` is one of
  //    the most common frames in this codebase, and losing `:1:1` to a
  //    false positive costs real diagnostic value. Without `.` in the
  //    character class, "session" is followed by ".js", not a separator,
  //    so the rule simply does not fire. `api-key` / `api_key` /
  //    `accessToken` are unaffected.
  {
    pattern:
      /\b([A-Za-z0-9_-]*(?:secret|password|passwd|token|api[_-]?key|apikey|auth|credential|cookie|brief|session)[A-Za-z0-9_-]*)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|bearer\s+[^\s,;)&]+|[^\s,;)&]+)/gi,
    replacement: "$1$2[redacted]",
  },
  // 7. Postgres detail leaks. A unique-violation surfaces the offending
  //    row values on the DETAIL line, and `check_violation` surfaces them
  //    on a "Failing row contains" line. This is the single most common
  //    server error in this schema, so it is the one that must not leak.
  {
    pattern: /\b(Key \([^)]*\)=)\s*\S+(?:\s*,?\s*\S+)*/g,
    replacement: "$1[redacted]",
  },
  {
    // Keep the `Key (column)=` prefix when the DETAIL line carries one:
    // the column name is the single most useful part of a unique-violation
    // error, and dropping the whole line would throw it away. The value
    // is always replaced.
    pattern: /(\bDETAIL:\s*)(Key \([^)]*\)=)?[^\n]*/g,
    replacement: (_match: string, prefix: string, keyPart?: string) =>
      `${prefix}${keyPart ? `${keyPart}[redacted]` : "[redacted]"}`,
  },
  {
    pattern: /(\bFailing row contains\s*)\(.*?\)/gi,
    replacement: "$1([redacted])",
  },
  // 8. Email addresses. Postgres and Drizzle messages routinely quote
  //    the value that violated a unique index, and an address is PII we
  //    do not want in a diagnostics table.
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\b/g,
    replacement: "[email]",
  },
  // 9. Secret-bearing query-string parameters. The parameter name is
  //    kept (it is diagnostic); only the value is dropped.
  {
    pattern:
      /([?&](?:token|access_token|api[_-]?key|apikey|key|secret|password|sig|signature|auth|code)=)[^&\s"'<>]+/gi,
    replacement: "$1[redacted]",
  },
  // 10. High-entropy opaque blobs: a single run of ≥ 64 characters made
  //    only of base64url characters that contains an uppercase, a
  //    lowercase, and a digit. The character class deliberately excludes
  //    `/`, `.` and `:` so file paths, URLs, and stack frames
  //    (`at Foo (/app/.next/server/page.js:1:2)`) never match.
  {
    pattern:
      /\b(?=[A-Za-z0-9_-]{64,}\b)(?=[^\s]*[A-Z])(?=[^\s]*[a-z])(?=[^\s]*[0-9])[A-Za-z0-9_-]{64,}\b/g,
    replacement: "[blob]",
  },
];

/**
 * Apply every scrub rule to `input`, then truncate to `limit`.
 *
 * Fail-closed: any thrown error (a catastrophic regex backtrack, a
 * non-string coercion bug) returns `"[unavailable]"` rather than the
 * original text.
 */
export function scrubText(input: string, limit: number = DEFAULT_MESSAGE_LIMIT): string {
  let out: string;
  try {
    out = String(input);
    for (const rule of RULES) {
      // Each rule owns its own `lastIndex` because several are `/g` or
      // `/gi`. Recreating a fresh RegExp from the source keeps the table
      // itself immutable across calls.
      const re = new RegExp(rule.pattern.source, rule.pattern.flags);
      out =
        typeof rule.replacement === "function"
          ? out.replace(re, rule.replacement as (substring: string, ...args: unknown[]) => string)
          : out.replace(re, rule.replacement);
    }
  } catch {
    return "[unavailable]";
  }
  return truncate(out, limit);
}

/** Truncate to `limit` characters, marking the cut so it is never silent. */
function truncate(value: string, limit: number): string {
  if (limit <= 0) return "";
  if (value.length <= limit) return value;
  return value.slice(0, limit) + TRUNCATED;
}

/**
 * Structured form of a captured error, safe to persist.
 *
 * The message, stack, and one level of `cause` are preserved (scrubbed)
 * rather than redacted, because the whole point of the in-app mirror is
 * to answer "what broke". Non-`Error` values collapse to a scrubbed
 * string so a thrown object or string never bypasses the scrubber.
 */
export type SerializedError = {
  name?: string;
  message: string;
  stack?: string;
  cause?: { name?: string; message: string };
};

/** Read `err.name` without assuming it is an `Error`. */
function errorName(err: unknown): string | undefined {
  if (err instanceof Error) return err.name;
  if (err && typeof err === "object" && "name" in err) {
    const name = (err as { name?: unknown }).name;
    if (typeof name === "string" && name.length > 0) return name;
  }
  return undefined;
}

/** Read `err.stack` without assuming it is an `Error`. */
function errorStack(err: unknown): string | undefined {
  if (err instanceof Error) return err.stack ?? undefined;
  if (err && typeof err === "object" && "stack" in err) {
    const stack = (err as { stack?: unknown }).stack;
    if (typeof stack === "string" && stack.length > 0) return stack;
  }
  return undefined;
}

/**
 * Read `err.message` without assuming it is an `Error`.
 *
 * This is the single most important line in the module.
 * `recordErrorBoundaryAction` (`src/app/(app)/error-actions.ts`) cannot
 * hand a real `Error` to `captureAppError` — a client component can only
 * ship a plain serializable object across the server-action boundary — so
 * it builds `{ name, message, stack, cause }`. Every `instanceof Error`
 * check in the old helpers therefore failed on the one caller that
 * matters, and every row in `app_error_event` was written with
 * `message = "Unknown error"`, `error_name = NULL`, `stack = NULL`, and
 * `cause_message = NULL`. Reading the fields structurally (and only when
 * they are actually the right primitive type) fixes that.
 */
function errorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return undefined;
}

/**
 * Serialize any thrown value into the scrubbed, persistable shape.
 *
 * The `cause` chain is followed exactly one level, matching the existing
 * `safeCauseMessage` behaviour: Drizzle's "Failed query: …" wrapper keeps
 * the real Postgres reason on `.cause`, which is usually the only useful
 * part. Deeper chains are still available in Sentry.
 */
export function serializeError(err: unknown, opts: { stackBytes?: number } = {}): SerializedError {
  const stackBytes = opts.stackBytes ?? DEFAULT_STACK_LIMIT;
  const name = errorName(err);

  let message: string;
  if (typeof err === "string") {
    message = err || "Unknown error";
  } else {
    message = errorMessage(err) || errorName(err) || "Unknown error";
  }

  const result: SerializedError = {
    ...(name ? { name } : {}),
    message: scrubText(message),
  };

  const stack = errorStack(err);
  if (stack) {
    const scrubbed = scrubText(stack, stackBytes);
    if (scrubbed && scrubbed !== "Unknown error") result.stack = scrubbed;
  }

  const cause = causeOf(err);
  if (cause) result.cause = cause;
  return result;
}

/** One level of the `Error.cause` chain, in the same scrubbed shape. */
function causeOf(err: unknown): { name?: string; message: string } | undefined {
  if (!err || typeof err !== "object" || !("cause" in err)) return undefined;
  const cause = (err as { cause?: unknown }).cause;
  if (cause === undefined || cause === null) return undefined;
  if (typeof cause === "string") {
    return { message: scrubText(cause || "Unknown cause") };
  }
  // Structural read, for the same reason as `errorMessage`: the client
  // boundary ships a plain `{ name, message }` cause object, never a real
  // `Error`, so `instanceof` alone would drop every chained cause.
  const causeName = errorName(cause);
  const causeMessage = errorMessage(cause);
  if (!causeName && !causeMessage) return undefined;
  return {
    ...(causeName ? { name: causeName } : {}),
    message: scrubText(causeMessage || causeName || "Unknown cause"),
  };
}

export const REDACT_SCRUBBED_MESSAGE_LIMIT = DEFAULT_MESSAGE_LIMIT;
export const REDACT_SCRUBBED_STACK_LIMIT = DEFAULT_STACK_LIMIT;

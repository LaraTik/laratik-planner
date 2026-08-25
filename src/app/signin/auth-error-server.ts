import "server-only";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { captureError } from "@/lib/observability/sentry";

/**
 * Mint a short, log-friendly support reference we can include in the
 * `?ref=` query param. The user quotes this to support; the server-side
 * `captureError` (and the resulting log line) prints the same id, so
 * a single string links a user report to a log entry.
 *
 * The Next.js error digest (shown by `src/app/error.tsx`) is a separate
 * number issued by the framework; we keep our `ref` independent so
 * support can correlate either side without ambiguity.
 */
function newSupportRef(): string {
  return randomBytes(6).toString("hex"); // 12 hex chars, URL-safe
}

/**
 * Server-action helper for the signin flow.
 *
 * Why this lives in a separate `server-only` module:
 *  - The signin page is rendered as a server component (the
 *    `"use server"` blocks inside its `<form action={...}>` are
 *    server actions). Pulling the Sentry dependency out of the
 *    page module means a client bundle can never accidentally
 *    pick up `@sentry/nextjs` (which has shipped with public DSN
 *    surfacing in the past — see OTHER-04).
 *  - The `import "server-only"` guard makes the import a build
 *    error if any future refactor imports this from a "use
 *    client" file.
 *  - The same fan-out that `logError` + `captureError` use in
 *    OTHER-03 closes the loop: a support ref lands in the user's
 *    URL, the matching Sentry event is tagged with the same ref,
 *    and the structured log line carries the same ref + the
 *    requestId (OTHER-05).
 *
 * @param input.code        The error code we'll redirect with
 *                          (`?error=<code>`). The user-facing
 *                          copy is owned by `authError(code)`.
 * @param input.callbackUrl Where to send the user after a
 *                          successful re-submit.
 * @param input.cause       The thrown value the server action
 *                          couldn't classify.
 * @param input.context     Tags / extra to attach to the Sentry
 *                          event so the on-call can pivot
 *                          (provider, emailDomain, etc.).
 */
export function signInErrorRedirect(input: {
  code: string;
  callbackUrl: string;
  cause?: unknown;
  context?: Record<string, unknown>;
}): never {
  const ref = newSupportRef();
  if (input.cause !== undefined) {
    // Fan out to BOTH the structured log stream (via captureError)
    // and Sentry (when configured). The `scope` is `auth.signin` so
    // an on-call search is a single pivot; the `auth.signin.ref`
    // tag matches the user-quoted support ref so a Sentry event
    // links to the user report.
    captureError("auth.signin", input.cause, {
      "auth.signin.code": input.code,
      "auth.signin.ref": ref,
      ...(input.context ?? {}),
    });
  }
  const params = new URLSearchParams({
    error: input.code,
    callbackUrl: input.callbackUrl,
    ref,
  });
  redirect(`/signin?${params.toString()}`);
}

/**
 * Email-domain helper for the Sentry tag (never log the full email).
 * Kept here (next to the only call-site) so the page module doesn't
 * need to know about the Sentry payload shape.
 */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "(none)";
}

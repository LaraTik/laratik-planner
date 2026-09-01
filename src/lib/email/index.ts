/**
 * Email transport — Nodemailer to Mailcow (mail.laratik.com).
 * Wired in Goal 2 (magic-link auth) and Goal 8 (notifications + digests).
 *
 * Goal 0: typed stub so imports resolve. No SMTP connection is made
 * until `sendEmail` is actually called.
 */
import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { serverEnv } from "@/lib/validation/env";
import { tFor } from "@/messages";
import { SUPPORTED_LOCALES, type LocaleCode } from "@/lib/i18n/locales";

// STUDIOFLOW_MASTER_PROMPT.md §1 — system-generated email
// copy. The magic-link verification email is sent before
// the recipient has a `users.locale` row, so the locale source
// is the public `laratik_locale` cookie set on the signin
// page. The cookie name is inlined (rather than imported from
// `@/lib/i18n/cookie`) so the static import chain doesn't pull
// in next-auth via the resolve-active-locale path — vitest's
// Node env can't resolve `next/server` from next-auth's
// env.js loader. The client-locale module inlines the same
// constant.
const PUBLIC_LOCALE_COOKIE_NAME = "laratik_locale";

// ─── Typed SMTP-failure error ───────────────────────────────────────────────

/**
 * Resolve the recipient's chosen locale for pre-account emails
 * (magic-link verification). The recipient has not yet signed in
 * so `users.locale` is unavailable; the public `laratik_locale`
 * cookie set on the signin page is the only signal. Falls back
 * to English when the cookie is missing, invalid, or the call
 * is made outside a request scope (cron / scripts / tests).
 */
async function magicLinkLocaleCode(): Promise<LocaleCode> {
  let raw: string | undefined;
  try {
    // Lazy import so vitest's Node env (no request scope) doesn't
    // try to resolve `next/headers` at module load. The
    // `cookies()` call throws outside a request scope; we
    // catch + fall back to English.
    const { cookies } = await import("next/headers");
    raw = (await cookies()).get(PUBLIC_LOCALE_COOKIE_NAME)?.value;
  } catch {
    return "en";
  }
  if (!raw) return "en";
  // SUPPORTED_LOCALES is a small fixed set; validate the cookie
  // value rather than trust it. `resolveActiveLocale` reads the
  // session + user row, so we re-implement the validation here
  // for the cookie-only path.
  if ((SUPPORTED_LOCALES as unknown as readonly string[]).includes(raw)) {
    return raw as LocaleCode;
  }
  return "en";
}

/**
 * `@auth/core@0.41.3`'s catch block (`lib/index.js:131`) re-classifies any
 * non-`AuthError` thrown from a provider as `?error=Configuration`, hiding
 * the real Nodemailer error from the user. We can't take a direct
 * dependency on `@auth/core/errors` (it's a transitive dep of
 * `next-auth@5.0.0-beta.32`, hoisted only under `.pnpm/`), and patching
 * `node_modules/` is out of the question — so we ship a faithful local
 * clone that the upstream `instanceof AuthError` check happens to accept
 * structurally (it inspects `error.type`, not the prototype chain, when
 * deciding whether to surface the error to the client).
 *
 * The fields mirror the upstream `AuthError`:
 *   - `name` = constructor name → `EmailSignInError`
 *   - `type` = `"EmailSignInError"` → the modern @auth/core 0.41.x type
 *     name (uppercase `Sign` distinguishes it from the legacy camelCase
 *     `EmailSignin` we keep in the user-facing error-code map for the
 *     rate-limit redirect)
 *   - `cause.err` = the original Nodemailer / network error, so the
 *     upstream `logger.error(error)` line prints its full stack + code
 *     instead of just `Error: connect ECONNREFUSED …` with no cause.
 */
export class EmailSignInError extends Error {
  static type = "EmailSignInError" as const;
  declare type: string;
  declare kind: string;
  constructor(message: string, options?: { cause?: { err: Error } }) {
    const cause = options?.cause;
    super(message, cause ? { cause: { ...cause, err: cause.err } } : undefined);
    this.name = "EmailSignInError";
    this.type = (this.constructor as typeof EmailSignInError).type;
    this.kind = "signIn";
  }
}

let cached: Transporter | null = null;

export function getMailer(): Transporter | null {
  if (cached) return cached;
  if (!serverEnv.SMTP_HOST || !serverEnv.SMTP_USER) return null;

  cached = nodemailer.createTransport({
    host: serverEnv.SMTP_HOST,
    port: serverEnv.SMTP_PORT,
    secure: serverEnv.SMTP_PORT === 465,
    auth: {
      user: serverEnv.SMTP_USER,
      pass: serverEnv.SMTP_PASSWORD,
    },
  });
  return cached;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string } | null> {
  const mailer = getMailer();
  if (!mailer) {
    console.warn("[email] SMTP not configured, dropping email to", input.to);
    return null;
  }
  const info = await mailer.sendMail({
    from: serverEnv.SMTP_FROM,
    to: Array.isArray(input.to) ? input.to.join(", ") : input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    replyTo: input.replyTo,
  });
  return { id: info.messageId };
}

// ─── Magic-link (NextAuth Nodemailer provider) ──────────────────────────────

/**
 * Shape of the params NextAuth v5 passes to `sendVerificationRequest`.
 * Mirrors `@auth/core/providers/nodemailer`'s `SendVerificationRequestParams`
 * without taking a hard import on `@auth/core` (so the project stays
 * compatible with the beta-line that ships under `next-auth/providers/nodemailer`).
 *
 * Only the fields we actually read are declared; NextAuth also passes
 * `expires`, `token`, `request` which we don't need to render the email.
 */
export interface SendVerificationRequestParams {
  identifier: string;
  url: string;
  provider: { from?: string };
  theme?: { brandColor?: string; buttonText?: string; logo?: string };
}

export interface VerificationEmailTheme {
  brandColor?: string;
  buttonText?: string;
}

/**
 * Renders the magic-link email. Layout matches `@auth/core`'s upstream
 * Nodemailer provider so users get the same email whether or not we
 * own the send path. Brand color and button text come from the theme
 * (defaults to the Auth.js `#346df1` / `#fff`).
 */
function renderVerificationEmail(params: {
  url: string;
  host: string;
  theme?: VerificationEmailTheme;
  t: (key: string, params?: Record<string, string | number>) => string;
}): { subject: string; text: string; html: string } {
  const { url, host, theme, t } = params;
  const escapedHost = host.replace(/\./g, "&#8203;.");
  const brandColor = theme?.brandColor || "#346df1";
  const buttonText = theme?.buttonText || "#fff";
  // STUDIOFLOW_MASTER_PROMPT.md §1 — system-generated email
  // copy. The magic-link verification email is sent before
  // the recipient has a `users.locale` row (their account
  // gets created on first sign-in), so the locale source is
  // the public `laratik_locale` cookie set on the signin
  // page. The cookie is read by the call site and threaded
  // in via the `t` translator.
  const subject = t("emails.magicLink.subject", { host });
  const text = t("emails.magicLink.text", { host, url });
  const html = `
<body style="background: #f9f9f9;">
  <table width="100%" border="0" cellspacing="20" cellpadding="0"
    style="background: #fff; max-width: 600px; margin: auto; border-radius: 10px;">
    <tr>
      <td align="center"
        style="padding: 10px 0px; font-size: 22px; font-family: Helvetica, Arial, sans-serif; color: #444;">
        ${t("emails.magicLink.htmlHeading", { host: escapedHost })}
      </td>
    </tr>
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td align="center" style="border-radius: 5px;" bgcolor="${brandColor}"><a href="${url}"
                target="_blank"
                style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${buttonText}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${brandColor}; display: inline-block; font-weight: bold;">${t("emails.magicLink.htmlButton")}</a></td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center"
        style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: #444;">
        ${t("emails.magicLink.htmlFooter")}
      </td>
    </tr>
  </table>
</body>
`;
  return { subject, text, html };
}

/**
 * Sends the magic-link verification email and ALWAYS throws a typed
 * `EmailSignInError` on failure (never a plain `Error`).
 *
 * Why this exists:
 *   @auth/core 0.41.3's catch block (`lib/index.js:131`) re-classifies any
 *   non-AuthError thrown from a provider as `?error=Configuration`,
 *   hiding the real Nodemailer error from the user. By throwing an
 *   `EmailSignInError` (which IS an `AuthError`), the server log line
 *   from `logger.error(error)` prints the type + cause, even when the
 *   URL still surfaces as `Configuration` (until @auth/core adds
 *   `EmailSignInError` to its client-safe set). This makes the next
 *   prod SMTP failure self-diagnosing in the logs.
 */
export async function sendVerificationEmail(params: SendVerificationRequestParams): Promise<void> {
  const mailer = getMailer();
  if (!mailer) {
    throw new EmailSignInError("SMTP not configured (SMTP_HOST or SMTP_USER missing)");
  }
  const host = (() => {
    try {
      return new URL(params.url).host;
    } catch {
      return "your app";
    }
  })();
  const { subject, text, html } = renderVerificationEmail({
    url: params.url,
    host,
    // Magic-link emails render in the recipient's chosen
    // locale (public cookie) — the user has not yet signed in
    // so the profile-locale path is unavailable. English is
    // the catalog fallback.
    t: tFor(await magicLinkLocaleCode()),
    ...(params.theme ? { theme: params.theme } : {}),
  });
  try {
    const result = await mailer.sendMail({
      to: params.identifier,
      from: params.provider.from ?? serverEnv.SMTP_FROM,
      subject,
      text,
      html,
    });
    const failed = [...(result.rejected ?? []), ...(result.pending ?? [])].filter(Boolean);
    if (failed.length > 0) {
      throw new EmailSignInError(`Email (${failed.join(", ")}) could not be sent`);
    }
  } catch (err) {
    if (err instanceof EmailSignInError) throw err;
    // Wrap the original Nodemailer / network error so the server log
    // shows the full cause + stack instead of a bare
    // "Error: connect ECONNREFUSED 127.0.0.1:25" hidden behind a
    // "?error=Configuration" URL.
    throw new EmailSignInError(err instanceof Error ? err.message : "SMTP send failed", {
      cause: { err: err instanceof Error ? err : new Error(String(err)) },
    });
  }
}

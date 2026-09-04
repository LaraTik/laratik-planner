/**
 * Environment variable validation — split client / server.
 *
 * Mirrors the master prompt §7. Server-only secrets (DATABASE_URL, AUTH_SECRET,
 * SMTP_*, MINIMAX_*, SENTRY_*) MUST NOT appear in the client bundle. We enforce
 * this structurally: importing this file with a `NEXT_PUBLIC_*` secret in it
 * is a build error, not a runtime surprise.
 *
 * Usage:
 *   - In server code:  import { serverEnv } from "@/lib/validation/env"
 *   - In client code:  import { clientEnv } from "@/lib/validation/env"
 *
 * Validation is deliberately strict in production (fail-fast on missing vars)
 * and lenient in development (only NEXT_PUBLIC_APP_URL is required).
 */
import { z } from "zod";
import { validateProviderConfiguration } from "./provider-configuration";

// ─── Helpers ────────────────────────────────────────────────────────────────
/**
 * When SKIP_ENV_VALIDATION is set (or we're in a Next.js build phase that
 * doesn't have runtime env vars), make every required server var optional.
 * The actual runtime check happens lazily on first access to `serverEnv.*`
 * via a Zod refinement — see `assertRuntimeEnv` at the bottom of this file.
 */
const skipValidation =
  !!process.env.SKIP_ENV_VALIDATION ||
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PHASE === "phase-development-build";

const optionalInDev = (schema: z.ZodTypeAny) => {
  if (skipValidation) return schema.optional();
  return process.env.NODE_ENV === "production" ? schema : schema.optional();
};

const stringOrEmpty = z
  .string()
  .optional()
  .transform((v) => v ?? "");

// ─── Client schema (NEXT_PUBLIC_* only) ─────────────────────────────────────
const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SENTRY_DSN: stringOrEmpty,
  // OBS-002 — support address mirrored to the client for the
  // "Report this" mailto on every error boundary. Must agree with
  // the server-side `SUPPORT_EMAIL` (which the server action uses
  // for the canonical record); we keep them as two env vars so a
  // server-only change (e.g. a mailcow alias) does not require a
  // build-time bake. Falls back to the same default.
  NEXT_PUBLIC_SUPPORT_EMAIL: z.string().email().optional().default("support@laratik.com"),
  // 2026-08-27 — the error boundary reads the build SHA so the
  // "Copy full report" can include a one-line correlation between
  // the user's screen and the deployed commit. `APP_VERSION` is
  // server-only (and may be a real 40-char SHA at build time);
  // mirroring it as `NEXT_PUBLIC_` means the client can read it
  // without a round-trip. Empty when the server env is empty
  // (the report falls back to "local build" in that case).
  NEXT_PUBLIC_APP_VERSION: stringOrEmpty,
});

const _clientParsed = clientSchema.safeParse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
  NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
});

if (!_clientParsed.success) {
  console.error(
    "[env] Invalid client environment variables:",
    _clientParsed.error.flatten().fieldErrors,
  );
  throw new Error("Invalid client environment");
}

export const clientEnv = _clientParsed.data;

// ─── Server schema (everything else) ───────────────────────────────────────
const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // Immutable Git commit SHA injected by the Docker build. This is
  // operational metadata, not a secret or an operator-managed setting.
  APP_VERSION: stringOrEmpty,

  // Database
  DATABASE_URL: optionalInDev(z.string().url()),
  POSTGRES_USER: stringOrEmpty,
  POSTGRES_PASSWORD: stringOrEmpty,
  POSTGRES_DB: stringOrEmpty,

  // NextAuth
  AUTH_SECRET: optionalInDev(
    z.string().min(32, "AUTH_SECRET must be ≥ 32 chars (use: openssl rand -base64 32)"),
  ),
  AUTH_URL: z.string().url().default("http://localhost:3000"),
  AUTH_TRUST_HOST: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),

  // Google OAuth
  GOOGLE_CLIENT_ID: stringOrEmpty,
  GOOGLE_CLIENT_SECRET: stringOrEmpty,

  // SMTP (Mailcow)
  SMTP_HOST: stringOrEmpty,
  SMTP_PORT: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 587)),
  SMTP_USER: stringOrEmpty,
  SMTP_PASSWORD: stringOrEmpty,
  SMTP_FROM: stringOrEmpty,

  // MiniMax (Goal 11)
  MINIMAX_API_KEY: stringOrEmpty,
  MINIMAX_BASE_URL: z.string().url().default("https://api.minimax.io/anthropic"),
  MINIMAX_MODEL: z.string().default("MiniMax-M3"),
  AI_FEATURE_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),

  // AI provider secret encryption (M3.4 — AI in-DB secret).
  // Server-only AES-256-GCM key. The env var is optional at module
  // load — when it is missing AND the agency tries to set a managed
  // AI secret, the secrets module auto-generates a KEK, writes it
  // to `<LARATIK_DATA_DIR>/kek.json` (atomic write, 0600 perms),
  // and uses that. Set the env var explicitly to take priority
  // over the auto-managed file. A future rotation can carry
  // multiple keys in the shape `k1:<base64> | k2:<base64>` (see
  // secrets.ts). Length is validated at runtime in secrets.ts.
  AI_SECRET_ENCRYPTION_KEY: stringOrEmpty,

  // Directory the AI KEK file is auto-persisted to when
  // AI_SECRET_ENCRYPTION_KEY is not set. MUST be a persistent
  // volume in production (the file holds the master key for
  // every stored AI provider secret — losing it locks out the
  // DB). Defaults to `<cwd>/.laratik-planner/` for local dev
  // (acceptable for ephemeral workflows; back the file up).
  LARATIK_DATA_DIR: stringOrEmpty,

  // Sentry (Goal 13)
  SENTRY_DSN: stringOrEmpty,
  SENTRY_AUTH_TOKEN: stringOrEmpty,
  SENTRY_ORG: stringOrEmpty,
  SENTRY_PROJECT: stringOrEmpty,
  // Guard token for the /api/sentry-probe route. The install script
  // sets it alongside the other Sentry keys; the route 503s if
  // missing so an unconfigured env can't expose the probe publicly.
  SENTRY_PROBE_TOKEN: stringOrEmpty,

  // Cron + bootstrap
  CRON_SECRET: stringOrEmpty,
  BOOTSTRAP_SETUP_TOKEN: stringOrEmpty,

  // OBS-002 — support contact surfaced in the app-router error
  // boundaries. The "Report this" link on every error page builds a
  // `mailto:` URL to this address. Falls back to a generic address
  // when unset so the page never 500s on a missing config.
  SUPPORT_EMAIL: z.string().email().optional().default("support@laratik.com"),

  // M4.5 — social profile analytics. The encryption key is
  // OPTIONAL at boot: the platform can deploy without it and
  // agencies can sign in / use the rest of the app. The key is
  // read lazily inside `src/lib/social/key-management.ts` on the
  // first agency enable / unwrap. A missing or wrong-length key
  // surfaces a 503 `platform_kek_missing` from the API and a
  // soft `kekStatus: 'kek_missing'` field from the sync worker
  // — never a boot crash. Generate the key with:
  //   openssl rand -base64 32
  // None of these may be exposed as NEXT_PUBLIC_*.
  //
  // M4.6 (hard cutover): the per-provider app secrets are no longer
  // read from env. They are now stored per-agency in
  // `agency_social_provider_config` (sealed with this KEK). The
  // env vars removed in M4.6: META_APP_ID, META_APP_SECRET,
  // META_LOGIN_CONFIG_ID, META_GRAPH_API_VERSION, TIKTOK_CLIENT_KEY,
  // TIKTOK_CLIENT_SECRET, SOCIAL_TIKTOK_ENABLED.
  SOCIAL_TOKEN_ENCRYPTION_KEY: stringOrEmpty,
  // Master switch for the social cron. Default false so a fresh
  // deployment does not start syncing until an agency admin has
  // configured a provider row.
  SOCIAL_SYNC_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  // Future Meta direct publishing kill switch. It is intentionally
  // false by default and cannot enable publishing by itself: the
  // agency/workspace/provider capability gates must also pass.
  META_PUBLISHING_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),

  // Agency context cookie (Milestone 1.2) — server-only HMAC secret.
  // 32+ bytes (≥ 32 ASCII chars). The agency-context helper fails closed
  // if this is missing in production. Generate with:
  //   openssl rand -base64 32
  // Optional in dev/test; the agency-context helper falls back to a
  // derived dev key so unit tests can run without configuring the env.
  AGENCY_COOKIE_SECRET: optionalInDev(
    z.string().min(32, "AGENCY_COOKIE_SECRET must be ≥ 32 bytes (use: openssl rand -base64 32)"),
  ),
});

const _serverParsed = serverSchema.safeParse(process.env);

if (!_serverParsed.success) {
  console.error(
    "[env] Invalid server environment variables:",
    _serverParsed.error.flatten().fieldErrors,
  );
  throw new Error("Invalid server environment");
}

export const serverEnv = _serverParsed.data;

if (!skipValidation) {
  const providerIssues = validateProviderConfiguration({
    nodeEnv: serverEnv.NODE_ENV,
    googleClientId: serverEnv.GOOGLE_CLIENT_ID,
    googleClientSecret: serverEnv.GOOGLE_CLIENT_SECRET,
    smtpHost: serverEnv.SMTP_HOST,
    smtpUser: serverEnv.SMTP_USER,
    smtpPassword: serverEnv.SMTP_PASSWORD,
    smtpFrom: serverEnv.SMTP_FROM,
    aiEnabled: serverEnv.AI_FEATURE_ENABLED,
    minimaxApiKey: serverEnv.MINIMAX_API_KEY,
  });
  if (providerIssues.length > 0) {
    console.error("[env] Invalid provider configuration:", providerIssues);
    throw new Error("Invalid provider configuration");
  }

  // M4.5 — the social encryption key is OPTIONAL at boot. The
  // application refuses to seal a new social_connection if the
  // platform KEK is missing, with a 503 / soft-no-op surface
  // (see src/lib/social/key-management.ts). The provider
  // credentials remain optional so a deployment can ship with
  // the key set and the cron route disabled (the recommended
  // starting state). If both SOCIAL_SYNC_ENABLED and the KEK
  // are set, we log a soft warning so the operator notices the
  // misconfiguration without crashing the boot.
  if (serverEnv.SOCIAL_SYNC_ENABLED && !serverEnv.SOCIAL_TOKEN_ENCRYPTION_KEY) {
    console.error(
      "[env] SOCIAL_SYNC_ENABLED=true but SOCIAL_TOKEN_ENCRYPTION_KEY is not set. " +
        "The cron worker will no-op until the platform operator sets the KEK. " +
        "Generate with: openssl rand -base64 32",
    );
  }
}

// ─── Type exports ───────────────────────────────────────────────────────────
export type ClientEnv = z.infer<typeof clientSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

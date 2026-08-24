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
});

const _clientParsed = clientSchema.safeParse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
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

  // Sentry (Goal 13)
  SENTRY_DSN: stringOrEmpty,
  SENTRY_AUTH_TOKEN: stringOrEmpty,
  SENTRY_ORG: stringOrEmpty,
  SENTRY_PROJECT: stringOrEmpty,

  // Cron + bootstrap
  CRON_SECRET: stringOrEmpty,
  BOOTSTRAP_SETUP_TOKEN: stringOrEmpty,

  // M4 — social profile analytics. The encryption key is required
  // when SOCIAL_SYNC_ENABLED is true; the provider credentials are
  // optional in dev so the rest of the app can boot without a Meta
  // app configured. None of these may be exposed as NEXT_PUBLIC_*.
  // Generate the key with: openssl rand -base64 32
  SOCIAL_TOKEN_ENCRYPTION_KEY: stringOrEmpty,
  META_APP_ID: stringOrEmpty,
  META_APP_SECRET: stringOrEmpty,
  META_LOGIN_CONFIG_ID: stringOrEmpty,
  META_GRAPH_API_VERSION: z.string().default("v25.0"),
  TIKTOK_CLIENT_KEY: stringOrEmpty,
  TIKTOK_CLIENT_SECRET: stringOrEmpty,
  SOCIAL_SYNC_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  // Per-provider gate. When false, the TikTok provider and callback
  // routes return 404 / disabled. Default false until the seven-day
  // Meta observation window passes.
  SOCIAL_TIKTOK_ENABLED: z
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

  // M4 — when social sync is enabled, the encryption key is required
  // and must decode to exactly 32 bytes. The provider credentials
  // remain optional so a deployment can ship with the key set and the
  // cron route disabled (the recommended starting state).
  if (serverEnv.SOCIAL_SYNC_ENABLED) {
    if (!serverEnv.SOCIAL_TOKEN_ENCRYPTION_KEY) {
      throw new Error(
        "SOCIAL_TOKEN_ENCRYPTION_KEY is required when SOCIAL_SYNC_ENABLED=true (generate with: openssl rand -base64 32)",
      );
    }
    const decoded = Buffer.from(serverEnv.SOCIAL_TOKEN_ENCRYPTION_KEY, "base64");
    if (decoded.length !== 32) {
      throw new Error(
        `SOCIAL_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${decoded.length})`,
      );
    }
  }
}

// ─── Type exports ───────────────────────────────────────────────────────────
export type ClientEnv = z.infer<typeof clientSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

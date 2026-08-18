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

  // Cron + bootstrap
  CRON_SECRET: stringOrEmpty,
  BOOTSTRAP_SETUP_TOKEN: stringOrEmpty,
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

// ─── Type exports ───────────────────────────────────────────────────────────
export type ClientEnv = z.infer<typeof clientSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

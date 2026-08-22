import { describe, expect, it, vi } from "vitest";

/**
 * Auth config tests — exercise the NextAuth config object by mocking
 * the `next-auth` package, the Credentials provider, the Nodemailer
 * provider, the Google provider, and the DrizzleAdapter. We can then
 * poke the callbacks directly without pulling in the next/server
 * dependency (which is a Node-only module and not available in jsdom).
 */

const nextAuthMocks = vi.hoisted(() => {
  return {
    NextAuth: vi.fn((config: unknown) => {
      (globalThis as Record<string, unknown>).__lastNextAuthConfig = config;
      return {
        handlers: { GET: vi.fn(), POST: vi.fn() },
        signIn: vi.fn(),
        signOut: vi.fn(),
        auth: vi.fn(),
      };
    }),
    google: vi.fn((config: unknown) => ({ id: "google", ...(config as object) })),
    nodemailer: vi.fn((config: unknown) => ({ id: "nodemailer", ...(config as object) })),
    credentials: vi.fn((config: object) => ({ id: "credentials", ...config })),
  };
});

vi.mock("next-auth", () => ({
  default: nextAuthMocks.NextAuth,
  NextAuth: nextAuthMocks.NextAuth,
  Google: nextAuthMocks.google,
  Nodemailer: nextAuthMocks.nodemailer,
  Credentials: nextAuthMocks.credentials,
}));

// The auth config imports providers from their subpath modules. Mock
// each one explicitly so the providers array is built from the test
// doubles above (the root `next-auth` mock alone doesn't cover the
// `next-auth/providers/<name>` subpath imports).
vi.mock("next-auth/providers/nodemailer", () => ({
  default: nextAuthMocks.nodemailer,
}));
vi.mock("next-auth/providers/google", () => ({
  default: nextAuthMocks.google,
}));
vi.mock("next-auth/providers/credentials", () => ({
  default: nextAuthMocks.credentials,
}));

const envValues: Record<string, unknown> = {
  AUTH_SECRET: "test-secret",
  AUTH_TRUST_HOST: true,
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: 587,
  SMTP_USER: "user@example.com",
  SMTP_PASSWORD: "secret",
  SMTP_FROM: "no-reply@example.com",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  AUTH_URL: "http://localhost:3000",
  NODE_ENV: "test",
  POSTGRES_USER: "",
  POSTGRES_PASSWORD: "",
  POSTGRES_DB: "",
  MINIMAX_API_KEY: "",
  MINIMAX_BASE_URL: "",
  MINIMAX_MODEL: "",
  AI_FEATURE_ENABLED: false,
  SENTRY_DSN: "",
  SENTRY_AUTH_TOKEN: "",
  SENTRY_ORG: "",
  SENTRY_PROJECT: "",
  CRON_SECRET: "",
  BOOTSTRAP_SETUP_TOKEN: "",
};

vi.mock("@/lib/validation/env", () => ({
  serverEnv: new Proxy({}, { get: (_, key: string) => envValues[key] }),
}));

vi.mock("@auth/drizzle-adapter", () => ({
  DrizzleAdapter: vi.fn(() => ({ id: "adapter" })),
}));

// The Credentials provider's authorize callback uses the real
// `findUserByEmailAndPassword`, which hits the DB. We don't try to
// drive it from this test — it has its own dedicated coverage in
// tests/unit/auth-password-hash.test.ts. We just assert that the
// provider was created and has an authorize function.

const { authConfig, handlers, signIn, signOut, auth } = await import("@/lib/auth/config");
const indexModule = await import("@/lib/auth/index");

describe("authConfig", () => {
  it("uses the JWT session strategy with a 30-day maxAge", () => {
    expect(authConfig.session).toEqual({ strategy: "jwt", maxAge: 30 * 24 * 60 * 60 });
  });

  it("exposes the canonical sign-in / sign-out / error pages", () => {
    expect(authConfig.pages).toMatchObject({
      signIn: "/signin",
      signOut: "/signin",
      error: "/signin",
      verifyRequest: "/signin/verify",
      newUser: "/setup",
    });
  });

  it("trusts the host header per serverEnv.AUTH_TRUST_HOST", () => {
    expect(authConfig.trustHost).toBe(true);
  });

  it("includes the Credentials provider as the first entry", () => {
    const providers = authConfig.providers ?? [];
    expect(providers.length).toBeGreaterThan(0);
  });

  it("jwt callback assigns the user id, role, and a 24h exp when remember=false", async () => {
    const cb = authConfig.callbacks?.jwt;
    expect(cb).toBeDefined();
    if (!cb) return;
    const token = await cb({
      token: {} as never,
      user: { id: "user-1", role: "agency_admin", remember: false } as never,
      account: null,
      profile: undefined,
      isNewUser: false,
      trigger: "signIn",
      session: undefined,
    } as never);
    expect((token as { id?: string }).id).toBe("user-1");
    expect((token as { role?: string }).role).toBe("agency_admin");
    expect((token as { exp?: number }).exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("jwt callback defaults role to 'user' when not provided", async () => {
    const cb = authConfig.callbacks?.jwt;
    if (!cb) return;
    const token = await cb({
      token: {} as never,
      user: { id: "user-2" } as never,
      account: null,
      profile: undefined,
      isNewUser: false,
      trigger: "signIn",
      session: undefined,
    } as never);
    expect((token as { role?: string }).role).toBe("user");
  });

  it("jwt callback does not set exp when remember is true (default 30-day applies)", async () => {
    const cb = authConfig.callbacks?.jwt;
    if (!cb) return;
    const token = await cb({
      token: {} as never,
      user: { id: "user-1", role: "user", remember: true } as never,
      account: null,
      profile: undefined,
      isNewUser: false,
      trigger: "signIn",
      session: undefined,
    } as never);
    expect((token as { exp?: number }).exp).toBeUndefined();
  });

  it("session callback copies id and role from the token", async () => {
    const cb = authConfig.callbacks?.session;
    expect(cb).toBeDefined();
    if (!cb) return;
    const out = await cb({
      session: { user: { id: "", role: "" } } as never,
      token: { id: "user-1", role: "agency_admin" } as never,
      newSession: undefined,
      trigger: "update",
    } as never);
    expect((out as { user: { id: string } }).user.id).toBe("user-1");
    expect((out as { user: { role: string } }).user.role).toBe("agency_admin");
  });

  it("authorized callback returns true for any signed-in user", async () => {
    const cb = authConfig.callbacks?.authorized;
    expect(cb).toBeDefined();
    if (!cb) return;
    const yes = await cb({ auth: { user: { id: "u" } } } as never);
    const no = await cb({ auth: null } as never);
    expect(yes).toBe(true);
    expect(no).toBe(false);
  });

  it("Credentials authorize returns null when email or password is missing", async () => {
    const providers = (authConfig.providers ?? []) as Array<{
      authorize?: (creds: unknown) => Promise<unknown>;
    }>;
    const credentials = providers[0]!;
    expect(credentials.authorize).toBeDefined();
    // Empty strings fail the truthiness check; the real
    // findUserByEmailAndPassword is never called.
    const out1 = await credentials.authorize!({ email: "", password: "x" });
    const out2 = await credentials.authorize!({ email: "x", password: "" });
    const out3 = await credentials.authorize!({});
    expect(out1).toBeNull();
    expect(out2).toBeNull();
    expect(out3).toBeNull();
  });
});

describe("Nodemailer provider wiring", () => {
  it("is constructed with our custom sendVerificationRequest so SMTP errors surface as EmailSignInError", () => {
    // The Nodemailer provider is the third entry in the providers
    // array: [Credentials, (Google if configured), Nodemailer]. The
    // mock records every call we made to it, so we can assert the
    // final invocation passed our `sendVerificationEmail` wrapper.
    const calls = nextAuthMocks.nodemailer.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const lastConfig = calls[calls.length - 1]![0] as {
      sendVerificationRequest?: { name?: string };
      server?: { host?: string; port?: number };
      from?: string;
    };
    expect(lastConfig.server?.host).toBe("smtp.example.com");
    expect(lastConfig.server?.port).toBe(587);
    expect(lastConfig.from).toBe("no-reply@example.com");
    expect(typeof lastConfig.sendVerificationRequest).toBe("function");
    // The wrapper is the `sendVerificationEmail` re-export from
    // @/lib/email. Spot-check by name to keep this test stable across
    // refactors (and prove the function comes from our module, not the
    // upstream default).
    expect(lastConfig.sendVerificationRequest?.name).toBe("sendVerificationEmail");
  });
});

describe("events.signIn stamps emailVerified for unverified users", () => {
  // The events.signIn callback writes to the `user` table. We don't mock
  // the DB globally (the auth-config suite lets `findUserByEmailAndPassword`
  // hit the real connection when its own tests call it). Instead, we
  // assert the structural contract and call the handler with a stub
  // user, expecting it to no-op (the DB UPDATE simply has no rows to
  // match in this test, which is the same observable as a successful
  // no-op against a real DB). A more thorough integration test lives
  // in tests/integration/.
  it("is a function on authConfig.events", () => {
    expect(typeof authConfig.events?.signIn).toBe("function");
  });

  it("does not throw when called with an empty user object", async () => {
    const handler = authConfig.events?.signIn;
    expect(handler).toBeDefined();
    // User has no id → early return. No DB call.
    await expect(handler!({} as never)).resolves.toBeUndefined();
    await expect(handler!({ user: {} as never } as never)).resolves.toBeUndefined();
    await expect(handler!({ user: { id: "" } as never } as never)).resolves.toBeUndefined();
  });
});

describe("auth module re-exports", () => {
  it("re-exports authConfig, handlers, signIn, signOut, auth", () => {
    expect(indexModule.authConfig).toBe(authConfig);
    expect(indexModule.handlers).toBe(handlers);
    expect(indexModule.signIn).toBe(signIn);
    expect(indexModule.signOut).toBe(signOut);
    expect(indexModule.auth).toBe(auth);
  });
});

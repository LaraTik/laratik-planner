import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * NextAuth callback coverage that `tests/unit/auth-config.test.ts` does not
 * reach. That suite deliberately leaves the DB real, so it can only assert
 * the structural shape of the config; the branches that actually decide a
 * user's session lifetime and first-login redirect were untested.
 *
 * What is protected here:
 *
 *   1. **Credentials `authorize` is the only password gate.** It must return
 *      null for an unknown user, and it must forward `remember` and
 *      `mustChangePassword` — the JWT callback and the /set-password
 *      redirect middleware both read them from the returned user object.
 *   2. **`remember=false` shortens the token to 24h.** Anything other than
 *      the three truthy strings must count as "off"; a checkbox posting
 *      "on " with a stray space would otherwise silently grant 30 days.
 *   3. **`trigger: "update"` re-reads `mustChangePassword` from the DB.**
 *      Without the refresh, the first-login redirect keeps firing after the
 *      user sets a new password.
 *   4. **A failed email-verified stamp never fails the sign-in**, but it is
 *      reported to Sentry — the OTHER-14 audit replaced a `console.error`
 *      that never reached on-call.
 */

const nextAuthMocks = vi.hoisted(() => ({
  NextAuth: vi.fn(() => ({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: vi.fn(),
  })),
  google: vi.fn((config: object) => ({ id: "google", ...config })),
  nodemailer: vi.fn((config: object) => ({ id: "nodemailer", ...config })),
  credentials: vi.fn((config: object) => ({ id: "credentials", ...config })),
}));

vi.mock("next-auth", () => ({
  default: nextAuthMocks.NextAuth,
  NextAuth: nextAuthMocks.NextAuth,
  Google: nextAuthMocks.google,
  Nodemailer: nextAuthMocks.nodemailer,
  Credentials: nextAuthMocks.credentials,
}));
vi.mock("next-auth/providers/nodemailer", () => ({ default: nextAuthMocks.nodemailer }));
vi.mock("next-auth/providers/google", () => ({ default: nextAuthMocks.google }));
vi.mock("next-auth/providers/credentials", () => ({ default: nextAuthMocks.credentials }));
vi.mock("@auth/drizzle-adapter", () => ({ DrizzleAdapter: vi.fn(() => ({ id: "adapter" })) }));

const envValues: Record<string, unknown> = {
  AUTH_SECRET: "test-secret",
  AUTH_TRUST_HOST: true,
  // Google is deliberately unset here; a dedicated describe below re-imports
  // the module with it set to cover the conditional provider branch.
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  SMTP_HOST: "",
  SMTP_PORT: 587,
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  SMTP_FROM: "",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  AUTH_URL: "http://localhost:3000",
  NODE_ENV: "test",
};
vi.mock("@/lib/validation/env", () => ({
  serverEnv: new Proxy({}, { get: (_, key: string) => envValues[key] }),
}));

const dbMock = vi.hoisted(() => ({ db: { select: vi.fn(), update: vi.fn(), insert: vi.fn() } }));
vi.mock("@/lib/db", () => dbMock);

const passwordMock = vi.hoisted(() => ({ findUserByEmailAndPassword: vi.fn() }));
vi.mock("@/lib/auth/password", () => passwordMock);

const sentryMock = vi.hoisted(() => ({ captureError: vi.fn(), setUser: vi.fn() }));
vi.mock("@/lib/observability/sentry", () => sentryMock);

const emailMock = vi.hoisted(() => ({ sendVerificationEmail: vi.fn() }));
vi.mock("@/lib/email", () => emailMock);

const { authConfig } = await import("@/lib/auth/config");

/** Fluent, awaitable Drizzle stand-in. */
function makeChain(terminal: unknown) {
  const target: Record<string, unknown> = {};
  const proxy = new Proxy(target, {
    get(_t, prop) {
      if (prop === "then") {
        return (onFulfilled?: (v: unknown) => unknown) =>
          Promise.resolve(terminal).then(onFulfilled);
      }
      return () => proxy;
    },
  });
  return proxy;
}

type Authorize = (creds: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
const credentialsProvider = () =>
  (authConfig.providers ?? [])[0] as unknown as { authorize: Authorize };

const jwt = () => authConfig.callbacks!.jwt!;
const sessionCb = () => authConfig.callbacks!.session!;
const signInEvent = () => authConfig.events!.signIn!;

function jwtArgs(over: Record<string, unknown>) {
  return {
    token: {} as never,
    user: undefined as never,
    account: null,
    profile: undefined,
    isNewUser: false,
    trigger: "signIn",
    session: undefined,
    ...over,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.db.select.mockReset();
  dbMock.db.update.mockReset();
  dbMock.db.insert.mockReset();
  passwordMock.findUserByEmailAndPassword.mockReset();
  sentryMock.captureError.mockReset();
  sentryMock.setUser.mockReset();
  emailMock.sendVerificationEmail.mockReset();
});

// ── Credentials authorize ────────────────────────────────────────────────

describe("Credentials authorize", () => {
  const DB_USER = {
    id: "user-1",
    email: "owner@acme.test",
    name: null,
    mustChangePassword: true,
  };

  it("returns null for an unknown user", async () => {
    passwordMock.findUserByEmailAndPassword.mockResolvedValue(undefined);
    // Returning null is how NextAuth signals "bad credentials" — it must not
    // leak that the email exists.
    expect(await credentialsProvider().authorize({ email: "a@b.c", password: "x" })).toBeNull();
    expect(passwordMock.findUserByEmailAndPassword).toHaveBeenCalledWith("a@b.c", "x");
  });

  it("returns the identity and forwards mustChangePassword and remember", async () => {
    passwordMock.findUserByEmailAndPassword.mockResolvedValue(DB_USER);
    const user = await credentialsProvider().authorize({
      email: "owner@acme.test",
      password: "hunter2",
      remember: "on",
    });
    // `mustChangePassword` is what the first-login redirect middleware
    // reads; dropping it here would strand the user on a stale prompt.
    expect(user).toMatchObject({
      id: "user-1",
      email: "owner@acme.test",
      name: "owner@acme.test",
      mustChangePassword: true,
      remember: true,
    });
  });

  it("falls back to the email when the user has no name", async () => {
    passwordMock.findUserByEmailAndPassword.mockResolvedValue({ ...DB_USER, name: null });
    const user = await credentialsProvider().authorize({ email: "owner@acme.test", password: "x" });
    expect(user!.name).toBe("owner@acme.test");
  });

  it("treats only on/true/1 as remember, and anything else as off", async () => {
    passwordMock.findUserByEmailAndPassword.mockResolvedValue(DB_USER);
    for (const on of ["on", "true", "1"]) {
      const user = await credentialsProvider().authorize({
        email: "e",
        password: "p",
        remember: on,
      });
      expect(user!.remember, `remember=${on}`).toBe(true);
    }
    // A stray space, a boolean-ish string, or absence must all mean "off";
    // granting 30 days to a user who unticked the box is a real exposure.
    for (const off of ["on ", " true", "yes", "", true, undefined]) {
      const user = await credentialsProvider().authorize({
        email: "e",
        password: "p",
        remember: off,
      });
      expect(user!.remember, `remember=${JSON.stringify(off)}`).toBe(false);
    }
  });

  it("ignores non-string email and password values", async () => {
    passwordMock.findUserByEmailAndPassword.mockResolvedValue(undefined);
    // A credential field arriving as a number/object must not be coerced
    // into a lookup that could match the wrong row.
    expect(await credentialsProvider().authorize({ email: 1, password: 2 })).toBeNull();
    expect(passwordMock.findUserByEmailAndPassword).not.toHaveBeenCalled();
  });
});

// ── jwt callback ─────────────────────────────────────────────────────────

describe("jwt callback", () => {
  it("shortens the token to 24h when remember is false", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = (await jwt()(jwtArgs({ user: { id: "u1", role: "user", remember: false } }))) as {
      exp?: number;
    };
    // 24h, not the config-level 30 days.
    expect(token.exp).toBeGreaterThanOrEqual(before + 24 * 60 * 60);
    expect(token.exp).toBeLessThanOrEqual(before + 24 * 60 * 60 + 5);
  });

  it("leaves exp alone for remember=true, undefined, or absent", async () => {
    for (const remember of [true, undefined]) {
      const token = (await jwt()(
        jwtArgs({
          user: { id: "u1", role: "user", ...(remember === undefined ? {} : { remember }) },
        }),
      )) as { exp?: number };
      expect(token.exp).toBeUndefined();
    }
  });

  it("copies mustChangePassword from the sign-in user", async () => {
    const token = (await jwt()(
      jwtArgs({ user: { id: "u1", role: "user", mustChangePassword: true } }),
    )) as { mustChangePassword?: boolean };
    expect(token.mustChangePassword).toBe(true);
  });

  it("omits mustChangePassword when the provider did not report one", async () => {
    // A missing value must stay missing rather than becoming an implicit
    // `false`, which would clear a real must-change flag on the next refresh.
    const token = (await jwt()(jwtArgs({ user: { id: "u1", role: "user" } }))) as {
      mustChangePassword?: boolean;
    };
    expect("mustChangePassword" in token).toBe(false);
  });

  it("re-reads mustChangePassword from the DB on a client-driven update", async () => {
    dbMock.db.select.mockReturnValue(makeChain([{ mustChangePassword: true }]));
    const token = (await jwt()(
      jwtArgs({ token: { id: "u1" }, user: undefined, trigger: "update" }),
    )) as { mustChangePassword?: boolean };
    expect(token.mustChangePassword).toBe(true);
    expect(dbMock.db.select).toHaveBeenCalledTimes(1);
  });

  it("clears the flag on update when the DB says the password was set", async () => {
    // This is the flow that stops /set-password from looping: after the user
    // saves a new password the column flips to false and the redirect stops.
    dbMock.db.select.mockReturnValue(makeChain([{ mustChangePassword: false }]));
    const token = (await jwt()(
      jwtArgs({ token: { id: "u1" }, user: undefined, trigger: "update" }),
    )) as { mustChangePassword?: boolean };
    expect(token.mustChangePassword).toBe(false);
  });

  it("falls back to false when the update-triggered lookup returns no row", async () => {
    dbMock.db.select.mockReturnValue(makeChain([]));
    const token = (await jwt()(
      jwtArgs({ token: { id: "u1" }, user: undefined, trigger: "update" }),
    )) as { mustChangePassword?: boolean };
    expect(token.mustChangePassword).toBe(false);
  });

  it("skips the DB read on a non-update trigger", async () => {
    await jwt()(jwtArgs({ token: { id: "u1" }, user: undefined, trigger: "signIn" }));
    expect(dbMock.db.select).not.toHaveBeenCalled();
  });

  it("skips the DB read on update when the token has no id", async () => {
    await jwt()(jwtArgs({ token: {}, user: undefined, trigger: "update" }));
    expect(dbMock.db.select).not.toHaveBeenCalled();
  });
});

// ── session callback ─────────────────────────────────────────────────────

describe("session callback", () => {
  it("exposes mustChangePassword so client middleware can act on it", async () => {
    const out = (await sessionCb()({
      session: { user: {} },
      token: { id: "u1", role: "user", mustChangePassword: true },
    } as never)) as { user: { id: string; role: string; mustChangePassword: boolean } };
    expect(out.user.mustChangePassword).toBe(true);
  });

  it("does not invent the field when the token has no flag", async () => {
    const out = (await sessionCb()({
      session: { user: {} },
      token: { id: "u1", role: "user" },
    } as never)) as unknown as { user: Record<string, unknown> };
    expect("mustChangePassword" in out.user).toBe(false);
  });

  it("leaves id and role untouched when the token carries neither", async () => {
    const out = (await sessionCb()({
      session: { user: { id: "keep", role: "keep" } },
      token: {},
    } as never)) as { user: { id: string; role: string } };
    expect(out.user).toMatchObject({ id: "keep", role: "keep" });
  });
});

// ── events.signIn ────────────────────────────────────────────────────────

describe("events.signIn", () => {
  it("stamps emailVerified and tags the Sentry user", async () => {
    const sets: Array<Record<string, unknown>> = [];
    dbMock.db.update.mockImplementation(() => ({
      set: (payload: Record<string, unknown>) => {
        sets.push(payload);
        return makeChain(undefined);
      },
    }));

    await signInEvent()({ user: { id: "u1", email: "a@b.c", name: "Ada" } } as never);

    expect(sets).toHaveLength(1);
    expect(dbMock.db.update).toHaveBeenCalledTimes(1);
    expect(sentryMock.setUser).toHaveBeenCalledWith({ id: "u1", email: "a@b.c", username: "Ada" });
  });

  it("omits absent optional identity fields from the Sentry tag", async () => {
    // `exactOptionalPropertyTypes` means an explicit `email: undefined` is a
    // different value from an absent key; the spread must omit them.
    dbMock.db.update.mockImplementation(() => ({ set: () => makeChain(undefined) }));
    await signInEvent()({ user: { id: "u1" } } as never);
    expect(sentryMock.setUser).toHaveBeenCalledWith({ id: "u1" });
  });

  it("never fails the sign-in when the verification stamp throws", async () => {
    dbMock.db.update.mockImplementation(() => ({
      set: () => ({
        where: () => {
          throw new Error("connection reset");
        },
      }),
    }));

    // A dropped stamp must not break sign-in — the password flow re-stamps it
    // and the magic-link flow would otherwise fail with "Invalid invitation".
    await expect(signInEvent()({ user: { id: "u1" } } as never)).resolves.toBeUndefined();
    // …but it must reach Sentry, which is the fix the OTHER-14 audit made.
    expect(sentryMock.captureError).toHaveBeenCalledWith(
      "auth.events.signIn.email_verified_stamp_failed",
      expect.any(Error),
      { userId: "u1" },
    );
  });
});

// ── Google provider branch ───────────────────────────────────────────────

describe("Google provider is enabled only when both credentials are present", () => {
  async function loadConfig() {
    vi.resetModules();
    nextAuthMocks.google.mockClear();
    const mod = (await import("@/lib/auth/config")) as unknown as {
      authConfig: typeof authConfig;
    };
    return mod.authConfig;
  }

  afterEach(() => {
    envValues["GOOGLE_CLIENT_ID"] = "";
    envValues["GOOGLE_CLIENT_SECRET"] = "";
    envValues["SMTP_HOST"] = "";
    envValues["SMTP_USER"] = "";
    envValues["SMTP_PASSWORD"] = "";
    envValues["SMTP_FROM"] = "";
  });

  it("adds the Google provider when id and secret are both set", async () => {
    envValues["GOOGLE_CLIENT_ID"] = "gid";
    envValues["GOOGLE_CLIENT_SECRET"] = "gsecret";
    const config = await loadConfig();
    const providers = config.providers as Array<{ id?: string }>;
    expect(providers.map((p) => p.id)).toContain("google");
    // Account linking on a shared email domain is a takeover vector, so this
    // must stay explicitly false.
    expect(nextAuthMocks.google.mock.calls[0]![0]).toMatchObject({
      clientId: "gid",
      clientSecret: "gsecret",
      allowDangerousEmailAccountLinking: false,
    });
  });

  it("omits the Google provider when the secret is missing", async () => {
    envValues["GOOGLE_CLIENT_ID"] = "gid";
    envValues["GOOGLE_CLIENT_SECRET"] = "";
    const config = await loadConfig();
    const providers = config.providers as Array<{ id?: string }>;
    expect(providers.map((p) => p.id)).not.toContain("google");
  });

  it("omits the Nodemailer provider unless every SMTP variable is present", async () => {
    envValues["SMTP_HOST"] = "smtp.example.com";
    envValues["SMTP_USER"] = "u";
    envValues["SMTP_PASSWORD"] = "p";
    envValues["SMTP_FROM"] = "";
    const config = await loadConfig();
    const providers = config.providers as Array<{ id?: string }>;
    // A missing SMTP_FROM silently breaks the magic-link sender address.
    expect(providers.map((p) => p.id)).not.toContain("nodemailer");
  });

  it("builds the Nodemailer server config with auth when the credentials are set", async () => {
    envValues["SMTP_HOST"] = "smtp.example.com";
    envValues["SMTP_USER"] = "u";
    envValues["SMTP_PASSWORD"] = "p";
    envValues["SMTP_FROM"] = "no-reply@example.com";
    nextAuthMocks.nodemailer.mockClear();
    const config = await loadConfig();
    const providers = config.providers as Array<{ id?: string }>;
    expect(providers.map((p) => p.id)).toContain("nodemailer");
    expect(nextAuthMocks.nodemailer.mock.calls[0]![0]).toMatchObject({
      server: { host: "smtp.example.com", port: 587, auth: { user: "u", pass: "p" } },
      from: "no-reply@example.com",
    });
  });

  it("omits the provider entirely when SMTP_USER is empty", async () => {
    // The provider-level guard (`SMTP_HOST && SMTP_USER && SMTP_PASSWORD &&
    // SMTP_FROM`) means an empty SMTP_USER never reaches the `auth:` spread.
    // An unauthenticated relay with a configured user is a misconfiguration
    // that must fail closed by disabling magic-link sign-in, not by sending
    // unauthenticated mail.
    envValues["SMTP_HOST"] = "smtp.example.com";
    envValues["SMTP_USER"] = "";
    envValues["SMTP_PASSWORD"] = "p";
    envValues["SMTP_FROM"] = "no-reply@example.com";
    nextAuthMocks.nodemailer.mockClear();
    const config = await loadConfig();
    const providers = config.providers as Array<{ id?: string }>;
    expect(providers.map((p) => p.id)).not.toContain("nodemailer");
    expect(nextAuthMocks.nodemailer).not.toHaveBeenCalled();
  });
});

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// `server-only` is a Next.js convention that throws at build time if it
// leaks into client code. Vitest resolves it to an empty module, so we
// have to install the same stub the test setup uses.
vi.mock("server-only", () => ({}));

// Mock nodemailer before importing the module under test.
const sendMailMock = vi.fn();
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: createTransportMock,
  },
}));

const envValues: Record<string, unknown> = {
  NODE_ENV: "test",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: 587,
  SMTP_USER: "user@example.com",
  SMTP_PASSWORD: "secret",
  SMTP_FROM: "no-reply@example.com",
};

vi.mock("@/lib/validation/env", () => ({
  serverEnv: new Proxy(
    {},
    {
      get: (_, key: string) => (envValues as Record<string, unknown>)[key],
    },
  ),
}));

// Import after the env + nodemailer mocks are wired. Re-import inside
// beforeEach via vi.resetModules() + dynamic import to keep the cached
// transporter fresh per test.
async function loadEmail() {
  return await import("@/lib/email");
}

describe("getMailer", () => {
  beforeEach(() => {
    // Reset the module so the internal `cached` transporter is null
    // for every test, then clear the mock call log.
    vi.resetModules();
    createTransportMock.mockClear();
    sendMailMock.mockClear();
  });

  it("creates a transporter on first call and caches it", async () => {
    const email = await loadEmail();
    const first = email.getMailer();
    const second = email.getMailer();
    expect(first).not.toBeNull();
    expect(first).toBe(second); // cached
    expect(createTransportMock).toHaveBeenCalledTimes(1);
  });

  it("passes host, port, secure, and auth to createTransport", async () => {
    const email = await loadEmail();
    email.getMailer();
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.com",
        port: 587,
        secure: false, // 587 is not 465
        auth: { user: "user@example.com", pass: "secret" },
      }),
    );
  });
});

describe("sendEmail", () => {
  beforeEach(() => {
    // The module holds a module-level `cached` transporter. We use
    // vi.resetModules() between tests so each test gets a fresh module
    // and a fresh transporter wired to the (now-cleared) mock. The
    // mocks themselves are stable across resets because vi.mock() at
    // the top of the file is hoisted.
    vi.resetModules();
    createTransportMock.mockClear();
    sendMailMock.mockClear();
    sendMailMock.mockResolvedValue({ messageId: "msg-abc-123" });
  });

  it("returns the messageId from nodemailer on success", async () => {
    const email = await loadEmail();
    const result = await email.sendEmail({
      to: "alice@example.com",
      subject: "Welcome",
      text: "Hi",
    });
    expect(result).toEqual({ id: "msg-abc-123" });
  });

  it("forwards subject/text/html/replyTo/from to sendMail", async () => {
    const email = await loadEmail();
    await email.sendEmail({
      to: "alice@example.com",
      subject: "Subject",
      text: "Plain body",
      html: "<p>HTML body</p>",
      replyTo: "support@example.com",
    });
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "no-reply@example.com",
        to: "alice@example.com",
        subject: "Subject",
        text: "Plain body",
        html: "<p>HTML body</p>",
        replyTo: "support@example.com",
      }),
    );
  });

  it("joins multiple recipients with a comma when given an array", async () => {
    const email = await loadEmail();
    await email.sendEmail({
      to: ["alice@example.com", "bob@example.com"],
      subject: "Group",
      text: "Hi both",
    });
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "alice@example.com, bob@example.com" }),
    );
  });
});

describe("getMailer / sendEmail when SMTP is not configured", () => {
  beforeEach(() => {
    vi.resetModules();
    envValues["SMTP_HOST"] = "";
    envValues["SMTP_USER"] = "";
    createTransportMock.mockClear();
    sendMailMock.mockClear();
  });

  afterEach(() => {
    envValues["SMTP_HOST"] = "smtp.example.com";
    envValues["SMTP_USER"] = "user@example.com";
  });

  it("getMailer returns null when SMTP_HOST is missing", async () => {
    const email = await loadEmail();
    expect(email.getMailer()).toBeNull();
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it("getMailer returns null when SMTP_USER is missing", async () => {
    envValues["SMTP_HOST"] = "smtp.example.com";
    envValues["SMTP_USER"] = "";
    const email = await loadEmail();
    expect(email.getMailer()).toBeNull();
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it("sendEmail returns null and does not call sendMail when SMTP is unconfigured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const email = await loadEmail();
    const result = await email.sendEmail({
      to: "alice@example.com",
      subject: "Hello",
      text: "World",
    });
    expect(result).toBeNull();
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("getMailer when SMTP_PORT is 465 (secure: true)", () => {
  beforeEach(() => {
    vi.resetModules();
    envValues["SMTP_PORT"] = 465;
    createTransportMock.mockClear();
  });

  afterEach(() => {
    envValues["SMTP_PORT"] = 587;
  });

  it("passes secure: true when port is 465", async () => {
    const email = await loadEmail();
    email.getMailer();
    expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ secure: true }));
  });
});

// ─── sendVerificationEmail (NextAuth Nodemailer provider hook) ─────────────

// Imported lazily so the @auth/core/errors import (which happens when
// the email module is loaded) is resolved after the nodemailer mock
// is installed. The module's `cached` transporter is reset per test
// via vi.resetModules().

const verificationParams = {
  identifier: "alice@example.com",
  url: "https://planner.laratik.com/api/auth/callback/nodemailer?token=abc&email=alice%40example.com",
  provider: { from: "laratik-planner <no-reply@laratik.com>" },
};

describe("sendVerificationEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    createTransportMock.mockClear();
    sendMailMock.mockClear();
  });

  it("sends a magic-link email to the identifier with the NextAuth-shaped subject", async () => {
    sendMailMock.mockResolvedValue({ messageId: "msg-magic-1", rejected: [], pending: [] });
    const email = await loadEmail();
    await email.sendVerificationEmail(verificationParams);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const [call] = sendMailMock.mock.calls[0]!;
    expect(call).toEqual(
      expect.objectContaining({
        to: "alice@example.com",
        from: "laratik-planner <no-reply@laratik.com>",
        subject: "Sign in to planner.laratik.com",
        text: expect.stringContaining("https://planner.laratik.com/api/auth/callback/nodemailer"),
        html: expect.stringContaining("https://planner.laratik.com/api/auth/callback/nodemailer"),
      }),
    );
  });

  it("uses the theme brandColor / buttonText in the HTML body when provided", async () => {
    sendMailMock.mockResolvedValue({ messageId: "msg-magic-2", rejected: [], pending: [] });
    const email = await loadEmail();
    await email.sendVerificationEmail({
      ...verificationParams,
      theme: { brandColor: "#3525cd", buttonText: "#ffffff" },
    });
    const [call] = sendMailMock.mock.calls[0]!;
    expect(call.html).toContain("#3525cd");
    expect(call.html).toContain("#ffffff");
  });

  it("falls back to the provider.from when serverEnv.SMTP_FROM is empty", async () => {
    // The provider arg in real NextAuth always carries the configured from.
    // We pass a custom one and confirm it's preferred over the env.
    sendMailMock.mockResolvedValue({ messageId: "msg-magic-3", rejected: [], pending: [] });
    const email = await loadEmail();
    await email.sendVerificationEmail({
      ...verificationParams,
      provider: { from: "Custom Sender <custom@example.com>" },
    });
    const [call] = sendMailMock.mock.calls[0]!;
    expect(call.from).toBe("Custom Sender <custom@example.com>");
  });

  it("throws EmailSignInError when Nodemailer.sendMail rejects the recipient", async () => {
    sendMailMock.mockResolvedValue({
      messageId: "msg-magic-4",
      rejected: ["alice@example.com"],
      pending: [],
    });
    const email = await loadEmail();
    await expect(email.sendVerificationEmail(verificationParams)).rejects.toBeInstanceOf(
      email.EmailSignInError,
    );
    await expect(email.sendVerificationEmail(verificationParams)).rejects.toThrow(
      /alice@example\.com/,
    );
  });

  it("throws EmailSignInError when Nodemailer.sendMail lists a pending recipient", async () => {
    sendMailMock.mockResolvedValue({
      messageId: "msg-magic-5",
      rejected: [],
      pending: ["alice@example.com"],
    });
    const email = await loadEmail();
    await expect(email.sendVerificationEmail(verificationParams)).rejects.toBeInstanceOf(
      email.EmailSignInError,
    );
  });

  it("throws EmailSignInError that wraps the original Nodemailer/network error as `cause.err`", async () => {
    const networkErr = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:587"), {
      code: "ECONNREFUSED",
    });
    sendMailMock.mockRejectedValue(networkErr);
    const email = await loadEmail();
    let caught: unknown;
    try {
      await email.sendVerificationEmail(verificationParams);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(email.EmailSignInError);
    // The wrapped error message preserves the underlying reason so
    // the server log line is diagnostic, not the bare "Configuration".
    expect((caught as Error).message).toContain("ECONNREFUSED");
    // `cause.err` should be the original error so the AuthError
    // formatter in @auth/core can print its stack + code.
    const cause = (caught as Error & { cause?: { err?: Error } }).cause;
    expect(cause?.err).toBe(networkErr);
  });

  it("wraps non-Error rejections so the cause is still an Error instance", async () => {
    // Some Nodemailer failure modes reject with strings (rare but observed
    // in older versions). The wrapper should still preserve a cause.err.
    sendMailMock.mockRejectedValue("connection reset by peer");
    const email = await loadEmail();
    let caught: unknown;
    try {
      await email.sendVerificationEmail(verificationParams);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(email.EmailSignInError);
    const cause = (caught as Error & { cause?: { err?: Error } }).cause;
    expect(cause?.err).toBeInstanceOf(Error);
    expect(cause?.err?.message).toBe("connection reset by peer");
  });
});

describe("sendVerificationEmail when SMTP is not configured", () => {
  beforeEach(() => {
    vi.resetModules();
    envValues["SMTP_HOST"] = "";
    envValues["SMTP_USER"] = "";
    createTransportMock.mockClear();
    sendMailMock.mockClear();
  });

  afterEach(() => {
    envValues["SMTP_HOST"] = "smtp.example.com";
    envValues["SMTP_USER"] = "user@example.com";
  });

  it("throws EmailSignInError with a clear missing-config message", async () => {
    const email = await loadEmail();
    await expect(email.sendVerificationEmail(verificationParams)).rejects.toBeInstanceOf(
      email.EmailSignInError,
    );
    await expect(email.sendVerificationEmail(verificationParams)).rejects.toThrow(
      /SMTP not configured/,
    );
    // sendMail must never be called if there is no mailer.
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

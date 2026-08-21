import { beforeEach, describe, expect, it, vi } from "vitest";

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

const envValues = {
  NODE_ENV: "test" as const,
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

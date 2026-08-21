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

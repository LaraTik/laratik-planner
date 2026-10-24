import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  issuePasswordResetToken: vi.fn(),
  sendEmail: vi.fn(),
  enforceRateLimit: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  select: vi.fn(),
  logWarn: vi.fn(),
  tForActive: vi.fn(),
  tForResolved: vi.fn((locale: string) => (key: string) => `${locale}:${key}`),
}));

vi.mock("@/lib/auth/password", () => ({
  issuePasswordResetToken: mocks.issuePasswordResetToken,
}));
vi.mock("@/lib/email", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/observability/logger", () => ({ logWarn: mocks.logWarn }));
vi.mock("@/lib/i18n/t-for-active", () => ({ tForActive: mocks.tForActive }));
vi.mock("@/messages", () => ({ tForResolved: mocks.tForResolved }));
vi.mock("@/lib/validation/env", () => ({
  serverEnv: { AUTH_URL: "https://planner.example" },
  clientEnv: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
}));

const { requestPasswordResetAction } = await import("@/features/auth/server");

function formFor(email: string): FormData {
  const formData = new FormData();
  formData.set("email", email);
  return formData;
}

async function redirectedPath(email: string): Promise<string> {
  await expect(requestPasswordResetAction(formFor(email))).rejects.toThrow("NEXT_REDIRECT");
  return mocks.redirect.mock.calls[0]![0];
}

describe("password reset request action", () => {
  beforeEach(() => {
    mocks.issuePasswordResetToken.mockReset();
    mocks.issuePasswordResetToken.mockResolvedValue(null);
    mocks.sendEmail.mockReset();
    mocks.sendEmail.mockResolvedValue(null);
    mocks.enforceRateLimit.mockReset();
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true });
    mocks.headers.mockReset();
    mocks.headers.mockResolvedValue(
      new Headers({ "x-forwarded-for": "192.0.2.1", "x-request-id": "reset-test" }),
    );
    mocks.redirect.mockClear();
    mocks.select.mockReset();
    mocks.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [{ locale: "ar" }],
        }),
      }),
    });
    mocks.logWarn.mockReset();
    mocks.tForActive.mockReset();
    mocks.tForActive.mockResolvedValue({ code: "ar", t: (key: string) => key });
    mocks.tForResolved.mockClear();
  });

  it("uses one generic result for malformed and unknown addresses", async () => {
    const malformed = await redirectedPath("not-an-email");
    mocks.redirect.mockClear();
    const unknown = await redirectedPath("nobody@example.com");

    expect(malformed).toBe("/signin/forgot-password?sent=1");
    expect(unknown).toBe(malformed);
    expect(mocks.issuePasswordResetToken).toHaveBeenCalledWith("nobody@example.com");
  });

  it("keeps the generic result and logs no recipient details when delivery fails", async () => {
    mocks.issuePasswordResetToken.mockResolvedValue({
      raw: "one-time-reset-token",
      expiresAt: new Date("2026-11-01T00:00:00.000Z"),
    });
    mocks.sendEmail.mockRejectedValue(new Error("SMTP rejected person@example.com"));

    const path = await redirectedPath("person@example.com");

    expect(path).toBe("/signin/forgot-password?sent=1");
    expect(mocks.logWarn).toHaveBeenCalledWith("auth.password_reset.request_failed");
    expect(JSON.stringify(mocks.logWarn.mock.calls)).not.toContain("person@example.com");
    expect(JSON.stringify(mocks.logWarn.mock.calls)).not.toContain("SMTP rejected");
  });

  it("uses the recipient's saved locale for the email", async () => {
    mocks.issuePasswordResetToken.mockResolvedValue({
      raw: "one-time-reset-token",
      expiresAt: new Date("2026-11-01T00:00:00.000Z"),
    });
    mocks.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [{ locale: "en" }],
        }),
      }),
    });

    await redirectedPath("person@example.com");

    expect(mocks.tForResolved).toHaveBeenCalledWith("en");
  });

  it("falls back to the active interface locale when the profile locale is unset", async () => {
    mocks.issuePasswordResetToken.mockResolvedValue({
      raw: "one-time-reset-token",
      expiresAt: new Date("2026-11-01T00:00:00.000Z"),
    });
    mocks.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [{ locale: null }],
        }),
      }),
    });

    await redirectedPath("person@example.com");

    expect(mocks.tForResolved).toHaveBeenCalledWith("ar");
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "person@example.com",
        subject: "ar:emails.passwordReset.subject",
      }),
    );
  });

  it("keeps rate-limited requests indistinguishable", async () => {
    mocks.enforceRateLimit.mockResolvedValue({ allowed: false });

    const path = await redirectedPath("person@example.com");

    expect(path).toBe("/signin/forgot-password?sent=1");
    expect(mocks.issuePasswordResetToken).not.toHaveBeenCalled();
  });
});

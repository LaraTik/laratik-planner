import { beforeEach, describe, expect, it, vi } from "vitest";

const signInMock = vi.hoisted(() => vi.fn());
const enforceRateLimitMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((path: string): never => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
);
const signInErrorRedirectMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/config", () => ({ signIn: signInMock }));
vi.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimit: enforceRateLimitMock,
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "127.0.0.1" })),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/app/signin/auth-error-server", () => ({
  emailDomain: (email: string) => email.split("@")[1] ?? "(none)",
  signInErrorRedirect: signInErrorRedirectMock,
}));

const { signInWithMagicLinkAction, signInWithPasswordAction } =
  await import("@/app/signin/actions");

describe("sign-in actions", () => {
  beforeEach(() => {
    signInMock.mockReset();
    signInMock.mockResolvedValue(undefined);
    enforceRateLimitMock.mockReset();
    enforceRateLimitMock.mockResolvedValue({ allowed: true });
    redirectMock.mockClear();
    signInErrorRedirectMock.mockReset();
  });

  it("passes the remember choice and safe callback to credentials sign-in", async () => {
    const formData = new FormData();
    formData.set("email", "  Person@Agency.COM ");
    formData.set("password", "correct horse battery staple");
    formData.set("remember", "on");

    await signInWithPasswordAction("/app/workspaces", formData);

    expect(signInMock).toHaveBeenCalledWith("credentials", {
      email: "person@agency.com",
      password: "correct horse battery staple",
      remember: "on",
      redirectTo: "/app/workspaces",
    });
  });

  it("keeps magic-link validation errors on the selected method", async () => {
    const formData = new FormData();
    formData.set("email", "not-an-email");

    await expect(signInWithMagicLinkAction("/setup", formData)).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledTimes(1);
    const target = new URL(redirectMock.mock.calls[0]![0], "https://planner.example");
    expect(target.pathname).toBe("/signin");
    expect(target.searchParams.get("error")).toBe("InvalidEmail");
    expect(target.searchParams.get("callbackUrl")).toBe("/setup");
    expect(target.searchParams.get("method")).toBe("magic");
    expect(signInMock).not.toHaveBeenCalled();
  });
});

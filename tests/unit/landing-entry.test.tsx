import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const firstAgencyForBootstrapMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((path: string): never => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
);

vi.mock("@/lib/auth/config", () => ({ auth: authMock }));
vi.mock("@/lib/auth/policy", () => ({
  firstAgencyForBootstrap: firstAgencyForBootstrapMock,
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { default: HomePage } = await import("@/app/page");

describe("public entry page", () => {
  beforeEach(() => {
    authMock.mockReset();
    firstAgencyForBootstrapMock.mockReset();
    redirectMock.mockClear();
  });

  it("redirects an authenticated visitor directly to the app", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });

    await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT:/app");
    expect(redirectMock).toHaveBeenCalledWith("/app");
    expect(firstAgencyForBootstrapMock).not.toHaveBeenCalled();
  });

  it("offers one clear sign-in action when the deployment is configured", async () => {
    authMock.mockResolvedValue(null);
    firstAgencyForBootstrapMock.mockResolvedValue("agency-1");

    render(await HomePage());

    expect(screen.getByRole("link", { name: /sign in to studioflow/i })).toHaveAttribute(
      "href",
      "/signin",
    );
    expect(screen.queryByRole("link", { name: /setup/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /sign up|register/i })).not.toBeInTheDocument();
  });

  it("routes first-time setup through identity verification", async () => {
    authMock.mockResolvedValue(null);
    firstAgencyForBootstrapMock.mockResolvedValue(null);

    render(await HomePage());

    expect(screen.getByRole("link", { name: /set up studioflow/i })).toHaveAttribute(
      "href",
      "/signin?callbackUrl=%2Fsetup&method=magic",
    );
    expect(screen.queryByRole("link", { name: /^sign in$/i })).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const firstAgencyForBootstrapMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((path: string): never => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
);

// The landing page now resolves the active locale for
// `<html lang dir>` and the page copy. In production the
// resolver reads the session, the user row, and the public
// cookie. In the unit test there is no request scope, so
// we mock the resolver to return a fixed English
// descriptor without touching `next/headers` or the DB.
const tForActiveMock = vi.hoisted(() =>
  vi.fn(async () => ({
    t: (key: string) => {
      // English catalog is the source of truth for the
      // landing page in the existing tests. The catalog
      // is large; this thin shim only resolves the keys
      // the landing page actually reads. Adding a new
      // string to the landing page is a one-line change
      // to this map — the production English catalog is
      // the contract, the test stays cheap.
      const map: Record<string, string> = {
        "auth.productName": "StudioFlow",
        "auth.landing.tagline": "Social content operations, in one place",
        "auth.landing.headline": "Plan, review, and publish with clarity.",
        "auth.landing.subhead":
          "Keep every brand, creative handoff, approval, and publishing record in one focused workspace.",
        "auth.landing.entrySignIn": "Sign in to StudioFlow",
        "auth.landing.entrySetup": "Set up StudioFlow",
        "auth.landing.invitationNote": "Invitation-only access",
        "auth.landing.setupNote": "Administrator identity verification is required",
        "auth.landing.featureMonthlyTitle": "Monthly planning",
        "auth.landing.featureMonthlyText": "Lists, boards, and calendars stay aligned.",
        "auth.landing.featureWorkflowTitle": "Clear workflow",
        "auth.landing.featureWorkflowText": "Every idea always has a next action.",
        "auth.landing.featureReviewTitle": "Review together",
        "auth.landing.featureReviewText": "Internal and client feedback stays separated.",
        "auth.landing.featurePublishTitle": "Publish confidently",
        "auth.landing.featurePublishText": "Track every selected channel to completion.",
      };
      return map[key] ?? key;
    },
    code: "en",
    dir: "ltr" as const,
    source: "fallback" as const,
  })),
);

vi.mock("@/lib/auth/config", () => ({ auth: authMock }));
vi.mock("@/lib/auth/policy", () => ({
  firstAgencyForBootstrap: firstAgencyForBootstrapMock,
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/i18n/t-for-active", () => ({ tForActive: tForActiveMock }));

const { default: HomePage } = await import("@/app/page");

describe("public entry page", () => {
  beforeEach(() => {
    authMock.mockReset();
    firstAgencyForBootstrapMock.mockReset();
    redirectMock.mockClear();
    tForActiveMock.mockClear();
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

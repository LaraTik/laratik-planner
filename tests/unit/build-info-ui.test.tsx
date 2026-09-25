import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationInfoCard } from "@/components/build-info/application-info-card";
import { CopyBuildInfoSheetAction } from "@/components/build-info/copy-build-info";
import { createBuildInfo } from "@/lib/build-info";
import { tFor } from "@/messages";

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

const SHA = "a1b2c3d4e5f678901234567890abcdef12345678";
// 2026-09-25 round — `createBuildInfo` now takes an optional
// `builtAt` stamp. Default fixtures leave it null (local dev) so the
// existing assertions about the SHA + environment + copy text stay
// authoritative.
const buildInfo = createBuildInfo({ version: SHA, environment: "production" });
// Separate fixture with a build stamp so we can assert the new "Built
// at" row in `ApplicationInfoCard` + the new menu-row copy.
const BUILT_AT = "2026-09-25T09:42:11Z";
const stampedBuildInfo = createBuildInfo({
  version: SHA,
  builtAt: BUILT_AT,
  environment: "production",
  locale: "en-US",
  timeZone: "UTC",
});
const t = tFor("en");

describe("build information UI", () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("renders the full SHA and copies the agreed diagnostic line", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<ApplicationInfoCard buildInfo={buildInfo} t={t} />);

    expect(screen.getByTestId("application-build-sha")).toHaveTextContent(SHA);
    expect(screen.getByText("Production")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Copy build information" }));

    expect(writeText).toHaveBeenCalledWith(`StudioFlow build: ${SHA} | Environment: production`);
    expect(screen.getByRole("button", { name: "Build information copied" })).toBeVisible();
    expect(toastSuccess).toHaveBeenCalledWith("Build information copied", { duration: 1500 });
  });

  it("surfaces the build time in the account card when the stamp is known", () => {
    render(<ApplicationInfoCard buildInfo={stampedBuildInfo} t={t} />);

    expect(screen.getByTestId("application-build-sha")).toHaveTextContent(SHA);
    expect(screen.getByTestId("application-built-at")).toBeVisible();
    expect(screen.getByTestId("application-built-at").textContent ?? "").toMatch(/Sep.*2026/);
    expect(screen.queryByText("Local build")).not.toBeInTheDocument();
  });

  it("hides the build time row when no stamp is available", () => {
    render(<ApplicationInfoCard buildInfo={buildInfo} t={t} />);

    expect(screen.queryByTestId("application-built-at")).not.toBeInTheDocument();
  });

  it("renders the account card through the Arabic catalog when provided", () => {
    render(<ApplicationInfoCard buildInfo={buildInfo} t={tFor("ar")} />);

    expect(screen.getByText("معلومات التطبيق")).toBeVisible();
    expect(screen.getByText("استخدم هذه التفاصيل عند الإبلاغ عن مشكلة.")).toBeVisible();
    expect(screen.getByText("الإصدار")).toBeVisible();
    expect(screen.getByText("البيئة")).toBeVisible();
  });

  it("exposes the mobile build row as a full copy action", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<CopyBuildInfoSheetAction buildInfo={buildInfo} />);

    // The accessible name is the visible "Build a1b2c3d" label, not
    // a redundant "Copy build information" suffix (removed in the
    // round-3 audit; the old sr-only produced a doubled AT
    // announcement).
    const action = screen.getByRole("menuitem", { name: /build a1b2c3d/i });
    expect(action).toHaveTextContent("Build a1b2c3d");
    expect(action).toHaveTextContent("Production");

    await user.click(action);
    expect(writeText).toHaveBeenCalledWith(buildInfo.copyText);
  });

  it("renders the build time as the secondary row when stamped, with env as the third", () => {
    render(<CopyBuildInfoSheetAction buildInfo={stampedBuildInfo} />);

    const action = screen.getByRole("menuitem", { name: /build a1b2c3d/i });
    expect(action).toHaveTextContent("Build a1b2c3d");
    // Localised stamp + UTC: Sep 25, 2026, 09:42 (UTC) — the exact
    // phrasing depends on Node's Intl, so we just assert the date is
    // somewhere in the row + the environment is preserved.
    expect(action.textContent ?? "").toMatch(/2026/);
    expect(action).toHaveTextContent("Production");
  });

  it("keeps the action retryable when clipboard access fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
      new Error("permission denied"),
    );
    render(<ApplicationInfoCard buildInfo={buildInfo} t={t} />);

    await user.click(screen.getByRole("button", { name: "Copy build information" }));

    expect(toastError).toHaveBeenCalledWith("Could not copy build information", {
      description: "permission denied",
    });
    expect(screen.getByRole("button", { name: "Copy build information" })).toBeVisible();
  });
});

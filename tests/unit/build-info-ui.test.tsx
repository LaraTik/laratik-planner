import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationInfoCard } from "@/components/build-info/application-info-card";
import { CopyBuildInfoSheetAction } from "@/components/build-info/copy-build-info";
import { createBuildInfo } from "@/lib/build-info";

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

const SHA = "a1b2c3d4e5f678901234567890abcdef12345678";
const buildInfo = createBuildInfo({ version: SHA, environment: "production" });

describe("build information UI", () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("renders the full SHA and copies the agreed diagnostic line", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<ApplicationInfoCard buildInfo={buildInfo} />);

    expect(screen.getByTestId("application-build-sha")).toHaveTextContent(SHA);
    expect(screen.getByText("Production")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Copy build information" }));

    expect(writeText).toHaveBeenCalledWith(`StudioFlow build: ${SHA} | Environment: production`);
    expect(screen.getByRole("button", { name: "Build information copied" })).toBeVisible();
    expect(toastSuccess).toHaveBeenCalledWith("Build information copied", { duration: 1500 });
  });

  it("exposes the mobile build row as a full copy action", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<CopyBuildInfoSheetAction buildInfo={buildInfo} />);

    const action = screen.getByRole("menuitem", { name: /copy build information/i });
    expect(action).toHaveTextContent("Build a1b2c3d");
    expect(action).toHaveTextContent("Production");

    await user.click(action);
    expect(writeText).toHaveBeenCalledWith(buildInfo.copyText);
  });

  it("keeps the action retryable when clipboard access fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
      new Error("permission denied"),
    );
    render(<ApplicationInfoCard buildInfo={buildInfo} />);

    await user.click(screen.getByRole("button", { name: "Copy build information" }));

    expect(toastError).toHaveBeenCalledWith("Could not copy build information", {
      description: "permission denied",
    });
    expect(screen.getByRole("button", { name: "Copy build information" })).toBeVisible();
  });
});

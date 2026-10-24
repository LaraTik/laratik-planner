import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandCenterRefresh } from "@/components/workspace/command-center-refresh";

const refresh = vi.fn();
const refreshAction = vi.fn(async (slug: string) => ({
  success: true,
  synced: slug === "studio" ? 1 : 0,
  failed: 0,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("CommandCenterRefresh", () => {
  it("runs the manager-only refresh action and reports a partial result", async () => {
    const user = userEvent.setup();
    refreshAction.mockResolvedValueOnce({ success: false, synced: 1, failed: 1 });

    render(
      <CommandCenterRefresh
        slug="studio"
        refreshAction={refreshAction}
        labels={{
          refresh: "Refresh data",
          refreshing: "Refreshing…",
          success: "Updated {synced} connected account(s)",
          partial: "Updated {synced}; {failed} account(s) need attention",
          error: "Refresh could not be completed",
        }}
      />,
    );

    await user.click(screen.getByTestId("command-center-refresh"));

    expect(refreshAction).toHaveBeenCalledWith("studio");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Updated 1; 1 account(s) need attention",
    );
    expect(refresh).toHaveBeenCalled();
  });
});

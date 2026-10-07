import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandCenterRefresh } from "@/components/workspace/command-center-refresh";
import { refreshWorkspaceSocialDataAction } from "@/app/(app)/app/a/[agencySlug]/w/[slug]/channels/actions";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/app/(app)/app/a/[agencySlug]/w/[slug]/channels/actions", () => ({
  refreshWorkspaceSocialDataAction: vi.fn(async () => ({ success: true, synced: 1, failed: 0 })),
}));

describe("CommandCenterRefresh", () => {
  it("runs the manager-only refresh action and reports a partial result", async () => {
    const user = userEvent.setup();
    const action = vi.mocked(refreshWorkspaceSocialDataAction);
    action.mockResolvedValueOnce({ success: false, synced: 1, failed: 1 });

    render(
      <CommandCenterRefresh
        slug="studio"
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

    expect(action).toHaveBeenCalledWith("studio");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Updated 1; 1 account(s) need attention",
    );
    expect(refresh).toHaveBeenCalled();
  });
});

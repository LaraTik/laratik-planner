import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommentSyncButton } from "@/components/community/comment-sync-button";
import { PrivateMessageSyncButton } from "@/components/community/private-message-sync-button";

const mocks = vi.hoisted(() => ({ comments: vi.fn(), privateMessages: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/community/comment-sync-actions", () => ({
  syncCommunityCommentsAction: mocks.comments,
  syncCommunityPrivateMessagesAction: mocks.privateMessages,
}));

const props = {
  agencySlug: "agency",
  workspaceSlug: "workspace",
  canManage: true,
  label: "Sync",
  pendingLabel: "Syncing",
  successLabel: "Completed",
  failureLabel: "Failed",
  partialLabel: "Completed with errors",
  unavailableLabel: "Validate read permissions first",
};

describe.each([
  ["comments", CommentSyncButton, mocks.comments],
  ["private messages", PrivateMessageSyncButton, mocks.privateMessages],
] as const)("Community %s sync", (_name, Component, action) => {
  beforeEach(() => {
    vi.clearAllMocks();
    action.mockResolvedValue({ ok: true, readChannels: 1, insertedMessages: 0, failures: [] });
  });
  it("explains and blocks sync without a validated read capability", () => {
    render(<Component {...props} available={false} />);
    expect(screen.getByRole("button", { name: "Sync" })).toBeDisabled();
    expect(screen.getByText(props.unavailableLabel)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));
    expect(action).not.toHaveBeenCalled();
  });
  it("preserves the manager role gate even with an available capability", () => {
    render(<Component {...props} canManage={false} available />);
    expect(screen.getByRole("button", { name: "Sync" })).toBeDisabled();
  });
  it("does not present a partial provider result as full success", async () => {
    action.mockResolvedValue({
      ok: true,
      readChannels: 1,
      insertedMessages: 0,
      failures: ["permission_denied"],
    });
    render(<Component {...props} available />);
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));
    await waitFor(() => expect(screen.getByText(props.partialLabel)).toBeInTheDocument());
    expect(screen.queryByText(props.successLabel)).not.toBeInTheDocument();
  });
  it("runs the authorized sync and refreshes the current read model", async () => {
    render(<Component {...props} available />);
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("agency", "workspace"));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  });
});

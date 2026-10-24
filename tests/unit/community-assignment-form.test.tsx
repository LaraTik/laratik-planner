import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommunityAssignmentForm } from "@/components/community/community-assignment-form";
import { assignCommunityConversationAction } from "@/lib/community/assignment-actions";

vi.mock("@/lib/community/assignment-actions", () => ({
  assignCommunityConversationAction: vi.fn(),
}));

const mockedAssign = vi.mocked(assignCommunityConversationAction);

function renderForm(canAssign = true) {
  return render(
    <CommunityAssignmentForm
      agencySlug="agency"
      workspaceSlug="workspace"
      conversationId="conversation-1"
      assignedTo="member-1"
      assignees={[
        { id: "member-1", name: "Mira" },
        { id: "member-2", name: "Sam" },
      ]}
      canAssign={canAssign}
      label="Owner"
      unassignedLabel="Unassigned"
      saveLabel="Save assignment"
      savingLabel="Saving assignment"
      savedLabel="Assignment saved"
      failedLabel="Assignment failed"
    />,
  );
}

describe("CommunityAssignmentForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves the selected workspace member and announces success", async () => {
    mockedAssign.mockResolvedValue({ ok: true });
    renderForm();

    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "member-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save assignment" }));

    await waitFor(() =>
      expect(mockedAssign).toHaveBeenCalledWith(
        "agency",
        "workspace",
        "conversation-1",
        "member-2",
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Assignment saved");
  });

  it("does not expose assignment controls without routing permission", () => {
    renderForm(false);

    expect(screen.getByLabelText("Owner")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save assignment" })).not.toBeInTheDocument();
  });
});

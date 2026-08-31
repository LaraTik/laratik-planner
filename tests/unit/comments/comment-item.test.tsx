import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// CommentItem imports a server action; the test never invokes it, so a
// no-op stub keeps the module graph small and avoids pulling next-auth
// (which has a known Vitest/Node ESM issue) into the test bundle.
vi.mock("@/app/(app)/app/w/[slug]/planning/actions", () => ({
  resolveCommentAction: vi.fn(),
}));

import { CommentItem, type CommentRecord } from "@/components/comments/comment-item";

const baseComment: CommentRecord = {
  id: "c-1",
  parentCommentId: null,
  authorId: "u-1",
  authorDisplayName: "Ada Lovelace",
  authorName: "ada",
  authorImage: null,
  visibility: "client",
  label: "general",
  body: "Looks good to me — ship it.",
  resolvedAt: null,
  resolvedBy: null,
  createdAt: "2026-08-21T10:00:00.000Z",
  editedAt: null,
  mentionedUserIds: [],
  currentUserMentioned: false,
};

const baseRoles = {
  isManager: false,
  isPlanner: false,
  isDesigner: false,
  isInternalReviewer: false,
  isClientReviewer: false,
  isPublisher: false,
};

function renderItem(overrides: Partial<CommentRecord> = {}, onReply = vi.fn()) {
  return render(
    <CommentItem
      comment={{ ...baseComment, ...overrides }}
      workspaceSlug="acme"
      currentUserId="u-2"
      roles={baseRoles}
      onReply={onReply}
    />,
  );
}

describe("CommentItem", () => {
  it("renders author display name and body", () => {
    renderItem();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText(/Looks good to me/)).toBeInTheDocument();
  });

  it("renders the author initial inside a round avatar", () => {
    renderItem({ authorDisplayName: "Grace Hopper" });
    const avatar = screen.getByText("G");
    expect(avatar.className).toContain("rounded-full");
  });

  it("formats createdAt into a localized <time> with the right datetime", () => {
    renderItem();
    const time = screen.getByText(/2026/);
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("datetime", "2026-08-21T10:00:00.000Z");
  });

  it("shows the Internal pill when visibility is internal", () => {
    renderItem({ visibility: "internal" });
    expect(screen.getByText("Internal")).toBeInTheDocument();
  });

  it("shows the Client pill when visibility is client", () => {
    renderItem({ visibility: "client" });
    expect(screen.getByText("Client")).toBeInTheDocument();
  });

  it("hides the label pill when label is 'general'", () => {
    renderItem({ label: "general" });
    expect(screen.queryByText("general")).toBeNull();
  });

  it("shows the label pill when label is non-general", () => {
    renderItem({ label: "question" });
    expect(screen.getByText("question")).toBeInTheDocument();
  });

  it("shows the resolved badge when resolvedAt is set", () => {
    renderItem({ resolvedAt: "2026-08-21T11:00:00.000Z", resolvedBy: "u-1" });
    expect(screen.getByText(/resolved/i)).toBeInTheDocument();
  });

  it("hides the resolved badge when resolvedAt is null", () => {
    renderItem({ resolvedAt: null });
    expect(screen.queryByText(/resolved/i)).toBeNull();
  });

  it("hides the Reply button visually (the action row keeps Reply)", () => {
    // The Reply control is always present so the user can start a
    // thread on any open comment.
    const onReply = vi.fn();
    renderItem({}, onReply);
    expect(screen.getByRole("button", { name: /reply/i })).toBeInTheDocument();
  });

  it("calls onReply when the Reply button is clicked", async () => {
    const onReply = vi.fn();
    renderItem({}, onReply);
    await userEvent.click(screen.getByRole("button", { name: /reply/i }));
    expect(onReply).toHaveBeenCalledTimes(1);
  });

  it("shows the Resolve button for the author", () => {
    renderItem({}, vi.fn());
    // currentUserId is "u-2", comment authorId is "u-1" => not author
    expect(screen.queryByRole("button", { name: /resolve/i })).toBeNull();
    // re-render with currentUserId matching
    render(
      <CommentItem
        comment={baseComment}
        workspaceSlug="acme"
        currentUserId="u-1"
        roles={baseRoles}
        onReply={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("button", { name: /resolve/i }).length).toBeGreaterThan(0);
  });

  it("shows the Resolve button for a manager even when not the author", () => {
    render(
      <CommentItem
        comment={baseComment}
        workspaceSlug="acme"
        currentUserId="u-2"
        roles={{ ...baseRoles, isManager: true }}
        onReply={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /resolve/i })).toBeInTheDocument();
  });

  it("shows the Unresolve button when the comment is already resolved", () => {
    render(
      <CommentItem
        comment={{ ...baseComment, resolvedAt: "2026-08-21T11:00:00.000Z" }}
        workspaceSlug="acme"
        currentUserId="u-1"
        roles={baseRoles}
        onReply={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /unresolve/i })).toBeInTheDocument();
  });

  it("hides the resolve button when the user is neither author nor manager/planner", () => {
    render(
      <CommentItem
        comment={baseComment}
        workspaceSlug="acme"
        currentUserId="u-2"
        roles={{ ...baseRoles, isManager: false, isPlanner: false }}
        onReply={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /resolve/i })).toBeNull();
  });

  it("shows the mention count when mentionedUserIds has any entry", () => {
    renderItem({ mentionedUserIds: ["u-3", "u-4"] });
    expect(screen.getByText("2 mentions")).toBeInTheDocument();
  });

  it("uses singular 'mention' when exactly one user is mentioned", () => {
    renderItem({ mentionedUserIds: ["u-3"] });
    expect(screen.getByText("1 mention")).toBeInTheDocument();
  });

  it("hides the mention count when mentionedUserIds is empty", () => {
    renderItem({ mentionedUserIds: [] });
    expect(screen.queryByText(/mention/i)).toBeNull();
  });

  it("highlights the card when currentUserMentioned is true", () => {
    const { container } = renderItem({ currentUserMentioned: true });
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("border-primary");
  });

  it("applies reduced opacity when resolved", () => {
    const { container } = renderItem({ resolvedAt: "2026-08-21T11:00:00.000Z" });
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("opacity-60");
  });

  it("applies the reply indent when isReply is true", () => {
    const { container } = renderItem({}, vi.fn());
    const card = container.firstChild as HTMLElement;
    expect(card.className).not.toContain("sm:ms-6");
    // re-render with isReply
    const { container: c2 } = render(
      <CommentItem
        comment={baseComment}
        workspaceSlug="acme"
        currentUserId="u-2"
        roles={baseRoles}
        onReply={vi.fn()}
        isReply
      />,
    );
    expect((c2.firstChild as HTMLElement).className).toContain("sm:ms-6");
  });
});

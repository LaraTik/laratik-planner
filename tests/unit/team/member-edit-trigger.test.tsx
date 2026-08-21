import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Stub the shared drawer so the trigger test stays focused on the
// trigger itself (the drawer is owned by the Users page in scope and
// has its own test). The stub mirrors the public prop shape the
// trigger uses.
vi.mock("@/app/(app)/app/users/member-edit-drawer", () => ({
  MemberEditDrawer: (props: { subject: unknown }) => (
    <div data-testid="stub-member-edit-drawer" data-subject={props.subject ? "set" : "null"} />
  ),
}));

import { MemberEditTrigger } from "@/app/(app)/app/w/[slug]/team/member-edit-trigger";

describe("MemberEditTrigger", () => {
  const member = {
    id: "user-1",
    name: "Alex Rivera",
    email: "alex@acme.test",
    isAgencyAdmin: false,
  };
  const workspaces = [
    { id: "ws-1", name: "Acme", currentRole: "content_planner" },
    { id: "ws-2", name: "Beta", currentRole: "" },
  ];

  it("renders a ghost Edit button with a per-member testid and aria-label", () => {
    render(
      <MemberEditTrigger
        member={member}
        actorId="actor-1"
        actorIsAgencyAdmin
        workspaces={workspaces}
      />,
    );
    const btn = screen.getByTestId("team-member-edit-user-1");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-label", "Edit Alex Rivera");
    expect(btn).toHaveTextContent(/edit/i);
  });

  it("passes an empty subject to the drawer by default (drawer closed)", () => {
    render(
      <MemberEditTrigger
        member={member}
        actorId="actor-1"
        actorIsAgencyAdmin
        workspaces={workspaces}
      />,
    );
    const drawer = screen.getByTestId("stub-member-edit-drawer");
    expect(drawer).toHaveAttribute("data-subject", "null");
  });
});

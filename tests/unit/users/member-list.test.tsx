import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemberList } from "@/app/(app)/app/users/member-list";
import { toggleDeactivationAction } from "@/app/(app)/app/users/actions";

vi.mock("@/components/i18n/locale-provider", () => ({
  useLocaleT: () => (key: string, params?: Record<string, string | number>) => {
    if (key === "users.memberList.joined") return `Joined ${params?.date}`;
    if (key === "users.memberList.editAria") return `Edit ${params?.name}`;
    if (key === "users.memberList.deactivateAria") return `Deactivate ${params?.name}`;
    if (key === "users.memberList.reactivateAria") return `Reactivate ${params?.name}`;
    if (key === "users.memberList.reactivateFailed") return "Could not reactivate member";
    return key;
  },
}));

vi.mock("@/app/(app)/app/users/actions", () => ({
  toggleDeactivationAction: vi.fn(async () => ({ error: null })),
}));

const t = (key: string, params?: Record<string, string | number>) => {
  if (key === "users.memberList.joined") return `Joined ${params?.date}`;
  if (key === "users.memberList.editAria") return `Edit ${params?.name}`;
  if (key === "users.memberList.deactivateAria") return `Deactivate ${params?.name}`;
  if (key === "users.memberList.reactivateAria") return `Reactivate ${params?.name}`;
  if (key === "users.memberList.reactivateFailed") return "Could not reactivate member";
  return key;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MemberList — round-3 UI/UX", () => {
  const workspaces = [
    { id: "w1", name: "Brand Studio" },
    { id: "w2", name: "Social Team" },
    { id: "w3", name: "Planning" },
    { id: "w4", name: "Eng" },
  ];

  it("renders per-workspace role chips capped at 3 + overflow", () => {
    render(
      <MemberList
        actorId="actor"
        actorIsAgencyAdmin={true}
        workspaces={workspaces}
        rolesByUser={{
          u1: {
            w1: ["viewer"],
            w2: ["editor"],
            w3: ["reviewer"],
            w4: ["admin"],
          },
        }}
        members={[
          {
            id: "u1",
            name: "Ada",
            email: "ada@example.com",
            isAgencyAdmin: false,
            status: "active",
            role: "viewer",
            joinedAt: "2026-01-01",
          },
        ]}
        t={t}
      />,
    );

    const row = screen.getByTestId("users-member-row-u1");
    const chipList = within(row).getByTestId("users-member-roles-u1");
    // Every direct child of the role list must remain a list item,
    // including the overflow badge, so assistive technology gets a
    // valid list structure when a member has more than three workspaces.
    expect(within(chipList).getAllByRole("listitem")).toHaveLength(4);
    expect(chipList.textContent ?? "").toMatch(/\+1$/);
  });

  it("applies the responsive `flex-col sm:flex-row` layout to each row", () => {
    render(
      <MemberList
        actorId="actor"
        actorIsAgencyAdmin={true}
        workspaces={[]}
        rolesByUser={{}}
        members={[
          {
            id: "u1",
            name: "Ada",
            email: "ada@example.com",
            isAgencyAdmin: false,
            status: "active",
            role: "viewer",
            joinedAt: "2026-01-01",
          },
        ]}
        t={t}
      />,
    );

    const row = screen.getByTestId("users-member-row-u1");
    expect(row.className).toMatch(/flex-col/);
    expect(row.className).toMatch(/sm:flex-row/);
  });

  it("exposes Edit + Deactivate buttons with descriptive aria-labels", () => {
    render(
      <MemberList
        actorId="actor"
        actorIsAgencyAdmin={true}
        workspaces={[{ id: "w1", name: "WS" }]}
        rolesByUser={{ u1: { w1: ["editor"] } }}
        members={[
          {
            id: "u1",
            name: "Ada",
            email: "ada@example.com",
            isAgencyAdmin: false,
            status: "active",
            role: "editor",
            joinedAt: "2026-01-01",
          },
        ]}
        t={t}
      />,
    );

    expect(screen.getByLabelText("Edit Ada")).toBeInTheDocument();
    expect(screen.getByLabelText("Deactivate Ada")).toBeInTheDocument();
  });

  it("uses Reactivate aria-label for deactivated members", () => {
    render(
      <MemberList
        actorId="actor"
        actorIsAgencyAdmin={true}
        workspaces={[{ id: "w1", name: "WS" }]}
        rolesByUser={{}}
        members={[
          {
            id: "u1",
            name: "Ada",
            email: "ada@example.com",
            isAgencyAdmin: false,
            status: "deactivated",
            role: "editor",
            joinedAt: "2026-01-01",
          },
        ]}
        t={t}
      />,
    );

    expect(screen.getByLabelText("Reactivate Ada")).toBeInTheDocument();
  });

  it("shows the empty state when there are no members", () => {
    render(
      <MemberList
        actorId="actor"
        actorIsAgencyAdmin={true}
        workspaces={[]}
        rolesByUser={{}}
        members={[]}
        t={t}
      />,
    );
    expect(screen.getByTestId("users-empty-state")).toBeInTheDocument();
  });

  it("shows localized inline feedback when reactivation fails", async () => {
    vi.mocked(toggleDeactivationAction).mockResolvedValueOnce({ errorCode: "reactivate_failed" });
    render(
      <MemberList
        actorId="actor"
        actorIsAgencyAdmin={true}
        workspaces={[]}
        rolesByUser={{}}
        members={[
          {
            id: "u1",
            name: "Ada",
            email: "ada@example.com",
            isAgencyAdmin: false,
            status: "deactivated",
            role: "editor",
            joinedAt: "2026-01-01",
          },
        ]}
        t={t}
      />,
    );

    fireEvent.click(screen.getByLabelText("Reactivate Ada"));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Could not reactivate member"),
    );
  });
});

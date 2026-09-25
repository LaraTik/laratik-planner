import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemberList } from "@/app/(app)/app/users/member-list";

vi.mock("@/components/i18n/locale-provider", () => ({
  useLocaleT: () => (key: string, params?: Record<string, string | number>) => {
    if (key === "users.memberList.joined") return `Joined ${params?.date}`;
    if (key === "users.memberList.editAria") return `Edit ${params?.name}`;
    if (key === "users.memberList.deactivateAria") return `Deactivate ${params?.name}`;
    if (key === "users.memberList.reactivateAria") return `Reactivate ${params?.name}`;
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
    // The chip container holds up to 3 role chips (each wrapped in
    // a `contents` `<li>`) plus an optional `+N` overflow Badge
    // rendered as a direct child of the `<ul>`. We assert on the
    // total rendered text so the test is robust against the wrapper
    // choice (the production renderer uses Badge primitives whose
    // final DOM node is a single `<span>`).
    expect(chipList.textContent ?? "").toMatch(/\+1$/);
  });

  it("applies the responsive `flex-col sm:flex-row` layout to each row", () => {
    render(
      <MemberList
        actorId="actor"
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
    render(<MemberList actorId="actor" workspaces={[]} rolesByUser={{}} members={[]} t={t} />);
    expect(screen.getByTestId("users-empty-state")).toBeInTheDocument();
  });
});

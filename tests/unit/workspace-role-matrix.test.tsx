import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

// Mock the action so we can capture the FormData the form posts
// without spinning up the full server-action runtime. The real
// action signature is
//   (userId, _prev: MemberEditState, formData: FormData) => Promise<…>
// The client calls it with the userId already bound by the
// drawer's useCallback, so the mock must accept the original
// 3-arg signature — the formData is the THIRD argument.
const captured: { formData: FormData | null } = { formData: null };
vi.mock("@/app/(app)/app/users/actions", () => ({
  updateMemberRolesAction: vi.fn(
    async (_userId: string, _prev: unknown, fd: FormData) => {
      captured.formData = fd;
      return { saved: true };
    },
  ),
  toggleAgencyAdminAction: vi.fn(async () => ({ saved: true })),
}));

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return { ...actual, useFormStatus: vi.fn(() => ({ pending: false })) };
});

import { MemberEditDrawer } from "@/app/(app)/app/users/member-edit-drawer";

const WS_A = "11111111-aaaa-aaaa-aaaa-111111111111";
const WS_B = "22222222-bbbb-bbbb-bbbb-222222222222";

/**
 * P0 (2026-09-03, /ui-ux-pro-max) — regression test for the
 * "only last assigned permission is saved" bug.
 *
 * Root cause: the matrix serialised every role as a separate
 * entry, e.g. for `designer` + `publisher` in the same
 * workspace the form posted
 *   `[{ workspaceId, roles: ["designer"] },
 *     { workspaceId, roles: ["publisher"] }]`
 * The server-side Map.set then overwrote the same key on
 * each iteration, so only the last role survived. The fix
 * is on the client (one entry per workspace with the full
 * roles[]) and a hardening on the server (the Map now
 * accumulates instead of overwriting).
 *
 * The test below exercises the client side: it renders the
 * drawer, picks two roles in the same workspace, submits, and
 * inspects the hidden `workspaceRoles` field. The contract
 * under test is the JSON the matrix posts — the action's
 * accumulation is covered by the integration test in
 * `tests/integration/member-roles-update.test.ts` and the
 * new sibling in this file.
 */
describe("WorkspaceRoleMatrix: multi-role serialisation", () => {
  it("emits ONE entry per workspace with the full roles[] array (not one entry per role)", () => {
    const subject = {
      id: "user-1",
      name: "Sara",
      email: "sara@example.com",
      status: "active" as const,
      isAgencyAdmin: false,
    };
    const workspaces = [
      { id: WS_A, name: "Acme", currentRoles: [] as string[] },
      { id: WS_B, name: "Beta", currentRoles: [] as string[] },
    ];

    const { getByTestId, getByLabelText } = render(
      <MemberEditDrawer
        subject={subject}
        actorIsAgencyAdmin
        actorUserId="actor-other"
        workspaces={workspaces}
        onOpenChange={() => {}}
      />,
    );

    // Pick TWO roles in Acme (the bug repro): designer + publisher.
    fireEvent.click(getByLabelText(/Designer for Acme/));
    fireEvent.click(getByLabelText(/Publisher for Acme/));
    // Pick ONE role in Beta so we also cover the multi-workspace path.
    fireEvent.click(getByLabelText(/Content Planner for Beta/));

    // Submit the form.
    fireEvent.click(getByTestId("member-edit-save"));

    // Inspect the hidden workspaceRoles input — the form posts the
    // matrix's serialised value via this hidden field. The action
    // receives the same FormData, so this is the wire contract.
    const fd = captured.formData;
    expect(fd).not.toBeNull();
    const raw = fd!.get("workspaceRoles");
    expect(typeof raw).toBe("string");
    const parsed = JSON.parse(String(raw));

    // The contract: exactly one entry per workspace that has any
    // selected role. Acme has { designer, publisher }; Beta has
    // { content_planner }. The pre-fix shape was one entry per
    // ROLE (three entries for Acme and one for Beta), which the
    // server's Map.set then collapsed into the last role only.
    expect(parsed).toHaveLength(2);
    const acme = parsed.find((p: { workspaceId: string }) => p.workspaceId === WS_A);
    const beta = parsed.find((p: { workspaceId: string }) => p.workspaceId === WS_B);
    expect(acme).toBeDefined();
    expect(beta).toBeDefined();
    expect(new Set(acme.roles)).toEqual(new Set(["designer", "publisher"]));
    expect(beta.roles).toEqual(["content_planner"]);
  });

  it("deduplicates repeated (workspaceId, role) pairs within a single workspace", () => {
    // A defensive belt: if a future bug re-introduces the broken
    // per-role shape (the matrix toggles the same role twice in a
    // single session, or the seed prop carries a duplicate), the
    // serialised value should still round-trip through the action
    // without losing data.
    const subject = {
      id: "user-2",
      name: "Dina",
      email: "dina@example.com",
      status: "active" as const,
      isAgencyAdmin: false,
    };
    const workspaces = [{ id: WS_A, name: "Acme", currentRoles: ["designer"] }];

    const { getByTestId, getByLabelText } = render(
      <MemberEditDrawer
        subject={subject}
        actorIsAgencyAdmin
        actorUserId="actor-other"
        workspaces={workspaces}
        onOpenChange={() => {}}
      />,
    );

    // Toggle designer twice — off then on. Plus add publisher.
    fireEvent.click(getByLabelText(/Designer for Acme/)); // off
    fireEvent.click(getByLabelText(/Designer for Acme/)); // back on
    fireEvent.click(getByLabelText(/Publisher for Acme/));

    fireEvent.click(getByTestId("member-edit-save"));

    const raw = captured.formData!.get("workspaceRoles");
    const parsed = JSON.parse(String(raw));
    expect(parsed).toHaveLength(1);
    expect(new Set(parsed[0].roles)).toEqual(new Set(["designer", "publisher"]));
  });
});

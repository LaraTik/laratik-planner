import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

// Mock every server action used by the components under test so the
// guard stays pure structural (no Next.js server runtime needed).
vi.mock("@/app/(app)/app/users/actions", () => ({
  sendInviteAction: vi.fn(),
  resendInviteAction: vi.fn(),
  revokeInviteAction: vi.fn(),
  toggleDeactivationAction: vi.fn(),
  toggleAgencyAdminAction: vi.fn(),
  updateMemberRolesAction: vi.fn(),
}));

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return { ...actual, useFormStatus: vi.fn(() => ({ pending: false })) };
});

import { MemberList } from "@/app/(app)/app/users/member-list";
import { SendInviteForm } from "@/app/(app)/app/users/send-invite-form";
import { InvitationList } from "@/app/(app)/app/users/invitation-list";
import { MemberEditTrigger } from "@/app/(app)/app/w/[slug]/team/member-edit-trigger";

/**
 * Structural guard for the client components used on /app/users (and
 * its sibling /app/w/[slug]/team). Each component declares its hooks
 * at the top of the function body. If a future refactor moves a hook
 * below an early `return` (or behind a conditional), React's hook
 * validator fires error #441 — "Rendered more hooks than during the
 * previous render".
 *
 * The guard renders the SAME component instance with two prop states
 * that would have triggered different early-return paths. If React's
 * validator fires (either via console.error or by throwing on
 * rerender), the test fails. This catches the actual production
 * failure mode: same component, props change, hook count drifts.
 *
 * Mirrors tests/unit/planning-hooks-order.test.tsx (added in
 * 1ca15b3 fix(planning): structural hooks-order guard (resolves
 * React #441)). The same family of components — and the same
 * family of errors — is now covered for /app/users.
 */

const HOOKS_ORDER_PATTERNS = [
  /Rendered (?:more|fewer) hooks than during the previous render/i,
  /change in the order of Hooks called by/i,
  /cannot have a different number of hooks/i,
];

function captureConsoleError() {
  const messages: string[] = [];
  const original = console.error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  console.error = (...args: any[]) => {
    messages.push(args.map(String).join(" "));
  };
  return {
    messages,
    restore: () => {
      console.error = original;
    },
    assertNoHooksOrderError: () => {
      const offenders = messages.filter((m) => HOOKS_ORDER_PATTERNS.some((re) => re.test(m)));
      expect(offenders, offenders.join("\n")).toEqual([]);
    },
  };
}

function runWithoutThrowing(fn: () => void): unknown {
  try {
    fn();
    return null;
  } catch (e) {
    return e;
  }
}

const baseMember = {
  id: "user-1",
  name: "Alex Rivera",
  email: "alex@acme.test",
  isAgencyAdmin: false,
  status: "active",
  role: "designer",
  joinedAt: "2026-08-24",
};

const baseWorkspaces = [
  { id: "ws-1", name: "Acme" },
  { id: "ws-2", name: "Beta" },
];

const baseInvitations = [
  {
    id: "inv-1",
    email: "pending@acme.test",
    expiresAt: "2026-09-01",
    grantsAgencyAdmin: false,
    workspaceGrants: [],
  },
];

describe("/app/users components — hooks order guard", () => {
  it("MemberList: same instance, empty/populated members keeps hook count stable", () => {
    // The empty-members branch early-returns <p>No members yet.</p>; the
    // populated branch renders the <ul> + MemberEditDrawer. Hooks
    // (useTransition, useState, useState) are at the top of the
    // function body so the count must stay at 3 across both renders.
    const cap = captureConsoleError();
    try {
      const { rerender } = render(
        <MemberList actorId="actor-1" workspaces={baseWorkspaces} rolesByUser={{}} members={[]} />,
      );
      const err = runWithoutThrowing(() =>
        rerender(
          <MemberList
            actorId="actor-1"
            workspaces={baseWorkspaces}
            rolesByUser={{ "user-1": { "ws-1": ["designer"] } }}
            members={[baseMember]}
          />,
        ),
      );
      cap.assertNoHooksOrderError();
      expect(err, err ? String(err) : "rerender threw").toBeNull();
    } finally {
      cap.restore();
    }
  });

  it("MemberList: same instance, member-set grows (1 -> 2) keeps hook count stable", () => {
    // Going from 1 member to 2 members exercises the list renderer's
    // .map() call — the parent still calls exactly 3 hooks and the
    // drawer (0 hooks) is still mounted the whole time.
    const cap = captureConsoleError();
    try {
      const { rerender } = render(
        <MemberList
          actorId="actor-1"
          workspaces={baseWorkspaces}
          rolesByUser={{ "user-1": { "ws-1": ["designer"] } }}
          members={[baseMember]}
        />,
      );
      const member2 = {
        ...baseMember,
        id: "user-2",
        name: "Bea Khan",
        email: "bea@acme.test",
        status: "deactivated",
      };
      const err = runWithoutThrowing(() =>
        rerender(
          <MemberList
            actorId="actor-1"
            workspaces={baseWorkspaces}
            rolesByUser={{ "user-1": { "ws-1": ["designer"] } }}
            members={[baseMember, member2]}
          />,
        ),
      );
      cap.assertNoHooksOrderError();
      expect(err, err ? String(err) : "rerender threw").toBeNull();
    } finally {
      cap.restore();
    }
  });

  it("MemberList: edit drawer open/close cycle keeps hook count stable", () => {
    // Clicking Edit flips the internal `editing` state from null to a
    // MemberRow — that mounts MemberEditForm (7 hooks) keyed by
    // subject.id. Clicking Cancel unmounts it. The PARENT (MemberList)
    // must keep calling its 3 hooks on every render; the form is a
    // child component with its own hook count.
    const cap = captureConsoleError();
    try {
      const { getByTestId, rerender } = render(
        <MemberList
          actorId="actor-other" // not the same as baseMember.id so the
          // admin toggle is in scope for the production code path
          workspaces={baseWorkspaces}
          rolesByUser={{ "user-1": { "ws-1": ["designer"] } }}
          members={[baseMember]}
        />,
      );
      // Open the drawer (mounts MemberEditForm, 7 hooks).
      fireEvent.click(getByTestId("users-member-edit-user-1"));
      // Re-render with a second member to make sure the parent still
      // calls its 3 hooks while the drawer is open.
      const member2 = { ...baseMember, id: "user-2", name: "Bea Khan", status: "deactivated" };
      const err = runWithoutThrowing(() =>
        rerender(
          <MemberList
            actorId="actor-other"
            workspaces={baseWorkspaces}
            rolesByUser={{ "user-1": { "ws-1": ["designer"] } }}
            members={[baseMember, member2]}
          />,
        ),
      );
      cap.assertNoHooksOrderError();
      expect(err, err ? String(err) : "rerender threw").toBeNull();
    } finally {
      cap.restore();
    }
  });

  it("MemberList: open drawer, then empty/populated re-render keeps hook count stable", () => {
    // Most aggressive production path: the user opens the drawer for
    // a member, the page revalidates (e.g. a concurrent toggleDeactivation
    // committed server-side before the user's revalidate fired, or a
    // second tab deactivated the same member), `members` flips to
    // empty, the empty-state early return fires, the drawer + form
    // unmount. Then the page revalidates again (reactivation), the
    // early return no longer fires, the drawer remounts, the form
    // remounts (key=editing.id, fresh lazy-init seed). Across the
    // unmount/remount cycle the parent must keep calling its 3 hooks
    // on every render; the form is a fresh child fiber, so its 7
    // hooks start from zero, not from the previous mount's count.
    const cap = captureConsoleError();
    try {
      const { getByTestId, rerender } = render(
        <MemberList
          actorId="actor-other"
          workspaces={baseWorkspaces}
          rolesByUser={{ "user-1": { "ws-1": ["designer"] } }}
          members={[baseMember]}
        />,
      );
      // Open the drawer (mounts MemberEditForm, 7 hooks).
      fireEvent.click(getByTestId("users-member-edit-user-1"));
      // Concurrent deactivation: members goes to [].
      const err1 = runWithoutThrowing(() =>
        rerender(
          <MemberList
            actorId="actor-other"
            workspaces={baseWorkspaces}
            rolesByUser={{ "user-1": { "ws-1": ["designer"] } }}
            members={[]}
          />,
        ),
      );
      // Reactivation: members is back. The early-return branch flipped
      // off and the drawer/form remount.
      const err2 = runWithoutThrowing(() =>
        rerender(
          <MemberList
            actorId="actor-other"
            workspaces={baseWorkspaces}
            rolesByUser={{ "user-1": { "ws-1": ["designer"] } }}
            members={[baseMember]}
          />,
        ),
      );
      cap.assertNoHooksOrderError();
      expect(err1, err1 ? String(err1) : "first rerender threw").toBeNull();
      expect(err2, err2 ? String(err2) : "second rerender threw").toBeNull();
    } finally {
      cap.restore();
    }
  });

  it("SendInviteForm: same instance, empty/populated workspaces keeps hook count stable", () => {
    // Empty workspaces hides the <fieldset> that hosts WorkspaceRoleGrid
    // (a separate child component with 1 hook). The parent
    // (SendInviteForm) must keep calling its 1 useActionState across
    // both states.
    const cap = captureConsoleError();
    try {
      const { rerender } = render(<SendInviteForm workspaces={[]} />);
      const err = runWithoutThrowing(() =>
        rerender(<SendInviteForm workspaces={baseWorkspaces} />),
      );
      cap.assertNoHooksOrderError();
      expect(err, err ? String(err) : "rerender threw").toBeNull();
    } finally {
      cap.restore();
    }
  });

  it("InvitationList: same instance, empty/populated invitations keeps hook count stable", () => {
    // Empty invitations early-returns <p>No pending invitations.</p>;
    // the populated branch renders the <ul> + per-row buttons. Hooks
    // (useTransition, useState) are at the top — count must stay at 2.
    const cap = captureConsoleError();
    try {
      const { rerender } = render(<InvitationList invitations={[]} />);
      const err = runWithoutThrowing(() =>
        rerender(<InvitationList invitations={baseInvitations} />),
      );
      cap.assertNoHooksOrderError();
      expect(err, err ? String(err) : "rerender threw").toBeNull();
    } finally {
      cap.restore();
    }
  });

  it("MemberEditTrigger: same instance, role/workspace prop changes keep hook count stable", () => {
    // The trigger owns 1 useState (open) + the drawer below it. Both
    // must remain hook-count-stable when the underlying member's
    // permissions or workspace list shifts.
    const cap = captureConsoleError();
    try {
      const { rerender } = render(
        <MemberEditTrigger
          member={baseMember}
          actorId="actor-1"
          actorIsAgencyAdmin
          workspaces={baseWorkspaces.map((w) => ({ ...w, currentRoles: [] }))}
        />,
      );
      const err = runWithoutThrowing(() =>
        rerender(
          <MemberEditTrigger
            member={{ ...baseMember, isAgencyAdmin: true }}
            actorId="actor-1"
            actorIsAgencyAdmin
            workspaces={baseWorkspaces.map((w) => ({ ...w, currentRoles: ["designer"] }))}
          />,
        ),
      );
      cap.assertNoHooksOrderError();
      expect(err, err ? String(err) : "rerender threw").toBeNull();
    } finally {
      cap.restore();
    }
  });
});

import { describe, expect, it } from "vitest";

import {
  DomainError,
  WORKFLOW_RULES,
  resolveWorkflowTransition,
  responsibleRolesForStatus,
  type WorkspaceRole,
} from "@/lib/content/workflow";

/**
 * Planning-flow permission assignment — the ENGINE contract.
 *
 * These assertions are the executable form of the master prompt §9
 * capability matrix and the §10 transition table. They are pure
 * function calls (no mocks), so each one genuinely fails when the
 * rule it names is widened again.
 *
 * The shape of the contract being pinned:
 *
 *   Capability                    | Agency Admin | Workspace Manager | Planner | Designer | Internal Reviewer | Client Reviewer
 *   ------------------------------| -------------| ------------------| ------- | -------- | ------------------ | ----------------
 *   Submit content review         | F            | M                 | W       | -        | -                 | -
 *   Content approval              | F            | -                 | -       | -        | R                | C only when configured
 *   Assign/reassign designer      | F            | M                 | -       | claim   | -                 | -
 *   Submit delivery               | F            | M                 | -       | W       | -                 | -
 *   Internal creative review      | F            | -                 | -       | -        | R                | -
 *   Client creative review        | F            | -                 | -       | -        | -                | C assigned submissions
 *   Record publishing             | F            | M                 | -       | -        | -                 | W
 *
 * The agency admin reaches every gate because the admin shortcut
 * grants the INTERNAL role set (so the admin is an
 * `internal_reviewer` for the internal gates) — the client creative
 * gate is the one the admin needs an explicit override for, and that
 * override lives in `canDecideClientCreative` (see
 * `auth-policy.test.ts`).
 */

const reviewerOnly: WorkspaceRole[] = ["internal_reviewer"];
const managerOnly: WorkspaceRole[] = ["workspace_manager"];

function expectUnauthorized(action: Parameters<typeof resolveWorkflowTransition>[0]["action"]) {
  return expect(() =>
    resolveWorkflowTransition({
      action,
      currentStatus: "content_review",
      actorRoles: reviewerOnly,
    }),
  );
}

describe("WORKFLOW_RULES — content approval", () => {
  it("approve_content is the internal reviewer's action, not the manager's", () => {
    // §9 gives content approval to the agency admin (F) and the
    // internal reviewer (R). The workspace manager is "-" — the
    // manager is the person who SUBMITS the content, so letting them
    // also approve it collapses the review gate they submitted into.
    expect(WORKFLOW_RULES.approve_content.roles).toEqual(["internal_reviewer"]);
  });

  it("rejects a workspace_manager running approve_content", () => {
    expect(() =>
      resolveWorkflowTransition({
        action: "approve_content",
        currentStatus: "content_review",
        actorRoles: managerOnly,
      }),
    ).toThrowError(expect.objectContaining({ code: "unauthorized" }));
  });

  it("rejects a content_planner running approve_content", () => {
    expect(() =>
      resolveWorkflowTransition({
        action: "approve_content",
        currentStatus: "content_review",
        actorRoles: ["content_planner"],
      }),
    ).toThrowError(expect.objectContaining({ code: "unauthorized" }));
  });

  it("rejects a designer running approve_content", () => {
    expect(() =>
      resolveWorkflowTransition({
        action: "approve_content",
        currentStatus: "content_review",
        actorRoles: ["designer"],
      }),
    ).toThrowError(expect.objectContaining({ code: "unauthorized" }));
  });

  it("accepts an internal_reviewer running approve_content", () => {
    const out = resolveWorkflowTransition({
      action: "approve_content",
      currentStatus: "content_review",
      actorRoles: reviewerOnly,
    });
    expect(out.to).toBe("approved_for_design");
  });

  it("request_content_changes is the internal reviewer's action too", () => {
    // The manager used to be offered this button in the workflow rail
    // and got "Not authorized to request_content_changes" on click.
    expect(WORKFLOW_RULES.request_content_changes.roles).toEqual(["internal_reviewer"]);
    expect(() =>
      resolveWorkflowTransition({
        action: "request_content_changes",
        currentStatus: "content_review",
        actorRoles: managerOnly,
        reason: "Tone is off",
      }),
    ).toThrowError(expect.objectContaining({ code: "unauthorized" }));
  });
});

describe("WORKFLOW_RULES — designer assignment", () => {
  it("assign_designer is the workspace manager's action only", () => {
    // §9 "Assign/reassign designer": Agency Admin F, Workspace
    // Manager M, Planner -. A planner who could assign a designer
    // would push the item into `approved_for_design` with a designer
    // attached, and the `assign_designer` TRANSITION (manager-only)
    // would then reject them — leaving the item stuck with a designer
    // it can never hand to design.
    expect(WORKFLOW_RULES.assign_designer.roles).toEqual(["workspace_manager"]);
  });

  it("rejects a content_planner running assign_designer", () => {
    expect(() =>
      resolveWorkflowTransition({
        action: "assign_designer",
        currentStatus: "approved_for_design",
        actorRoles: ["content_planner"],
      }),
    ).toThrowError(expect.objectContaining({ code: "unauthorized" }));
  });

  it("accepts a workspace_manager running assign_designer", () => {
    const out = resolveWorkflowTransition({
      action: "assign_designer",
      currentStatus: "approved_for_design",
      actorRoles: managerOnly,
    });
    expect(out.to).toBe("in_design");
  });
});

describe("WORKFLOW_RULES — client creative review", () => {
  it("approve_client_creative is the client reviewer's action", () => {
    // §9 "Client creative review": Agency Admin F, Workspace Manager
    // -, Client Reviewer "C assigned submissions".
    expect(WORKFLOW_RULES.approve_client_creative.roles).toEqual(["client_reviewer"]);
  });

  it("rejects a workspace_manager running approve_client_creative", () => {
    expect(() =>
      resolveWorkflowTransition({
        action: "approve_client_creative",
        currentStatus: "creative_review",
        actorRoles: managerOnly,
      }),
    ).toThrowError(expect.objectContaining({ code: "unauthorized" }));
  });
});

describe("responsibleRolesForStatus — the planning list's actionable hint", () => {
  it("reports the internal reviewer as the actor for a content-review item", () => {
    // The list marks a row actionable for the roles that can act on
    // it. A manager used to be listed here (and offered a "Request
    // changes" button that the server rejected).
    expect(responsibleRolesForStatus("content_review")).toEqual(["internal_reviewer"]);
  });

  it("reports the manager and the designer for an approved_for_design item", () => {
    // The manager assigns; the designer claims. The planner can do
    // neither, so it must not be listed.
    expect(responsibleRolesForStatus("approved_for_design")).toEqual([
      "workspace_manager",
      "designer",
    ]);
  });

  it("does not list the workspace manager for a creative-review item", () => {
    // The manager is not an approver at either creative gate.
    expect(responsibleRolesForStatus("creative_review")).not.toContain("workspace_manager");
  });

  it("never reports a viewer as actionable", () => {
    for (const status of [
      "draft",
      "content_review",
      "changes_requested",
      "approved_for_design",
      "in_design",
      "creative_review",
      "ready_to_publish",
    ] as const) {
      expect(responsibleRolesForStatus(status)).not.toContain("viewer");
    }
  });
});

describe("DomainError shape", () => {
  it("uses the structured unauthorized code, not a generic Error", () => {
    try {
      resolveWorkflowTransition({
        action: "approve_content",
        currentStatus: "content_review",
        actorRoles: managerOnly,
      });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe("unauthorized");
    }
  });

  it("keeps the unauthorized message naming the action", () => {
    expectUnauthorized("approve_content");
    try {
      resolveWorkflowTransition({
        action: "approve_content",
        currentStatus: "content_review",
        actorRoles: managerOnly,
      });
    } catch (err) {
      expect((err as DomainError).message).toContain("approve_content");
    }
  });
});

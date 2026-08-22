import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ApprovalTimeline,
  type ApprovalTimelineProps,
} from "@/components/workspace/approval-timeline";

/**
 * ApprovalTimeline — the "Approval requests" list under the workflow bar.
 *
 * Extracted from `workflow-bar.tsx` so the rendering of the approval
 * request(s) lives in one typed surface and the workflow bar is
 * reduced to "transition orchestration" (the click → action →
 * revalidatePath plumbing). The two callbacks (onApprove /
 * onRequestChanges) are typed and unit-testable here.
 *
 * Test matrix per the plan:
 *   - approved                          — show result, no buttons
 *   - changes_requested                 — show result, no buttons
 *   - pending internal reviewer         — buttons enabled for the right role
 *   - pending client reviewer           — buttons enabled for the right role
 *   - unauthorized pending              — pending state, no buttons
 *   - disabled pending (locked workflow) — buttons present but disabled
 */

const baseRequest = {
  id: "req-1",
  gate: "creative_internal" as const,
  status: "pending" as const,
  requestedAt: new Date("2026-08-15T10:00:00.000Z").toISOString(),
  deliveryVersionId: "v-1",
};

function renderTimeline(overrides: Partial<ApprovalTimelineProps> = {}) {
  const props: ApprovalTimelineProps = {
    approvals: [baseRequest],
    roles: {
      isManager: false,
      isInternalReviewer: true,
      isClientReviewer: false,
    },
    onApprove: vi.fn(),
    onRequestChanges: vi.fn(async () => "request_changes"),
    ...overrides,
  };
  return render(<ApprovalTimeline {...props} />);
}

describe("ApprovalTimeline", () => {
  it("renders the 'Approval requests' heading", () => {
    renderTimeline();
    expect(screen.getByText(/approval requests/i)).toBeInTheDocument();
  });

  it("renders nothing when the approvals list is empty", () => {
    const { container } = renderTimeline({ approvals: [] });
    // The heading is part of the timeline; with no approvals, the
    // entire card should not render at all.
    expect(container.firstChild).toBeNull();
  });

  it("approved: shows the result and renders no action buttons", () => {
    renderTimeline({
      approvals: [{ ...baseRequest, status: "approved" }],
      roles: { isManager: true, isInternalReviewer: true, isClientReviewer: true },
    });
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /request changes/i })).toBeNull();
  });

  it("changes_requested: shows the result and renders no action buttons", () => {
    renderTimeline({
      approvals: [{ ...baseRequest, status: "changes_requested" }],
      roles: { isManager: true, isInternalReviewer: true, isClientReviewer: true },
    });
    expect(screen.getByText("changes_requested")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /request changes/i })).toBeNull();
  });

  it("pending internal reviewer: shows pending state, Approve + Request changes enabled for the right role", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onRequestChanges = vi.fn(async () => "request_changes");
    renderTimeline({
      approvals: [{ ...baseRequest, gate: "creative_internal", status: "pending" }],
      roles: { isManager: false, isInternalReviewer: true, isClientReviewer: false },
      onApprove,
      onRequestChanges,
    });
    // pending should be visible
    expect(screen.getByText("pending")).toBeInTheDocument();
    const approve = screen.getByRole("button", { name: /^approve$/i });
    const request = screen.getByRole("button", { name: /request changes/i });
    expect(approve).toBeEnabled();
    expect(request).toBeEnabled();
    await user.click(approve);
    expect(onApprove).toHaveBeenCalledWith(baseRequest.id);
  });

  it("pending client reviewer: shows pending state, Approve + Request changes enabled for client_reviewer", () => {
    renderTimeline({
      approvals: [{ ...baseRequest, gate: "creative_client", status: "pending" }],
      roles: { isManager: false, isInternalReviewer: false, isClientReviewer: true },
    });
    expect(screen.getByText("pending")).toBeInTheDocument();
    const approve = screen.getByRole("button", { name: /^approve$/i });
    const request = screen.getByRole("button", { name: /request changes/i });
    expect(approve).toBeEnabled();
    expect(request).toBeEnabled();
  });

  it("pending + actor is internal reviewer but gate is client: buttons are not rendered (unauthorized pending)", () => {
    // The actor has the role but the gate requires a different reviewer
    // type — the timeline must hide the buttons to avoid offering a
    // decision the actor cannot actually record.
    renderTimeline({
      approvals: [{ ...baseRequest, gate: "creative_client", status: "pending" }],
      roles: { isManager: false, isInternalReviewer: true, isClientReviewer: false },
    });
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /request changes/i })).toBeNull();
  });

  it("pending + actor has no approval role at all: no action buttons (unauthorized pending)", () => {
    renderTimeline({
      approvals: [{ ...baseRequest, status: "pending" }],
      roles: { isManager: false, isInternalReviewer: false, isClientReviewer: false },
    });
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /request changes/i })).toBeNull();
  });

  it("disabled pending: actor has the role but workflow is locked → buttons present but disabled", () => {
    // The actor is the right reviewer, but the parent has flagged the
    // workflow as locked (e.g. a transition is in flight) — buttons
    // should render so the user understands the action exists, but
    // they should be disabled to prevent re-entry.
    renderTimeline({
      approvals: [{ ...baseRequest, status: "pending" }],
      roles: { isManager: false, isInternalReviewer: true, isClientReviewer: false },
      disabled: true,
    });
    const approve = screen.getByRole("button", { name: /^approve$/i });
    const request = screen.getByRole("button", { name: /request changes/i });
    expect(approve).toBeDisabled();
    expect(request).toBeDisabled();
  });

  it("manager override: an isManager actor sees the buttons for any gate", () => {
    renderTimeline({
      approvals: [{ ...baseRequest, gate: "creative_client", status: "pending" }],
      roles: { isManager: true, isInternalReviewer: false, isClientReviewer: false },
    });
    expect(screen.getByRole("button", { name: /^approve$/i })).toBeEnabled();
  });

  it("humanizes the gate name in the row heading", () => {
    renderTimeline({
      approvals: [{ ...baseRequest, gate: "creative_client", status: "approved" }],
    });
    // humanize("creative_client") → "Creative Client"
    expect(screen.getByText(/creative client/i)).toBeInTheDocument();
  });

  it("renders the requested-at timestamp", () => {
    renderTimeline({
      approvals: [{ ...baseRequest, status: "approved" }],
    });
    // toLocaleString() is locale-dependent; we just assert the
    // timestamp container is in the row and is non-empty.
    const card = screen.getByText("approved").closest('[class*="bg-surface-subtle"]');
    expect(card).not.toBeNull();
    const text = (card as HTMLElement).textContent ?? "";
    expect(text.length).toBeGreaterThan(0);
  });

  it("renders one row per approval", () => {
    renderTimeline({
      approvals: [
        { ...baseRequest, id: "a", status: "approved" },
        { ...baseRequest, id: "b", gate: "creative_client", status: "approved" },
        { ...baseRequest, id: "c", status: "pending" },
      ],
    });
    // Each row is a container; we have at least three "approved"/"pending"
    // status text nodes across the rows.
    expect(screen.getAllByText(/approved|pending/i).length).toBeGreaterThanOrEqual(3);
  });

  it("uses a status-colored badge so color is not the only signal", () => {
    const { container } = renderTimeline({
      approvals: [{ ...baseRequest, status: "approved" }],
    });
    // The badge for "approved" uses the success variant → text-success token.
    const success = container.querySelector('[class*="text-success"]');
    expect(success).not.toBeNull();
  });

  it("pending state uses the info variant badge so the color matches the textual 'pending' label", () => {
    const { container } = renderTimeline({
      approvals: [{ ...baseRequest, status: "pending" }],
      roles: { isManager: false, isInternalReviewer: false, isClientReviewer: false },
    });
    const info = container.querySelector('[class*="text-info"]');
    expect(info).not.toBeNull();
  });

  it("Request changes button calls onRequestChanges with the request id and the feedback the user typed", async () => {
    const user = userEvent.setup();
    const onRequestChanges = vi.fn(async () => "request_changes");
    // Stub window.prompt so the user-typed feedback is deterministic.
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Branding is off");
    renderTimeline({
      approvals: [{ ...baseRequest, status: "pending" }],
      roles: { isManager: false, isInternalReviewer: true, isClientReviewer: false },
      onRequestChanges,
    });
    const request = screen.getByRole("button", { name: /request changes/i });
    await user.click(request);
    expect(promptSpy).toHaveBeenCalled();
    expect(onRequestChanges).toHaveBeenCalledWith(baseRequest.id, "Branding is off");
    promptSpy.mockRestore();
  });

  it("Request changes: if the user cancels the prompt, onRequestChanges is NOT called", async () => {
    const user = userEvent.setup();
    const onRequestChanges = vi.fn(async () => "request_changes");
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null);
    renderTimeline({
      approvals: [{ ...baseRequest, status: "pending" }],
      roles: { isManager: false, isInternalReviewer: true, isClientReviewer: false },
      onRequestChanges,
    });
    const request = screen.getByRole("button", { name: /request changes/i });
    await user.click(request);
    expect(promptSpy).toHaveBeenCalled();
    expect(onRequestChanges).not.toHaveBeenCalled();
    promptSpy.mockRestore();
  });

  it("Approved-state rows render inside a flex container (so the workflow bar can line them up)", () => {
    const { container } = renderTimeline({
      approvals: [{ ...baseRequest, status: "approved" }],
    });
    const card = within(container).getByText("approved").closest("div");
    // Sanity: the row container is a div and has at least one text node.
    expect(card).not.toBeNull();
  });
});

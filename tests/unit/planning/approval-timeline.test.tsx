import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { ApprovalTimeline } from "@/components/workspace/approval-timeline";

describe("ApprovalTimeline", () => {
  it("uses the active Arabic catalog when the parent omits a translator", () => {
    render(
      <LocaleProvider locale="ar">
        <ApprovalTimeline
          approvals={[
            {
              id: "approval-1",
              gate: "creative_internal",
              status: "pending",
              requestedAt: "2026-09-02T10:00:00.000Z",
              deliveryVersionId: null,
            },
          ]}
          roles={{ isManager: true, isInternalReviewer: true, isClientReviewer: false }}
          onApprove={vi.fn()}
          onRequestChanges={vi.fn()}
        />
      </LocaleProvider>,
    );

    expect(screen.getByText("الإبداعي الداخلي")).toBeInTheDocument();
    expect(screen.getByText("قيد الانتظار")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "موافقة" })).toBeInTheDocument();
  });
});

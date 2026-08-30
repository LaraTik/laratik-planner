import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AttentionBanner } from "@/components/workspace/attention-banner";

/**
 * The pre-refactor banner was always yellow "X at-risk items".
 * The refactored banner:
 *   - hides entirely when nothing needs attention
 *   - picks severity (critical / warning / info) based on
 *     blocked / overdue / approvals counts
 *   - includes an "Approvals" CTA only when approvals > 0
 */
describe("AttentionBanner", () => {
  const baseProps = {
    atRiskCount: 23,
    blockedCount: 0,
    approachingCount: 3,
    approvalsCount: 0,
    reviewHref: "/app/w/acme/planning?risk=at_risk",
    approvalsHref: "/app/w/acme/reviews",
  };

  it("renders the headline copy and the review link", () => {
    render(<AttentionBanner {...baseProps} />);
    expect(screen.getByText(/Needs attention/)).toBeInTheDocument();
    expect(screen.getByText(/23 items? at risk/)).toBeInTheDocument();
    expect(screen.getByText(/3 approaching deadline/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Review attention items/i });
    expect(link).toHaveAttribute("href", "/app/w/acme/planning?risk=at_risk");
  });

  it("hides entirely when there is nothing needing attention", () => {
    const { container } = render(
      <AttentionBanner
        {...baseProps}
        atRiskCount={0}
        blockedCount={0}
        approachingCount={0}
        approvalsCount={0}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the 'Critical attention' tier when blocked > 0", () => {
    render(<AttentionBanner {...baseProps} blockedCount={2} />);
    const banner = screen.getByTestId("workspace-overview-attention");
    expect(banner.getAttribute("data-severity")).toBe("critical");
    expect(screen.getByText(/Critical attention/)).toBeInTheDocument();
  });

  it("shows the 'Warning' tier when at-risk > 5 and blocked = 0", () => {
    render(<AttentionBanner {...baseProps} atRiskCount={6} blockedCount={0} />);
    const banner = screen.getByTestId("workspace-overview-attention");
    expect(banner.getAttribute("data-severity")).toBe("warning");
  });

  it("shows the 'Info' tier when only approaching deadlines exist", () => {
    render(
      <AttentionBanner {...baseProps} atRiskCount={0} blockedCount={0} approachingCount={2} />,
    );
    const banner = screen.getByTestId("workspace-overview-attention");
    expect(banner.getAttribute("data-severity")).toBe("info");
    expect(screen.getByText(/Heads up/)).toBeInTheDocument();
  });

  it("shows the Approvals CTA only when approvalsCount > 0", () => {
    const { rerender } = render(<AttentionBanner {...baseProps} />);
    expect(screen.queryByRole("link", { name: /^Approvals/i })).toBeNull();
    rerender(<AttentionBanner {...baseProps} approvalsCount={2} />);
    const link = screen.getByRole("link", { name: /^Approvals/i });
    expect(link).toHaveAttribute("href", "/app/w/acme/reviews");
  });
});

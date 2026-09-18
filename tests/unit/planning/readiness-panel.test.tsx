import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReadinessPanel, type ReadinessIssueView } from "@/components/planning/readiness-panel";

const BLOCKERS: ReadinessIssueView[] = [
  {
    path: "channels[0].payload.caption",
    code: "caption_required",
    severity: "blocker",
    message: "Instagram posts require a caption.",
    href: "#publishing",
  },
  {
    path: "channels[0].payload.altText",
    code: "accessibility_alt_text_missing",
    severity: "blocker",
    message: "Instagram posts require alt text.",
    href: "#publishing",
  },
];

const RECOMMENDATIONS: ReadinessIssueView[] = [
  {
    path: "channels[0].payload.firstComment",
    code: "first_comment_required",
    severity: "recommendation",
    message: "Consider adding a first comment to anchor the thread.",
  },
];

describe("ReadinessPanel", () => {
  it("renders the success state when no blockers and no recommendations", () => {
    render(<ReadinessPanel ready blockers={0} recommendations={0} issues={[]} />);
    expect(screen.getByTestId("readiness-panel")).toHaveAttribute("data-ready", "true");
    expect(screen.getByText(/Ready for publishing/i)).toBeInTheDocument();
  });

  it("renders the blockers with a Fix link per issue", () => {
    render(
      <ReadinessPanel
        ready={false}
        blockers={2}
        recommendations={1}
        issues={[...BLOCKERS, ...RECOMMENDATIONS]}
      />,
    );
    expect(screen.getByTestId("readiness-blockers")).toBeInTheDocument();
    expect(screen.getByTestId("readiness-recommendations")).toBeInTheDocument();
    expect(screen.getByText(/Add a caption/i)).toBeInTheDocument();
    expect(screen.getByText(/Add alt text/i)).toBeInTheDocument();
    // The two blockers each have a Fix link; the recommendation
    // has no href so no Fix button.
    const fixButtons = screen.getAllByText(/^Fix$/);
    expect(fixButtons).toHaveLength(2);
  });

  it("calls onFix with the issue's href when Fix is clicked", async () => {
    const onFix = vi.fn();
    render(
      <ReadinessPanel
        ready={false}
        blockers={1}
        recommendations={0}
        issues={BLOCKERS}
        onFix={onFix}
      />,
    );
    const fix = screen.getByTestId("readiness-fix-caption_required");
    await userEvent.click(fix);
    expect(onFix).toHaveBeenCalledWith("#publishing");
  });

  it("uses the active translator for the panel chrome and issue labels", () => {
    const translations: Record<string, string> = {
      "contentDetail.readinessPanel.readyTitle": "جاهز للنشر",
      "contentDetail.readinessPanel.readyDescription": "لا توجد عوائق أو توصيات.",
      "contentDetail.readinessPanel.blockersBeforePublishingOne": "عائق واحد قبل النشر",
      "contentDetail.readinessPanel.blockerOne": "عائق واحد",
      "contentDetail.readinessPanel.resolveBeforePublishing": "عالج هذه العناصر قبل نشر المحتوى.",
      "contentDetail.readinessPanel.issue.caption_required": "أضف تعليقًا",
      "contentDetail.readinessPanel.issueDetails.caption_required": "أضف تعليقًا قبل النشر.",
      "contentDetail.readinessPanel.fix": "إصلاح",
    };
    const t = (key: string) => translations[key] ?? `[${key}]`;

    render(
      <ReadinessPanel
        ready={false}
        blockers={1}
        recommendations={0}
        issues={[BLOCKERS[0]!]}
        t={t}
      />,
    );

    expect(screen.getByText("عائق واحد قبل النشر")).toBeInTheDocument();
    expect(screen.getByText("أضف تعليقًا")).toBeInTheDocument();
    expect(screen.getByText("أضف تعليقًا قبل النشر.")).toBeInTheDocument();
    expect(screen.getByText("إصلاح")).toBeInTheDocument();
  });
});

/**
 * Regression test for the Fix link when the parent does not
 * provide an `onFix` callback. The fallback used to be a
 * plain Next.js `<Link>`, which updates the URL hash but does
 * NOT fire `hashchange` — so any downstream listener that
 * mirrors hash changes (e.g. `WorkspaceShell`) would never see
 * the navigation. The fallback is now a `TabSwitchLink` which
 * dispatches the event explicitly.
 *
 * Background (2026-09-18): same family of bug as the
 * Overview "Go to" cards — the readiness fallback was missed
 * in the original TabSwitchLink rollout.
 */
describe("ReadinessPanel — fallback Fix link", () => {
  beforeEach(() => {
    // Anchor the test window to a planning-detail path so
    // TabSwitchLink's `isHashOnlyLink` check accepts the hash.
    window.history.replaceState(null, "", "/app/w/acme/planning/ci-1");
    window.location.hash = "";
  });

  it("dispatches a real hashchange event when no onFix callback is provided", () => {
    const listener = vi.fn();
    window.addEventListener("hashchange", listener);
    render(<ReadinessPanel ready={false} blockers={1} recommendations={0} issues={BLOCKERS} />);

    const fix = screen.getByTestId("readiness-fix-caption_required");
    expect(fix.tagName).toBe("A");
    expect(fix).toHaveAttribute("href", "#publishing");

    act(() => {
      fireEvent.click(fix);
    });

    expect(window.location.hash).toBe("#publishing");
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener("hashchange", listener);
  });
});

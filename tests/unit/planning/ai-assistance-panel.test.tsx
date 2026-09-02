import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { AiAssistancePanel } from "@/components/planning/ai-assistance-panel";

vi.mock("@/app/(app)/app/w/[slug]/planning/[id]/ai-assistance-section", () => ({
  AiAssistanceSection: () => <div data-testid="ai-assistance-section-mock" />,
}));

const baseProps = {
  workspaceSlug: "demo",
  contentItemId: "content-1",
  contentStatus: "draft",
  isManager: true,
  isPlanner: false,
  enabledCapabilities: [],
  agencyEnabled: true,
  hasKey: true,
  currentBrief: "A short brief",
};

describe("AiAssistancePanel", () => {
  it("renders the dialog chrome from the active Arabic catalog", () => {
    render(
      <LocaleProvider locale="ar">
        <AiAssistancePanel {...baseProps} />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "مساعدة الذكاء الاصطناعي" }));

    expect(screen.getByRole("heading", { name: "مساعدة الذكاء الاصطناعي" })).toBeInTheDocument();
    expect(
      screen.getByText("أنشئ مسودات، وحسّن الموجز، وتحقق من اكتمال المحتوى."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إغلاق" })).toBeInTheDocument();
  });
});

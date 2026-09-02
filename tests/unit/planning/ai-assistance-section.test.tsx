import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/components/i18n/locale-provider";

vi.mock("@/app/(app)/app/w/[slug]/planning/actions", () => ({
  applyAiDraftAction: vi.fn(),
}));

import { AiAssistanceSection } from "@/app/(app)/app/w/[slug]/planning/[id]/ai-assistance-section";

const baseProps = {
  workspaceSlug: "demo",
  contentItemId: "content-1",
  contentStatus: "draft",
  isManager: true,
  isPlanner: false,
  enabledCapabilities: [],
  agencyEnabled: false,
  hasKey: false,
  currentBrief: "A short brief",
};

describe("AiAssistanceSection", () => {
  it("renders the disabled and context states from the active Arabic catalog", () => {
    render(
      <LocaleProvider locale="ar">
        <AiAssistanceSection {...baseProps} />
      </LocaleProvider>,
    );

    expect(screen.getByText("مساعدة الذكاء الاصطناعي")).toBeInTheDocument();
    expect(
      screen.getByText("مسودات فقط — يضيفها المستخدم أو يستبدل بها المحتوى."),
    ).toBeInTheDocument();
    expect(screen.getByText("مساعدة الذكاء الاصطناعي متوقفة حاليًا")).toBeInTheDocument();
    expect(
      screen.getByText(
        "يحتاج مسؤول الوكالة إلى تفعيل المفتاح الرئيسي للذكاء الاصطناعي قبل تشغيل أي قدرة.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("نبرة العلامة التجارية")).toBeInTheDocument();
    expect(screen.getByTestId("ai-context-toggle-brandKit")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

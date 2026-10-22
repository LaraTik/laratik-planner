import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { AiAssistancePanel } from "@/components/planning/ai-assistance-panel";

const baseProps = {
  content: <div data-testid="ai-assistance-section-mock" />,
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
    expect(screen.getByTestId("ai-assistance-section-mock")).toBeInTheDocument();
    expect(
      screen.getByText("أنشئ مسودات، وحسّن الموجز، وتحقق من اكتمال المحتوى."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إغلاق" })).toBeInTheDocument();
  });
});

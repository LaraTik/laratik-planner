import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/app/w/[slug]/planning/actions", () => ({
  batchCreateAction: vi.fn(),
}));

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { BatchForm } from "@/app/(app)/app/w/[slug]/planning/batch/batch-form";

describe("BatchForm", () => {
  it("renders Arabic labels and keeps pasted Arabic content right-to-left", () => {
    render(
      <LocaleProvider locale="ar">
        <BatchForm slug="food-game" />
      </LocaleProvider>,
    );

    expect(screen.getByLabelText("فكرة واحدة في كل سطر")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إنشاء مسودات" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "إلغاء" })).toHaveAttribute(
      "href",
      "/app/w/food-game/planning",
    );

    const rows = screen.getByLabelText("فكرة واحدة في كل سطر");
    fireEvent.change(rows, {
      target: { value: "فكرة عربية | story | 2026-09-05T09:00:00Z | وصف" },
    });

    expect(rows).toHaveAttribute("dir", "rtl");
    expect(screen.getByTestId("batch-row-count")).toHaveTextContent("تم تحليل صف واحد");
  });
});

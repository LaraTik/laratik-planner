import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/app/w/[slug]/planning/actions", () => ({ batchCreateAction: vi.fn() }));

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { BatchForm } from "@/app/(app)/app/w/[slug]/planning/batch/batch-form";

describe("BatchForm", () => {
  it("renders the localized spreadsheet workflow and accepts Arabic row content", () => {
    render(
      <LocaleProvider locale="ar">
        <BatchForm
          slug="food-game"
          workspaceTimezone="Europe/Berlin"
          channels={[
            {
              id: "11111111-1111-4111-8111-111111111111",
              platform: "Instagram",
              accountName: "Brand",
            },
          ]}
        />
      </LocaleProvider>,
    );
    expect(screen.getByRole("button", { name: "لصق من جدول بيانات" })).toBeInTheDocument();
    expect(screen.getByText("اختر الصيغة المناسبة")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "حفظ الكل كمسودات" })).toBeDisabled();

    const title = screen.getAllByRole("textbox", { name: "عنوان الصف 1" })[0]!;
    fireEvent.change(title, { target: { value: "فكرة عربية" } });
    expect(title).toHaveAttribute("dir", "rtl");
    expect(screen.getByTestId("batch-validation-summary")).toHaveTextContent("0 صالح");
  });

  it("imports tab-separated rows into editable grid rows", () => {
    render(
      <LocaleProvider locale="en">
        <BatchForm slug="food-game" channels={[]} />
      </LocaleProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Paste from spreadsheet" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Spreadsheet or raw paste" }), {
      target: {
        value:
          "Title\tFormat\tDate & time\tShort brief\tChannels\nSpring collection\timage\t2026-09-05 09:00\tPre-order\tInstagram",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import rows" }));
    expect(screen.getAllByRole("textbox", { name: "Title for row 1" })[0]).toHaveValue(
      "Spring collection",
    );
    expect(screen.getAllByRole("combobox", { name: "Format for row 1" })[0]).toHaveValue(
      "static_post",
    );
  });
});

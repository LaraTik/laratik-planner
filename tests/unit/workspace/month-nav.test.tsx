import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { tFor } from "@/messages";
import { MonthNav } from "@/components/workspace/month-nav";

const month = new Date(2026, 8, 1);

describe("MonthNav", () => {
  it("formats the month and accessible labels in English", () => {
    render(
      <MonthNav
        month={month}
        buildHref={(offset) => `?month=${offset}`}
        locale="en"
        t={tFor("en")}
      />,
    );

    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous month, August 2026" })).toHaveAttribute(
      "href",
      "?month=-1",
    );
    expect(screen.getByRole("link", { name: "Next month, October 2026" })).toHaveAttribute(
      "href",
      "?month=1",
    );
  });

  it("uses Arabic month names and Arabic accessible labels for Arabic locale", () => {
    render(<MonthNav month={month} buildHref={() => "#"} locale="ar" t={tFor("ar")} />);

    expect(screen.getByText(/سبتمبر ٢٠٢٦|سبتمبر 2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /الشهر السابق/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /الشهر التالي/ })).toBeInTheDocument();
  });
});

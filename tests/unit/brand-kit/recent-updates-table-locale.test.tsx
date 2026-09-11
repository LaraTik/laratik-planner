import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { tFor } from "@/messages";
import { RecentUpdatesTable } from "@/app/(app)/app/w/[slug]/brand-kit/recent-updates-table";

describe("RecentUpdatesTable localization", () => {
  it("localizes table headers and unknown actors in Arabic", () => {
    render(
      <RecentUpdatesTable
        t={tFor("ar")}
        locale="ar"
        rows={[
          {
            kind: "rule",
            description: "قاعدة صوت",
            updatedAt: new Date("2026-09-11T09:00:00Z"),
            actor: null,
          },
        ]}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "متى" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "ما الذي حدث" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "بواسطة" })).toBeInTheDocument();
    expect(screen.getByText("غير معروف")).toBeInTheDocument();
  });
});

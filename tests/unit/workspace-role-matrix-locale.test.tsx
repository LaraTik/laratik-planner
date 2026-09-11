import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { WorkspaceRoleMatrix } from "@/app/(app)/app/users/_components/workspace-role-matrix";

describe("WorkspaceRoleMatrix localization", () => {
  it("localizes role names and access state in Arabic", () => {
    render(
      <LocaleProvider locale="ar">
        <WorkspaceRoleMatrix workspaces={[{ id: "ws-1", name: "المكتب" }]} showNoAccessAction />
      </LocaleProvider>,
    );

    expect(screen.getAllByRole("group", { name: "أدوار المكتب" })).toHaveLength(2);
    expect(screen.getByRole("checkbox", { name: "المصمم في المكتب" })).toBeInTheDocument();
    expect(
      screen.getByText("لا توجد صلاحية — اختر دورًا لمنح صلاحية على مساحة العمل هذه."),
    ).toBeInTheDocument();
  });
});

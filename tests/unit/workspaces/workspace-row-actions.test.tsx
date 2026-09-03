import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { WorkspaceRowActions } from "@/components/workspace/workspace-row-actions";

describe("WorkspaceRowActions", () => {
  it("uses the Arabic catalog for the trigger and menu items", async () => {
    const user = userEvent.setup();

    render(
      <LocaleProvider locale="ar">
        <WorkspaceRowActions slug="acme" name="Acme" canArchive canDuplicate />
      </LocaleProvider>,
    );

    await user.click(screen.getByRole("button", { name: "إجراءات Acme" }));

    expect(screen.getByRole("menuitem", { name: /فتح مساحة العمل/ })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "إعدادات مساحة العمل" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "إدارة الفريق" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "القنوات الاجتماعية" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "تكرار مساحة العمل" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "أرشفة" })).toBeVisible();
  });
});

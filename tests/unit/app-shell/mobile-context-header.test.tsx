import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { MobileContextHeader } from "@/components/app-shell/mobile-context-header";

const { usePathname } = vi.hoisted(() => ({
  usePathname: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname,
}));

const workspaces = [{ id: "workspace-1", slug: "acme", name: "Acme" }];

describe("MobileContextHeader", () => {
  beforeEach(() => {
    usePathname.mockReturnValue("/app/w/acme/planning");
  });

  it("uses the active Arabic catalog for the workspace context", () => {
    render(
      <LocaleProvider locale="ar">
        <MobileContextHeader workspaces={workspaces} />
      </LocaleProvider>,
    );

    expect(screen.getByRole("link", { name: "نظرة عامة على Acme" })).toBeVisible();
    expect(screen.getByText("مساحة العمل")).toBeVisible();
  });

  it("uses the localized My Work context outside a workspace", () => {
    usePathname.mockReturnValue("/app");

    render(
      <LocaleProvider locale="ar">
        <MobileContextHeader workspaces={workspaces} />
      </LocaleProvider>,
    );

    expect(screen.getByRole("link", { name: "الصفحة الرئيسية لـ StudioFlow" })).toBeVisible();
    expect(screen.getByText("عملي")).toBeVisible();
  });
});

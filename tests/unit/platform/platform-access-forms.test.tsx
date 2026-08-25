import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GrantPlatformAccessForm } from "@/app/(app)/app/platform/access/grant-form";
import { ChangePlatformRoleDialog } from "@/app/(app)/app/platform/access/change-role-dialog";
import { RevokePlatformAccessDialog } from "@/app/(app)/app/platform/access/revoke-dialog";

vi.mock("@/app/(app)/app/platform/access/actions", () => ({
  grantPlatformAccessAction: vi.fn(async () => ({ ok: true })),
  changePlatformRoleAction: vi.fn(async () => ({ ok: true })),
  revokePlatformAccessAction: vi.fn(async () => ({ ok: true })),
}));

const TARGET_ID = "00000000-0000-4000-8000-00000000c002";

describe("platform access forms", () => {
  it("offers the four documented roles with descriptions", () => {
    render(<GrantPlatformAccessForm />);
    const select = screen.getByRole("combobox", { name: /Platform role/i });
    expect(select).toBeRequired();
    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(screen.getByRole("option", { name: /Platform Owner/i })).toBeInTheDocument();
    expect(screen.getByText(/Manage agencies and lifecycle/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add platform member/i })).toBeInTheDocument();
  });

  it("uses accessible role-change and revoke dialogs with touch-sized triggers", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <ChangePlatformRoleDialog
          userId={TARGET_ID}
          email="member@example.com"
          currentRole="agency_operator"
        />
        <RevokePlatformAccessDialog
          userId={TARGET_ID}
          email="member@example.com"
          role="agency_operator"
        />
      </div>,
    );

    const changeTrigger = screen.getByRole("button", {
      name: /Change role for member@example.com/i,
    });
    expect(changeTrigger).toHaveClass("min-h-11", "min-w-11");
    await user.click(changeTrigger);
    expect(screen.getByRole("dialog", { name: /Change platform role/i })).toBeInTheDocument();
    expect(screen.getByText(/member@example.com/)).toBeInTheDocument();
  });
});

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

// Test stub: returns the English catalog fallback for any platform.* key.
// The catalog parity test (tests/unit/i18n/catalogs.test.ts) is the canonical
// gate for translation completeness; this stub only needs to provide a
// typed translator contract that mirrors the production shape.
const stubT = (key: string, params?: Record<string, string | number>) => {
  const lookup: Record<string, string> = {
    "platform.grantEmailLabel": "Email",
    "platform.grantEmailPlaceholder": "person@company.com",
    "platform.grantRoleLabel": "Platform role",
    "platform.grantReasonLabel": "Reason",
    "platform.grantReasonPlaceholder": "On-call rotation or responsibility",
    "platform.accessAddMember": "Add platform member",
    "platform.grantSubmitPending": "Adding…",
    "platform.roleLabels.platform_owner.label": "Platform Owner",
    "platform.roleLabels.agency_operator.label": "Agency Operator",
    "platform.roleLabels.platform_auditor.label": "Platform Auditor",
    "platform.roleLabels.support_operator.label": "Support Operator",
    "platform.roleLabels.platform_owner.description":
      "Full platform control, including access and archives",
    "platform.roleLabels.agency_operator.description":
      "Manage agencies and lifecycle, excluding archives",
    "platform.roleLabels.platform_auditor.description":
      "Read-only agency, access, and audit oversight",
    "platform.roleLabels.support_operator.description": "Request temporary support access",
    "platform.changeRoleAria": "Change role for {email}",
    "platform.changeRoleTitle": "Change role for {email}",
    "platform.changeRoleHeading": "Change platform role",
    "platform.changeRoleDescription":
      "Change access for {email}. Downgrading the final Platform Owner is blocked by the server.",
    "platform.changeRoleNewRoleLabel": "New role",
    "platform.changeRoleReasonLabel": "Reason",
    "platform.changeRoleReasonPlaceholder": "Responsibility changed",
    "platform.changeRoleSuccess": "Role updated.",
    "platform.changeRoleSubmit": "Change role",
    "platform.changeRoleSubmitPending": "Changing…",
    "platform.revokeAria": "Revoke access for {email}",
    "platform.revokeTitle": "Revoke access for {email}",
    "platform.revokeHeading": "Revoke platform access",
    "platform.revokeDescription":
      "Revoke {role} access for {email}. The assignment remains in the audit history.",
    "platform.revokeReasonLabel": "Reason",
    "platform.revokeReasonPlaceholder": "Offboarding or rotation ended",
    "platform.revokeSuccess": "Access revoked.",
    "platform.revokeSubmit": "Revoke access",
    "platform.revokeSubmitPending": "Revoking…",
    "platform.commonClose": "Close",
    "platform.commonCancel": "Cancel",
  };
  let value = lookup[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replaceAll(`{${k}}`, String(v));
    }
  }
  return value;
};

describe("platform access forms", () => {
  it("offers the four documented roles with descriptions", () => {
    render(<GrantPlatformAccessForm t={stubT} />);
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
          t={stubT}
        />
        <RevokePlatformAccessDialog
          userId={TARGET_ID}
          email="member@example.com"
          role="agency_operator"
          t={stubT}
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

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgencyLifecycleControls } from "@/app/(app)/app/platform/agencies/[agencyId]/agency-lifecycle-controls";
import { deriveAgencyDetailCapabilities } from "@/lib/auth/platform-agency-capabilities";
import { permissionsForPlatformRole } from "@/lib/auth/platform-access";

vi.mock("@/app/(app)/app/platform/agencies/actions", () => ({
  changeLifecycleAction: vi.fn(async () => undefined),
}));

const AGENCY_ID = "00000000-0000-4000-8000-00000000a001";

describe("platform agency permission presentation", () => {
  it.each([
    ["platform_owner", [true, true, true, true, true]],
    ["agency_operator", [true, true, true, false, false]],
    ["platform_auditor", [false, false, false, false, false]],
    ["support_operator", [false, false, false, false, true]],
  ] as const)("derives the documented %s capabilities", (role, expected) => {
    const capabilities = deriveAgencyDetailCapabilities(permissionsForPlatformRole(role));
    expect([
      capabilities.canUpdate,
      capabilities.canManagePlan,
      capabilities.canManageLifecycle,
      capabilities.canArchive,
      capabilities.canRequestSupport,
    ]).toEqual(expected);
  });

  it("shows operator lifecycle controls but never an archive control", () => {
    render(
      <AgencyLifecycleControls
        agencyId={AGENCY_ID}
        agencyName="Acme"
        lifecycle="active"
        canManageLifecycle
        canArchive={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Suspend agency" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Archive agency/ })).not.toBeInTheDocument();
  });

  it("shows only Owner unarchive for archived agencies and never normal restore", () => {
    render(
      <AgencyLifecycleControls
        agencyId={AGENCY_ID}
        agencyName="Acme"
        lifecycle="archived"
        canManageLifecycle
        canArchive
      />,
    );
    expect(screen.getByRole("button", { name: "Unarchive agency" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore agency" })).not.toBeInTheDocument();
  });

  it("renders no mutation controls for an Auditor", () => {
    render(
      <AgencyLifecycleControls
        agencyId={AGENCY_ID}
        agencyName="Acme"
        lifecycle="suspended"
        canManageLifecycle={false}
        canArchive={false}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

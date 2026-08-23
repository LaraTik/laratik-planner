import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddAgencyDrawer } from "@/app/(app)/app/platform/agencies/add-agency-drawer";

vi.mock("@/app/(app)/app/platform/agencies/actions", () => ({
  createAgencyAction: vi.fn(async () => ({ success: true })),
}));

const plans = [{ id: "00000000-0000-0000-0000-000000000001", name: "Starter", description: null }];

describe("AddAgencyDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("navigates through all four provisioning steps and back", async () => {
    const user = userEvent.setup();
    render(<AddAgencyDrawer plans={plans} />);

    await user.click(screen.getByRole("button", { name: "Add agency" }));
    expect(screen.getByRole("region", { name: "Organization details" })).toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 4/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("region", { name: "First administrator" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("region", { name: "Plan and limits" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("region", { name: "Review agency" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create agency" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("region", { name: "Plan and limits" })).toBeInTheDocument();
  });

  it("submits an empty override object until an override is entered", async () => {
    const user = userEvent.setup();
    const { container } = render(<AddAgencyDrawer plans={plans} />);

    await user.click(screen.getByRole("button", { name: "Add agency" }));
    const overrideInput =
      container.ownerDocument.querySelector<HTMLInputElement>('input[name="overrides"]');
    expect(overrideInput).toHaveValue("{}");

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(screen.getByLabelText("Instagram"), "3");
    expect(overrideInput).toHaveValue(
      JSON.stringify({ social_profiles_by_platform: { instagram: 3 } }),
    );
  });
});

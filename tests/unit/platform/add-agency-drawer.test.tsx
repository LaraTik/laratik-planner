import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddAgencyDrawer } from "@/app/(app)/app/platform/agencies/add-agency-drawer";
import { LocaleProvider } from "@/components/i18n/locale-provider";

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

    // The Continue button is gated on the required fields of
    // the current step (M3.4 polish). Fill them so the test
    // can advance.
    await user.type(screen.getByLabelText("Agency name"), "Acme Social");
    await user.type(screen.getByLabelText("Slug"), "acme");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("region", { name: "First administrator" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Administrator name"), "Acme Admin");
    await user.type(screen.getByLabelText("Administrator email"), "admin@acme.example");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("region", { name: "Plan and limits" })).toBeInTheDocument();

    // The plan select has a default value, so Continue is
    // enabled by step 3.
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

    // Step 1: fill required fields.
    await user.type(screen.getByLabelText("Agency name"), "Acme Social");
    await user.type(screen.getByLabelText("Slug"), "acme");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    // Step 2: fill required fields.
    await user.type(screen.getByLabelText("Administrator name"), "Acme Admin");
    await user.type(screen.getByLabelText("Administrator email"), "admin@acme.example");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    // Step 3: add an override on Instagram.
    await user.type(screen.getByLabelText("Instagram"), "3");
    expect(overrideInput).toHaveValue(
      JSON.stringify({ social_profiles_by_platform: { instagram: 3 } }),
    );
  });

  it("renders the provisioning flow from the Arabic catalog", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="ar">
        <AddAgencyDrawer plans={plans} />
      </LocaleProvider>,
    );

    await user.click(screen.getByRole("button", { name: "إضافة وكالة" }));
    expect(screen.getByRole("dialog")).toHaveAccessibleName("إضافة وكالة");
    expect(screen.getByRole("region", { name: "تفاصيل المؤسسة" })).toBeInTheDocument();
    expect(screen.getByLabelText("اسم الوكالة")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "متابعة" })).toBeInTheDocument();
  });
});

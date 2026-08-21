import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// `useFormStatus` is a React 19 server-action hook that only works
// inside a <form action>. Mock it so the form is always "not pending"
// in the test environment.
vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormStatus: vi.fn(),
  };
});

// Stub the server action — the form test asserts structure, not behaviour.
vi.mock("@/app/(app)/app/w/[slug]/settings/actions", () => ({
  updateWorkspaceSettingsAction: vi.fn(),
}));

import { useFormStatus } from "react-dom";
import { SettingsForm } from "@/app/(app)/app/w/[slug]/settings/settings-form";

const mockedUseFormStatus = vi.mocked(useFormStatus);

const baseValues = {
  timezone: "Europe/Vienna",
  approvalMode: "simple",
  monthlyTarget: 30,
  contentApprovalLeadDays: 10,
  designCompleteLeadDays: 5,
  creativeApprovalLeadDays: 2,
  readyToPublishLeadDays: 1,
  defaultDesignerId: null,
  defaultContentReviewerId: null,
  defaultInternalCreativeReviewerId: null,
  defaultClientReviewerId: null,
};

describe("SettingsForm", () => {
  it("renders every section, label, and id-bound control", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    render(
      <SettingsForm
        slug="acme"
        values={baseValues}
        designers={[{ id: "u-1", label: "Sam Designer" }]}
        internalReviewers={[]}
        clientReviewers={[]}
      />,
    );

    // Top grid (lifecycle)
    expect(screen.getByLabelText(/^timezone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/monthly target/i)).toBeInTheDocument();

    // Lead times fieldset
    expect(screen.getByLabelText(/content approval/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/design complete/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/creative approval/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ready to publish/i)).toBeInTheDocument();

    // Approval-mode fieldset
    const approval = screen.getByLabelText(/^mode$/i);
    expect(approval).toBeInTheDocument();
    expect(approval.tagName.toLowerCase()).toBe("select");

    // Defaults fieldset
    expect(screen.getByLabelText(/^designer$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^content reviewer$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/internal creative reviewer/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^client reviewer$/i)).toBeInTheDocument();
  });

  it("marks the timezone + lead-time fields as required", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    render(
      <SettingsForm
        slug="acme"
        values={baseValues}
        designers={[]}
        internalReviewers={[]}
        clientReviewers={[]}
      />,
    );
    expect(screen.getByLabelText(/^timezone/i)).toBeRequired();
    expect(screen.getByLabelText(/^timezone/i)).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText(/content approval/i)).toBeRequired();
    expect(screen.getByLabelText(/ready to publish/i)).toBeRequired();
  });

  it("uses the focus-ring token on the inputs and the submit button toggles pending state", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    render(
      <SettingsForm
        slug="acme"
        values={baseValues}
        designers={[]}
        internalReviewers={[]}
        clientReviewers={[]}
      />,
    );
    const timezone = screen.getByLabelText(/^timezone/i);
    expect(timezone.className).toMatch(/focus-visible:ring-focus-ring/);

    const submit = screen.getByRole("button", { name: /save defaults/i });
    expect(submit).not.toBeDisabled();

    mockedUseFormStatus.mockReturnValue({ pending: true } as ReturnType<typeof useFormStatus>);
    render(
      <SettingsForm
        slug="acme"
        values={baseValues}
        designers={[]}
        internalReviewers={[]}
        clientReviewers={[]}
      />,
    );
    const pending = screen.getByRole("button", { name: /saving/i });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute("aria-busy", "true");
  });

  it("uses anchor ids for the section nav (lifecycle / lead-times / defaults / approvals)", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    const { container } = render(
      <SettingsForm
        slug="acme"
        values={baseValues}
        designers={[]}
        internalReviewers={[]}
        clientReviewers={[]}
      />,
    );
    expect(container.querySelector("#lifecycle")).toBeInTheDocument();
    expect(container.querySelector("#lead-times")).toBeInTheDocument();
    expect(container.querySelector("#defaults")).toBeInTheDocument();
    expect(container.querySelector("#approvals")).toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

// Stub the server actions so the test stays a pure component check.
vi.mock("@/app/(app)/app/w/[slug]/settings/actions", () => ({
  updateLeadTimesSettingsAction: vi.fn(),
}));
vi.mock("@/app/(app)/app/w/[slug]/settings/ai-suggestions", () => ({
  suggestLeadTimesAction: vi.fn(),
}));

import { useFormStatus } from "react-dom";
import { LeadTimesForm } from "@/app/(app)/app/w/[slug]/settings/_components/lead-times-form";
import { suggestLeadTimesAction } from "@/app/(app)/app/w/[slug]/settings/ai-suggestions";

const mockedUseFormStatus = vi.mocked(useFormStatus);
const mockedSuggest = vi.mocked(suggestLeadTimesAction);

const baseValues = {
  contentApprovalLeadDays: 10,
  designCompleteLeadDays: 5,
  creativeApprovalLeadDays: 2,
  readyToPublishLeadDays: 1,
};

function renderForm() {
  mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
  return render(<LeadTimesForm slug="acme" values={baseValues} approvalMode="simple" />);
}

describe("LeadTimesForm (Phase D — AI preview)", () => {
  it("renders the suggest button + 4 lead-time fields", () => {
    renderForm();
    expect(screen.getByTestId("lead-times-ai-suggest")).toBeInTheDocument();
    expect(screen.getByLabelText(/content approval/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/design complete/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/creative approval/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ready to publish/i)).toBeInTheDocument();
  });

  it("shows a preview region with before/after deltas when the suggestion is returned", async () => {
    const user = userEvent.setup();
    mockedSuggest.mockResolvedValue({
      ok: true,
      suggestion: {
        contentApprovalLeadDays: 5,
        designCompleteLeadDays: 3,
        creativeApprovalLeadDays: 0,
        readyToPublishLeadDays: 2,
      },
    });
    renderForm();
    await user.click(screen.getByTestId("lead-times-ai-suggest"));
    const preview = await screen.findByTestId("lead-times-ai-preview");
    expect(preview).toBeInTheDocument();
    // The form values should NOT have changed yet — Apply is the
    // commit step.
    expect(screen.getByLabelText(/content approval/i)).toHaveValue(10);
    // The per-stage before / after lines are present.
    expect(
      screen.getByTestId("lead-times-ai-preview-stage-contentApprovalLeadDays"),
    ).toHaveTextContent(/10d/);
    expect(
      screen.getByTestId("lead-times-ai-preview-stage-contentApprovalLeadDays"),
    ).toHaveTextContent(/5d/);
  });

  it("Apply commits the preview to the form values; form values now match the suggestion", async () => {
    const user = userEvent.setup();
    mockedSuggest.mockResolvedValue({
      ok: true,
      suggestion: {
        contentApprovalLeadDays: 5,
        designCompleteLeadDays: 3,
        creativeApprovalLeadDays: 0,
        readyToPublishLeadDays: 2,
      },
    });
    renderForm();
    await user.click(screen.getByTestId("lead-times-ai-suggest"));
    await screen.findByTestId("lead-times-ai-preview");
    await user.click(screen.getByTestId("lead-times-ai-apply"));
    // The preview region closes and the form fields update.
    await waitFor(() => {
      expect(screen.queryByTestId("lead-times-ai-preview")).toBeNull();
    });
    expect(screen.getByLabelText(/content approval/i)).toHaveValue(5);
    expect(screen.getByLabelText(/design complete/i)).toHaveValue(3);
  });

  it("Discard closes the preview without touching the form values", async () => {
    const user = userEvent.setup();
    mockedSuggest.mockResolvedValue({
      ok: true,
      suggestion: {
        contentApprovalLeadDays: 5,
        designCompleteLeadDays: 3,
        creativeApprovalLeadDays: 0,
        readyToPublishLeadDays: 2,
      },
    });
    renderForm();
    await user.click(screen.getByTestId("lead-times-ai-suggest"));
    await screen.findByTestId("lead-times-ai-preview");
    await user.click(screen.getByTestId("lead-times-ai-discard"));
    await waitFor(() => {
      expect(screen.queryByTestId("lead-times-ai-preview")).toBeNull();
    });
    expect(screen.getByLabelText(/content approval/i)).toHaveValue(10);
  });

  it("Revert appears after the user edits any field, and restores the original values", async () => {
    const user = userEvent.setup();
    renderForm();
    const content = screen.getByLabelText(/content approval/i);
    await user.clear(content);
    await user.type(content, "12");
    expect(screen.getByTestId("lead-times-revert")).toBeInTheDocument();
    await user.click(screen.getByTestId("lead-times-revert"));
    expect(content).toHaveValue(10);
  });
});

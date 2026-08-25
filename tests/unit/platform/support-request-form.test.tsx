import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SupportAccessRequestForm } from "@/app/(app)/app/platform/security/request-access-form";

vi.mock("@/app/(app)/app/platform/security/actions", () => ({
  createSupportAccessRequestFormAction: vi.fn(async () => ({ ok: true })),
}));

const AGENCY_ID = "00000000-0000-4000-8000-00000000a001";

describe("SupportAccessRequestForm", () => {
  it("collects the complete bounded support request", () => {
    render(
      <SupportAccessRequestForm
        agencyId={AGENCY_ID}
        agencyName="Acme"
        workspaces={[{ id: "00000000-0000-4000-8000-00000000b001", name: "Marketing" }]}
      />,
    );
    expect(screen.getByLabelText("Ticket reference")).toBeRequired();
    expect(screen.getByLabelText("Requested duration")).toHaveAttribute("max", "168");
    expect(screen.getByLabelText("Workspace scope")).toHaveTextContent("Marketing");
    expect(screen.getByRole("checkbox", { name: /Metadata only/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Request downloads/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Reason for access")).toBeRequired();
    expect(screen.getByRole("button", { name: "Request temporary access" })).toBeInTheDocument();
  });

  it("explains the approval and tenant-content boundary", () => {
    render(<SupportAccessRequestForm agencyId={AGENCY_ID} agencyName="Acme" workspaces={[]} />);
    expect(screen.getByText(/agency administrator must approve/i)).toBeInTheDocument();
    expect(screen.getByText(/does not grant access immediately/i)).toBeInTheDocument();
  });
});

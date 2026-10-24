import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResearchTeardownApply } from "@/components/planning/research-teardown-apply";

const labels = {
  title: "Research insight",
  description: "Apply fields from research",
  apply: "Apply to brief",
  applying: "Applying…",
  applied: "Applied",
  nothingToApply: "No new fields to apply",
  error: "Could not apply research",
};

describe("ResearchTeardownApply", () => {
  it("uses the supplied route action and reports an empty application", async () => {
    const user = userEvent.setup();
    const applyAction = vi.fn(async () => ({ ok: true, appliedFields: [] }));

    render(
      <ResearchTeardownApply
        workspaceSlug="studio"
        contentItemId="content-1"
        researchTeardownId="teardown-1"
        editable
        labels={labels}
        applyAction={applyAction}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Apply to brief" }));

    expect(applyAction).toHaveBeenCalledWith({
      workspaceSlug: "studio",
      contentItemId: "content-1",
      researchTeardownId: "teardown-1",
    });
    expect(await screen.findByText("No new fields to apply")).toBeInTheDocument();
  });
});

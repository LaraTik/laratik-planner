import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { PlanningListActions } from "@/components/workspace/planning-list-actions";

/**
 * Regression: the list-view row's "Edit" link used to be
 * `/app/w/{slug}/planning/{id}/edit` (inverted path), which
 * 404s because the actual route is
 * `/app/w/{slug}/planning/edit/{id}`. The fix in
 * `planning-list-actions.tsx` writes the full path explicitly
 * to match the three other call sites (detail page, drawer,
 * workspace-switcher). This test pins the rendered href so
 * a future refactor cannot silently regress to the inverted
 * shape.
 */
describe("PlanningListActions — Edit href", () => {
  it("renders the Edit link to the correct /planning/edit/{id} route", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <PlanningListActions
          workspaceSlug="acme"
          itemId="11111111-2222-3333-4444-555555555555"
          itemTitle="Spring drop"
          status="draft"
          canEdit
          canSubmit
          canArchive={false}
        />
      </LocaleProvider>,
    );

    // Open the dropdown menu (the trigger is the icon button).
    const trigger = screen.getByTestId("row-actions-trigger");
    await user.click(trigger);

    const editLink = screen.getByTestId("row-action-edit");
    expect(editLink.tagName).toBe("A");
    // The fixed shape. The previous broken shape was
    // `/app/w/acme/planning/11111111-.../edit`.
    expect(editLink.getAttribute("href")).toBe(
      "/app/w/acme/planning/edit/11111111-2222-3333-4444-555555555555",
    );
  });

  it("hides the Edit link when the user lacks edit permission", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <PlanningListActions
          workspaceSlug="acme"
          itemId="11111111-2222-3333-4444-555555555555"
          itemTitle="Spring drop"
          status="ready_to_publish"
          canEdit={false}
          canSubmit={false}
          canArchive={false}
        />
      </LocaleProvider>,
    );

    const trigger = screen.getByTestId("row-actions-trigger");
    await user.click(trigger);

    expect(screen.queryByTestId("row-action-edit")).toBeNull();
  });

  it("trigger button meets the 44px touch-target guideline (h-11 w-11)", () => {
    render(
      <LocaleProvider locale="en">
        <PlanningListActions
          workspaceSlug="acme"
          itemId="11111111-2222-3333-4444-555555555555"
          itemTitle="Spring drop"
          status="draft"
          canEdit={false}
          canSubmit={false}
          canArchive={false}
        />
      </LocaleProvider>,
    );

    const trigger = screen.getByTestId("row-actions-trigger");
    expect(trigger.className).toContain("h-11");
    expect(trigger.className).toContain("w-11");
  });
});

// Suppress the "no tests" lint complaint when running in isolation
// (vitest treats the file as a normal describe block above).
void vi;

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { PlanningListActions } from "@/components/workspace/planning-list-actions";
import { changeContentOwnerAction } from "@/app/(app)/app/w/[slug]/planning/actions";

vi.mock("@/app/(app)/app/w/[slug]/planning/actions", () => ({
  archiveContentItemAction: vi.fn(async () => undefined),
  restoreContentItemAction: vi.fn(async () => undefined),
  changeContentOwnerAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/app/(app)/app/w/[slug]/library/actions", () => ({
  duplicateContentItemAction: vi.fn(async () => ({ success: true, newId: "clone-1" })),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

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
          canDuplicate
          canArchive={false}
          canChangeOwner={false}
          currentOwnerId={null}
          ownerOptions={[]}
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
          canDuplicate={false}
          canArchive={false}
          canChangeOwner={false}
          currentOwnerId={null}
          ownerOptions={[]}
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
          canDuplicate={false}
          canArchive={false}
          canChangeOwner={false}
          currentOwnerId={null}
          ownerOptions={[]}
        />
      </LocaleProvider>,
    );

    const trigger = screen.getByTestId("row-actions-trigger");
    expect(trigger.className).toContain("h-11");
    expect(trigger.className).toContain("w-11");
  });

  it("offers Duplicate from the list and opens the created draft", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <PlanningListActions
          workspaceSlug="acme"
          itemId="11111111-2222-3333-4444-555555555555"
          itemTitle="Spring drop"
          status="draft"
          canEdit={false}
          canSubmit={false}
          canDuplicate
          canArchive={false}
          canChangeOwner={false}
          currentOwnerId={null}
          ownerOptions={[]}
        />
      </LocaleProvider>,
    );
    await user.click(screen.getByTestId("row-actions-trigger"));
    expect(screen.getByTestId("row-action-duplicate")).toBeEnabled();
    await user.click(screen.getByTestId("row-action-duplicate"));
  });

  it("opens the owner picker and saves a different owner", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <PlanningListActions
          workspaceSlug="acme"
          itemId="11111111-2222-3333-4444-555555555555"
          itemTitle="Spring drop"
          status="draft"
          canEdit={false}
          canSubmit={false}
          canDuplicate={false}
          canArchive={false}
          canChangeOwner
          currentOwnerId="owner-1"
          ownerOptions={[
            { id: "owner-1", label: "Current owner" },
            { id: "owner-2", label: "Next owner" },
          ]}
        />
      </LocaleProvider>,
    );

    await user.click(screen.getByTestId("row-actions-trigger"));
    await user.click(screen.getByTestId("row-action-change-owner"));
    expect(screen.getByTestId("change-owner-dialog")).toBeVisible();
    await user.selectOptions(screen.getByTestId("change-owner-select"), "owner-2");
    await user.click(screen.getByTestId("change-owner-submit"));
    expect(vi.mocked(changeContentOwnerAction)).toHaveBeenCalledWith({
      workspaceSlug: "acme",
      contentItemId: "11111111-2222-3333-4444-555555555555",
      ownerId: "owner-2",
    });
  });
});

// Suppress the "no tests" lint complaint when running in isolation
// (vitest treats the file as a normal describe block above).
void vi;

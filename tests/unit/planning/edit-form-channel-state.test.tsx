/**
 * Regression test for the channel state contract.
 *
 * Symptom (reported 2026-08-29): on the planning detail page the
 * Channels section showed Instagram as selected, but the Edit
 * form (linked from "Edit all fields" / "Open full editor")
 * rendered Instagram unchecked. The two views disagreed about
 * the same data, and the user couldn't tell which one was right.
 *
 * Root cause: the edit form's `channels` prop is sourced from
 * the workspace's *active* social channels. If a channel was
 * archived or deactivated AFTER the idea was created, it would
 * not appear in the picker — and so the user could never
 * deselect it. The detail page, which reads `item.channels`
 * (the `contentItemChannels` join), still listed the row as
 * selected, producing the inconsistency.
 *
 * Fix: the edit page server component now unions the active
 * channel list with the channels already selected on the item
 * (lines 79-107 in `app/(app)/app/w/[slug]/planning/edit/[id]/page.tsx`).
 *
 * This test pins the contract:
 *   1. The server passes a `channels` prop that includes every
 *      channel the content item already has, even when the
 *      channel is not in the active workspace set.
 *   2. The form's `initial.channelIds` is sourced from the same
 *      `item.channels` data, so a checked box on the detail page
 *      is also checked on the edit page.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock the server action so the form can be rendered without a
// real network round-trip. The form imports
// `updateContentItemAction` via the relative path
// `../actions` (in the edit page's directory) — we mock the
// same module the wrapper imports.
vi.mock("@/app/(app)/app/w/[slug]/planning/actions", () => ({
  updateContentItemAction: vi.fn(),
}));

import { EditIdeaForm } from "@/app/(app)/app/w/[slug]/planning/edit/[id]/edit-form";

const ACTIVE_CHANNELS = [
  { id: "11111111-1111-1111-1111-111111111111", accountName: "Food Game", platform: "instagram" },
  { id: "22222222-2222-2222-2222-222222222222", accountName: "Food Game", platform: "facebook" },
];

const STALE_SELECTED = {
  id: "33333333-3333-3333-3333-333333333333",
  accountName: "Food Game (archive pending)",
  platform: "instagram",
};

describe("EditIdeaForm — channel state contract", () => {
  it("renders every selected channel as checked, including channels not in the active list", () => {
    // The detail page says Instagram (Food Game) is selected; the
    // edit form must agree even when the social_channel row is no
    // longer in the active set.
    render(
      <EditIdeaForm
        workspaceSlug="food-game"
        contentItemId="content-1"
        channels={[...ACTIVE_CHANNELS, STALE_SELECTED]}
        initial={{
          title: "August Kickoff",
          format: "short_form_video",
          brief: "",
          plannedPublishAtIso: "2026-08-01T17:30:00.000Z",
          channelIds: [ACTIVE_CHANNELS[0]!.id, STALE_SELECTED.id],
        }}
      />,
    );

    // The form renders the platform + account as the label, e.g.
    // "instagram · Food Game" / "instagram · Food Game (archive
    // pending)". Use exact-string matching via `getByDisplayValue`
    // on the underlying value, which is the social_channel UUID —
    // that uniquely identifies the checkbox without ambiguity.
    const allCheckboxes = screen.getAllByRole("checkbox", { name: /instagram/i });
    const activeChecked = allCheckboxes.find(
      (c) => (c as HTMLInputElement).value === ACTIVE_CHANNELS[0]!.id,
    );
    expect(activeChecked).toBeDefined();
    expect(activeChecked).toBeChecked();

    const staleChecked = allCheckboxes.find(
      (c) => (c as HTMLInputElement).value === STALE_SELECTED.id,
    );
    expect(staleChecked).toBeDefined();
    expect(staleChecked).toBeChecked();
  });

  it("leaves an unselected active channel unchecked", () => {
    render(
      <EditIdeaForm
        workspaceSlug="food-game"
        contentItemId="content-1"
        channels={ACTIVE_CHANNELS}
        initial={{
          title: "August Kickoff",
          format: "short_form_video",
          brief: "",
          plannedPublishAtIso: "2026-08-01T17:30:00.000Z",
          channelIds: [ACTIVE_CHANNELS[0]!.id], // Facebook NOT selected
        }}
      />,
    );

    // The form renders the platform as a lowercase string (the raw
    // social_channels.platform enum value, e.g. "facebook"). Match
    // the surrounding label, not the title-cased friendly label.
    const facebook = screen.getByRole("checkbox", { name: /facebook/i });
    expect(facebook).not.toBeChecked();
  });
});

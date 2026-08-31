import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PeopleCell } from "@/components/workspace/people-cell";
import type { EnrichedOwner } from "@/lib/content/enriched-list";

/**
 * PeopleCell — the role-labelled Owner + Designer cell for the
 * planning list row. The contract:
 *  - Two distinct role rows, even when one is empty.
 *  - The empty state is discoverable (italic + "Unassigned").
 *  - Each row carries a stable `data-role` attribute for tests
 *    + assistive tech.
 *  - The role label is hidden on mobile (where the cell collapses
 *    into a single "Owner + Designer" sr-only label) and visible
 *    on desktop (`lg:` and up).
 *
 * See AGENTS.md §C (one concept = one visual language) and
 * §B (progressive disclosure) for the rule that drives this.
 */

const owner: EnrichedOwner = {
  id: "u1",
  name: "Ghaleb Karmanshahi",
  displayName: "Ghaleb K.",
  avatarPath: null,
};

const designer: EnrichedOwner = {
  id: "u2",
  name: "Sarah Ahmed",
  displayName: "Sarah A.",
  avatarPath: null,
};

describe("PeopleCell", () => {
  it("renders the role label and name for both owner and designer", () => {
    render(<PeopleCell owner={owner} designer={designer} />);
    expect(screen.getByTestId("people-cell-owner")).toHaveTextContent("Ghaleb K.");
    expect(screen.getByTestId("people-cell-designer")).toHaveTextContent("Sarah A.");
  });

  it("keeps the two roles visually distinct via data-role + data-person-id", () => {
    render(<PeopleCell owner={owner} designer={designer} />);
    expect(screen.getByTestId("people-cell-owner")).toHaveAttribute("data-role", "owner");
    expect(screen.getByTestId("people-cell-designer")).toHaveAttribute("data-role", "designer");
    expect(screen.getByTestId("people-cell-owner")).toHaveAttribute("data-person-id", "u1");
    expect(screen.getByTestId("people-cell-designer")).toHaveAttribute("data-person-id", "u2");
  });

  it("renders 'Unassigned' in italic when the owner is missing", () => {
    render(<PeopleCell owner={null} designer={designer} />);
    const ownerRow = screen.getByTestId("people-cell-owner");
    expect(ownerRow).toHaveAttribute("data-empty", "true");
    // The data-person-id attribute is omitted when the person is
    // missing — the data-empty flag is the canonical signal. A
    // regression that re-introduces `data-person-id=""` as a string
    // would break the row's getByRole lookup (e.g. in the activity
    // timeline) and is caught by the planning-list-item test.
    expect(ownerRow).not.toHaveAttribute("data-person-id");
    expect(ownerRow).toHaveTextContent("Unassigned");
  });

  it("renders 'Unassigned' in italic when the designer is missing", () => {
    render(<PeopleCell owner={owner} designer={null} />);
    const designerRow = screen.getByTestId("people-cell-designer");
    expect(designerRow).toHaveAttribute("data-empty", "true");
    expect(designerRow).toHaveTextContent("Unassigned");
  });

  it("renders both empty rows when neither is set (no layout shift)", () => {
    render(<PeopleCell owner={null} designer={null} />);
    expect(screen.getByTestId("people-cell-owner")).toHaveAttribute("data-empty", "true");
    expect(screen.getByTestId("people-cell-designer")).toHaveAttribute("data-empty", "true");
  });
});

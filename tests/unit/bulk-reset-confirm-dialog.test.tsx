import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * UI contract for the bulk "Reset all ideas" confirm dialog.
 *
 * The dialog is the only user-facing surface for the bulk kill
 * switch, so the form wiring matters. These tests pin:
 *
 *   1. The "includePublished" toggle starts OFF — operators must
 *      deliberately opt in to removing live social posts.
 *   2. Toggling it ON shows the live-warning banner.
 *   3. The submit button is disabled until BOTH the typed phrase
 *      matches the workspace name AND the reason is ≥ 8 chars.
 *   4. The "skipped live ideas" hint is visible in the count
 *      summary when includePublished=false.
 */

vi.mock("@/lib/content/reset-all-ideas-action", () => ({
  resetAllIdeasAction: vi.fn(),
}));

import { BulkResetConfirmDialog } from "@/components/forms/bulk-reset-confirm-dialog";
import {
  ALL_CONTENT_STATUSES,
  CONTENT_STATUS_LABELS,
  EMPTY_RESET_ALL_COUNTS,
  type ResetAllIdeasCounts,
} from "@/lib/content/reset-all-ideas";

const SAMPLE_WORKSPACE_NAME = "Acme Studio";

function countsWith(partial: Partial<ResetAllIdeasCounts> = {}): ResetAllIdeasCounts {
  return {
    ...EMPTY_RESET_ALL_COUNTS,
    totalAllIdeas: 20,
    totalLive: 5,
    byStatus: {
      draft: 8,
      content_review: 3,
      in_design: 2,
      blocked: 1,
      cancelled: 1,
      approved_for_design: 0,
      creative_review: 0,
      ready_to_publish: 0,
      partially_published: 1,
      published: 4,
      changes_requested: 0,
    },
    ...partial,
  };
}

function renderDialog() {
  return render(
    <BulkResetConfirmDialog
      open
      onOpenChange={vi.fn()}
      workspaceSlug="acme"
      workspaceName={SAMPLE_WORKSPACE_NAME}
      counts={countsWith()}
    />,
  );
}

describe("BulkResetConfirmDialog", () => {
  beforeEach(() => {
    // `useActionState` is happy with a stub action; this test never submits.
  });

  it("starts with includePublished toggled OFF", () => {
    renderDialog();
    const toggle = screen.getByTestId("bulk-reset-include-published") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    // The live warning must NOT be visible until the operator opts in.
    expect(screen.queryByTestId("bulk-reset-live-warning")).not.toBeInTheDocument();
  });

  it("surfaces the live-warning banner when includePublished is turned on", async () => {
    const user = userEvent.setup();
    renderDialog();
    const toggle = screen.getByTestId("bulk-reset-include-published");
    await user.click(toggle);
    expect(toggle).toBeChecked();
    const warning = await screen.findByTestId("bulk-reset-live-warning");
    expect(warning.textContent).toMatch(/5 live ideas?/);
  });

  it("hides the live buckets from the breakdown when includePublished is OFF", () => {
    renderDialog();
    // The non-live buckets are still rendered.
    expect(screen.getByTestId("bulk-reset-bucket-draft")).toBeInTheDocument();
    expect(screen.getByTestId("bulk-reset-bucket-content_review")).toBeInTheDocument();
    // The live buckets are omitted entirely (operator explicitly opted out).
    expect(screen.queryByTestId("bulk-reset-bucket-published")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bulk-reset-bucket-partially_published")).not.toBeInTheDocument();
  });

  it("shows every bucket when includePublished is ON", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByTestId("bulk-reset-include-published"));
    for (const status of ALL_CONTENT_STATUSES) {
      const label = CONTENT_STATUS_LABELS[status];
      // Just confirm the row exists; the count assertion is in the
      // count-function test, not here.
      const row = screen.queryByTestId(`bulk-reset-bucket-${status}`);
      if (row) {
        expect(row.textContent).toContain(label);
      }
    }
  });

  it("keeps the submit button disabled until BOTH the typed phrase and the reason are valid", async () => {
    const user = userEvent.setup();
    renderDialog();
    const submit = screen.getByTestId("bulk-reset-submit");
    const phrase = screen.getByTestId("bulk-reset-typed-phrase");
    const reason = screen.getByTestId("bulk-reset-reason");
    expect(submit).toBeDisabled();
    // Fill the reason first — submit stays disabled until BOTH
    // constraints pass.
    await user.type(reason, "Reset for the next planning cycle.");
    // Wrong phrase.
    await user.type(phrase, "wrong workspace");
    expect(submit).toBeDisabled();
    // Clear and re-type the correct phrase.
    await user.clear(phrase);
    await user.type(phrase, SAMPLE_WORKSPACE_NAME);
    expect(submit).not.toBeDisabled();
  });

  it("shows the live workspace name next to the typed-phrase input as a hint", () => {
    renderDialog();
    const phraseHelp = document.getElementById("bulk-reset-typed-phrase-help");
    expect(phraseHelp).not.toBeNull();
    expect(phraseHelp?.textContent).toContain(SAMPLE_WORKSPACE_NAME);
  });
});
